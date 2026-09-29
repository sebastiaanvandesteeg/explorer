// Soft, smooth overlays drawn from per-tile masks: fog of war and the shallow-water glow around
// islands. A small canvas (a few pixels per tile) is blurred and mapped onto the isometric grid
// with an affine transform, which gives the gentle gradients of the concept art without tile steps.
import { HALF_H, HALF_W, isLandTerrain, type GameState } from "@explorer/shared";
import { Matrix, Sprite, Texture } from "pixi.js";

const PX_PER_TILE = 2;

function isoSprite(canvas: HTMLCanvasElement): { sprite: Sprite; texture: Texture } {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "linear";
  const sprite = new Sprite(texture);
  // Mask pixel (u, v) → tile (u / s, v / s) → screen ((x - y) * 16, (x + y) * 8).
  const s = PX_PER_TILE;
  sprite.setFromMatrix(new Matrix(HALF_W / s, HALF_H / s, -HALF_W / s, HALF_H / s, 0, 0));
  return { sprite, texture };
}

function blurInto(target: HTMLCanvasElement, source: HTMLCanvasElement, radius: number): void {
  const ctx = target.getContext("2d")!;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
}

/** Fog of war: opaque over unexplored tiles, fading softly into explored ones. */
export class FogLayer {
  readonly sprite: Sprite;
  private readonly texture: Texture;
  private readonly raw = document.createElement("canvas");
  private readonly soft = document.createElement("canvas");
  private dirty = true;
  private cooldown = 0;

  constructor(private state: GameState) {
    const w = state.world;
    // One tile of padding so the fog also covers the ocean beyond the map edge.
    for (const c of [this.raw, this.soft]) {
      c.width = (w.width + 2) * PX_PER_TILE;
      c.height = (w.height + 2) * PX_PER_TILE;
    }
    const { sprite, texture } = isoSprite(this.soft);
    this.sprite = sprite;
    this.texture = texture;
    const o = new Matrix(HALF_W, HALF_H, -HALF_W, HALF_H, 0, 0).apply({ x: -1, y: -1 });
    this.sprite.position.set(o.x, o.y);
  }

  reset(state: GameState): void {
    this.state = state;
    this.dirty = true;
  }

  invalidate(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (!this.dirty || this.cooldown > 0) return;
    this.dirty = false;
    this.cooldown = 0.2;
    const w = this.state.world;
    const ctx = this.raw.getContext("2d")!;
    ctx.fillStyle = "#0d222a";
    ctx.fillRect(0, 0, this.raw.width, this.raw.height);
    const explored = this.state.explored;
    for (let y = 0; y < w.height; y++) {
      let run = -1;
      for (let x = 0; x <= w.width; x++) {
        const open = x < w.width && explored[y * w.width + x] === 1;
        if (open && run < 0) run = x;
        if (!open && run >= 0) {
          ctx.clearRect(
            (run + 1) * PX_PER_TILE,
            (y + 1) * PX_PER_TILE,
            (x - run) * PX_PER_TILE,
            PX_PER_TILE,
          );
          run = -1;
        }
      }
    }
    blurInto(this.soft, this.raw, 1.6);
    this.texture.source.update();
  }
}

/** Turquoise glow in the shallows around every coast (static per world). */
export function shallowGlow(state: GameState): Sprite {
  const w = state.world;
  const raw = document.createElement("canvas");
  const soft = document.createElement("canvas");
  for (const c of [raw, soft]) {
    c.width = w.width * PX_PER_TILE;
    c.height = w.height * PX_PER_TILE;
  }
  const ctx = raw.getContext("2d")!;
  const alpha = [0, 0.62, 0.42, 0.22, 0.08];
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      const k = y * w.width + x;
      const d = isLandTerrain(w.terrain[k]!) ? 1 : w.shore[k]!;
      const a = alpha[d] ?? 0;
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(67, 161, 151, ${a})`;
      ctx.fillRect(x * PX_PER_TILE, y * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);
    }
  }
  blurInto(soft, raw, 2.2);
  return isoSprite(soft).sprite;
}

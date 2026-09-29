// Fog of war as a soft overlay drawn from a per-tile mask. A small canvas (a few pixels per tile)
// is blurred and mapped onto the isometric grid with an affine transform, which gives gentle
// gradients without tile steps. It takes its colour from the biome region, so fog around the
// Infernal Isles is dark red.
import { BIOMES, HALF_H, HALF_W, type GameState, type WorldMap } from "@explorer/shared";
import { Matrix, Sprite, Texture } from "pixi.js";
import { ATMOSPHERE, OCEAN } from "./biomeStyle";

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

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Per-tile fog colour from the world's biome regions (open ocean gets the default). */
function fogColours(world: WorldMap): Uint8Array {
  const out = new Uint8Array(world.width * world.height * 3);
  const cache = new Map<number, [number, number, number]>();
  for (let k = 0; k < world.biome.length; k++) {
    const idx = world.biome[k]!;
    let c = cache.get(idx);
    if (!c) {
      const b = BIOMES[idx];
      c = rgb((b ? ATMOSPHERE[b] : OCEAN).fog);
      cache.set(idx, c);
    }
    out.set(c, k * 3);
  }
  return out;
}

/** Fog of war: opaque over unexplored tiles, fading softly into explored ones. */
export class FogLayer {
  readonly sprite: Sprite;
  private readonly texture: Texture;
  private readonly raw = document.createElement("canvas");
  private readonly soft = document.createElement("canvas");
  private colours: Uint8Array;
  private dirty = true;
  private cooldown = 0;

  constructor(private state: GameState) {
    const w = state.world;
    // One tile of padding so the fog also covers the ocean beyond the map edge.
    for (const c of [this.raw, this.soft]) {
      c.width = (w.width + 2) * PX_PER_TILE;
      c.height = (w.height + 2) * PX_PER_TILE;
    }
    this.colours = fogColours(w);
    const { sprite, texture } = isoSprite(this.soft);
    this.sprite = sprite;
    this.texture = texture;
    const o = new Matrix(HALF_W, HALF_H, -HALF_W, HALF_H, 0, 0).apply({ x: -1, y: -1 });
    this.sprite.position.set(o.x, o.y);
  }

  reset(state: GameState): void {
    this.state = state;
    this.colours = fogColours(state.world);
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
    const img = ctx.createImageData(this.raw.width, this.raw.height);
    const data = img.data;
    const edge = rgb(OCEAN.fog);
    const stride = this.raw.width;
    for (let py = 0; py < this.raw.height; py++) {
      const ty = Math.floor(py / PX_PER_TILE) - 1;
      for (let px = 0; px < stride; px++) {
        const tx = Math.floor(px / PX_PER_TILE) - 1;
        const i = (py * stride + px) * 4;
        const inside = tx >= 0 && ty >= 0 && tx < w.width && ty < w.height;
        const k = ty * w.width + tx;
        if (inside && this.state.explored[k]) continue;
        const c = inside ? this.colours.subarray(k * 3, k * 3 + 3) : edge;
        data[i] = c[0]!;
        data[i + 1] = c[1]!;
        data[i + 2] = c[2]!;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    blurInto(this.soft, this.raw, 1.6);
    this.texture.source.update();
  }
}

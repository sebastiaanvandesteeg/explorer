// Fog of war as a soft overlay drawn from a per-tile mask. The map is cut into blocks; each is a
// small canvas (a few pixels per tile) that is blurred and mapped onto the isometric grid with an
// affine transform, which gives gentle gradients without tile steps. Only the blocks a reveal
// touches are redrawn, so uncovering sea is cheap however big the world is. The fog takes its
// colour from the biome region, so fog around the Infernal Isles is dark red.
import { BIOMES, HALF_H, HALF_W, type GameState, type WorldMap } from "@explorer/shared";
import { Container, Matrix, Sprite, Texture } from "pixi.js";
import { ATMOSPHERE, OCEAN } from "./biomeStyle";

const PX_PER_TILE = 2;
/** Tiles along a block's side, and how many tiles of its neighbours it looks at to blur its edge. */
const BLOCK = 48;
const MARGIN = 3;
/** One tile of padding so the fog also covers the ocean beyond the map edge. */
const PAD = 1;
/** Blocks redrawn per update while a reveal is in progress. */
const PER_UPDATE = 24;

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
    out[k * 3] = c[0];
    out[k * 3 + 1] = c[1];
    out[k * 3 + 2] = c[2];
  }
  return out;
}

interface Block {
  sprite: Sprite;
  texture: Texture;
  canvas: HTMLCanvasElement;
}

/** Fog of war: opaque over unexplored tiles, fading softly into explored ones. */
export class FogLayer {
  /** One sprite per block of the map; blocks with no fog in or near them are hidden. */
  readonly container = new Container();
  private readonly blocks = new Map<number, Block>();
  private readonly dirty = new Set<number>();
  private readonly cols: number;
  private readonly rows: number;
  private readonly raw = document.createElement("canvas");
  private readonly soft = document.createElement("canvas");
  private colours: Uint8Array;
  private cooldown = 0;

  constructor(private state: GameState) {
    const w = state.world;
    this.cols = Math.ceil((w.width + PAD * 2) / BLOCK);
    this.rows = Math.ceil((w.height + PAD * 2) / BLOCK);
    const scratch = (BLOCK + MARGIN * 2) * PX_PER_TILE;
    for (const c of [this.raw, this.soft]) {
      c.width = scratch;
      c.height = scratch;
    }
    this.colours = fogColours(w);
    this.invalidate();
    this.flush(Infinity);
  }

  /** Swap in a new state (after a resync) and redraw everything. */
  reset(state: GameState): void {
    this.state = state;
    this.colours = fogColours(state.world);
    this.invalidate();
    this.flush(Infinity);
  }

  /**
   * Redraw after tiles were explored: just the blocks those tiles are in or next to. Without
   * tiles (a resync) everything is redrawn.
   */
  invalidate(tiles?: readonly number[]): void {
    if (!tiles) {
      for (let b = 0; b < this.cols * this.rows; b++) this.dirty.add(b);
      return;
    }
    const W = this.state.world.width;
    for (const k of tiles) {
      const x = (k % W) + PAD;
      const y = Math.floor(k / W) + PAD;
      const bx0 = Math.max(0, Math.floor((x - MARGIN) / BLOCK));
      const bx1 = Math.min(this.cols - 1, Math.floor((x + MARGIN) / BLOCK));
      const by0 = Math.max(0, Math.floor((y - MARGIN) / BLOCK));
      const by1 = Math.min(this.rows - 1, Math.floor((y + MARGIN) / BLOCK));
      for (let by = by0; by <= by1; by++)
        for (let bx = bx0; bx <= bx1; bx++) this.dirty.add(by * this.cols + bx);
    }
  }

  update(dt: number): void {
    this.cooldown -= dt;
    if (this.dirty.size === 0 || this.cooldown > 0) return;
    this.cooldown = 0.2;
    this.flush(PER_UPDATE);
  }

  /** Redraw up to `limit` dirty blocks. */
  private flush(limit: number): void {
    let done = 0;
    for (const key of this.dirty) {
      if (done++ >= limit) break;
      this.dirty.delete(key);
      this.drawBlock(key % this.cols, Math.floor(key / this.cols));
    }
  }

  private drawBlock(bx: number, by: number): void {
    const w = this.state.world;
    const key = by * this.cols + bx;
    // The block's first tile; the area drawn for the blur reaches MARGIN tiles beyond it.
    const tx0 = bx * BLOCK - PAD;
    const ty0 = by * BLOCK - PAD;
    const size = (BLOCK + MARGIN * 2) * PX_PER_TILE;
    const ctx = this.raw.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const edge = rgb(OCEAN.fog);
    let fogged = 0;
    for (let py = 0; py < size; py++) {
      const ty = ty0 - MARGIN + Math.floor(py / PX_PER_TILE);
      for (let px = 0; px < size; px++) {
        const tx = tx0 - MARGIN + Math.floor(px / PX_PER_TILE);
        const inside = tx >= 0 && ty >= 0 && tx < w.width && ty < w.height;
        const k = ty * w.width + tx;
        if (inside && this.state.explored[k]) continue;
        const i = (py * size + px) * 4;
        if (inside) {
          data[i] = this.colours[k * 3]!;
          data[i + 1] = this.colours[k * 3 + 1]!;
          data[i + 2] = this.colours[k * 3 + 2]!;
        } else {
          data[i] = edge[0];
          data[i + 1] = edge[1];
          data[i + 2] = edge[2];
        }
        data[i + 3] = 255;
        fogged++;
      }
    }
    let block = this.blocks.get(key);
    if (fogged === 0) {
      // Nothing foggy in or near this block: nothing to draw.
      if (block) block.sprite.visible = false;
      return;
    }
    ctx.putImageData(img, 0, 0);
    const soft = this.soft.getContext("2d")!;
    soft.clearRect(0, 0, size, size);
    soft.filter = "blur(1.6px)";
    soft.drawImage(this.raw, 0, 0);
    soft.filter = "none";
    if (!block) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = BLOCK * PX_PER_TILE;
      const texture = Texture.from(canvas);
      texture.source.scaleMode = "linear";
      const sprite = new Sprite(texture);
      // Block pixel (u, v) → tile (u / s, v / s) → screen ((x - y) * 16, (x + y) * 8).
      const s = PX_PER_TILE;
      sprite.setFromMatrix(new Matrix(HALF_W / s, HALF_H / s, -HALF_W / s, HALF_H / s, 0, 0));
      sprite.position.set((tx0 - ty0) * HALF_W, (tx0 + ty0) * HALF_H);
      this.container.addChild(sprite);
      block = { sprite, texture, canvas };
      this.blocks.set(key, block);
    }
    // Keep only the block's own tiles: its neighbours draw the rest.
    const inner = block.canvas.getContext("2d")!;
    const own = BLOCK * PX_PER_TILE;
    const m = MARGIN * PX_PER_TILE;
    inner.clearRect(0, 0, own, own);
    inner.drawImage(this.soft, m, m, own, own, 0, 0, own, own);
    block.texture.source.update();
    block.sprite.visible = true;
  }
}

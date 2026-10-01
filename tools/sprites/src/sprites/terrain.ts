// The paved Path tile and the tiling ocean texture. Ground, beaches, cliffs, foam and shallows are
// not sprites: @explorer/art paints them per pixel from the world at runtime.
import { HALF_H, HALF_W, TILE_H, TILE_W } from "@explorer/shared";
import { Canvas } from "../canvas";
import { hash3, prng } from "../noise3";
import { rampColor, shade, type Rgba } from "../palette";
import type { Sprite } from "../sprite";

/** Pixel (px, py) of a 32×16 tile → position inside the tile in world units (0..1). */
function tileLocal(px: number, py: number): { fx: number; fy: number } {
  const a = (px + 0.5 - HALF_W) / HALF_W;
  const b = (py + 0.5) / HALF_H;
  return { fx: (a + b) / 2, fy: (b - a) / 2 };
}

/** Exact seamless 2:1 diamond (rows are 2, 6, …, 30, 30, …, 2 pixels wide). */
function inDiamond(px: number, py: number): boolean {
  const r = py < HALF_H ? py : TILE_H - 1 - py;
  const hw = 2 * r + 1;
  return px >= HALF_W - hw && px < HALF_W + hw;
}

/** Noise that repeats every tile, so all variants of a terrain type join seamlessly. */
function periodicNoise(fx: number, fy: number, cells: number, seed: number): number {
  const x = fx * cells;
  const y = fy * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (i: number, j: number) =>
    hash3(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, 0, seed);
  const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * s(sx);
  const bot = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * s(sx);
  return top + (bot - top) * s(sy);
}

function tile(
  name: string,
  color: (px: number, py: number, fx: number, fy: number) => Rgba | null,
): Sprite {
  const c = new Canvas(TILE_W, TILE_H);
  for (let py = 0; py < TILE_H; py++) {
    for (let px = 0; px < TILE_W; px++) {
      if (!inDiamond(px, py)) continue;
      const { fx, fy } = tileLocal(px, py);
      const col = color(px, py, fx, fy);
      if (col) c.set(px, py, col);
    }
  }
  return { name, canvas: c, anchorX: HALF_W, anchorY: 0 };
}

/** Paved path for the Path building: flagstones on dirt. */
function path(): Sprite {
  return tile("t_path", (px, py, fx, fy) => {
    const sx = Math.floor(fx * 3 + (Math.floor(fy * 3) % 2) * 0.5);
    const sy = Math.floor(fy * 3);
    const lx = (fx * 3 + (sy % 2) * 0.5) % 1;
    const ly = (fy * 3) % 1;
    const seam = lx < 0.14 || ly < 0.14;
    if (seam) return rampColor("soil", 2);
    const tint = hash3(sx, sy, 0, 5);
    return shade("stone", 0.45 + tint * 0.25, px, py, 0.3);
  });
}

/** Seamless tiling ocean texture (not in the atlas: used with a TilingSprite). */
export function oceanFrame(frame: number, size = 128): Canvas {
  const c = new Canvas(size, size / 2);
  const w = c.width;
  const h = c.height;
  const periodic = (x: number, y: number, cells: number, seed: number) =>
    periodicNoise(x / w, y / h, cells, seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = periodic(x, y, 8, 60) * 0.65 + periodic(x, y, 16, 61) * 0.35;
      c.set(x, y, shade("deepWater", 0.5 + (n - 0.5) * 0.7, x, y, 0.6));
    }
  }
  // Wave glints: short horizontal dashes drifting with the frame.
  const rand = prng(4040);
  for (let i = 0; i < 70; i++) {
    const bx = Math.floor(rand() * w);
    const by = Math.floor(rand() * h);
    const len = 2 + Math.floor(rand() * 4);
    const phase = (i + frame) % 3;
    const colour = rampColor("water", phase === 0 ? 5 : phase === 1 ? 4 : 3);
    const dx = frame * (i % 2 === 0 ? 1 : -1);
    for (let k = 0; k < len; k++) {
      c.set((((bx + k + dx) % w) + w) % w, by, colour);
    }
    if (phase === 0 && len > 3)
      c.set((((bx + 1 + dx) % w) + w) % w, (by + 1) % h, rampColor("water", 2));
  }
  return c;
}

export function terrainSprites(): Sprite[] {
  return [path()];
}

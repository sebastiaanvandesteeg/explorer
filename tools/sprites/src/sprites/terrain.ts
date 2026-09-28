// Terrain tiles, cliff faces, shallow-water overlays, foam, fog and the tiling ocean texture.
import { HALF_H, HALF_W, TILE_H, TILE_W } from "@explorer/shared";
import { Canvas } from "../canvas";
import { hash3, prng } from "../noise3";
import { bayer, hexToRgba, rampColor, shade, type RampName, type Rgba } from "../palette";
import type { Sprite } from "../sprite";

/** Pixel (px, py) of a 32×16 tile → position inside the tile in world units (0..1). */
function tileLocal(px: number, py: number): { fx: number; fy: number } {
  const a = (px + 0.5 - HALF_W) / HALF_W;
  const b = (py + 0.5) / HALF_H;
  return { fx: (a + b) / 2, fy: (b - a) / 2 };
}

/** Exact seamless 2:1 diamond (rows are 2, 6, …, 30, 30, …, 2 pixels wide). */
export function inDiamond(px: number, py: number): boolean {
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

function groundTile(
  name: string,
  rampName: RampName,
  base: number,
  variant: number,
  detail: (px: number, py: number, rand: number) => Rgba | null,
): Sprite {
  return tile(name, (px, py, fx, fy) => {
    const n = periodicNoise(fx, fy, 4, 11) * 0.6 + periodicNoise(fx, fy, 8, 12) * 0.4;
    const extra = detail(px, py, hash3(px, py, variant, 91));
    if (extra) return extra;
    return shade(rampName, base + (n - 0.5) * 0.34, px, py, 0.5);
  });
}

function grass(variant: number): Sprite {
  return groundTile(`t_grass_${variant}`, "grass", 0.55, variant, (px, py, r) => {
    if (r > 0.94) return rampColor("grass", 5);
    if (r < 0.04) return rampColor("grass", 2);
    if (variant === 3 && r > 0.9) return rampColor("sunflower", 3);
    return null;
  });
}

function sand(variant: number): Sprite {
  return groundTile(`t_sand_${variant}`, "sand", 0.58, variant, (_px, _py, r) => {
    if (r > 0.95) return rampColor("sand", 5);
    if (r < 0.03) return rampColor("sand", 1);
    return null;
  });
}

function stony(variant: number): Sprite {
  return groundTile(`t_rock_${variant}`, "rock", 0.62, variant, (px, py, r) => {
    if (r > 0.9) return rampColor("rock", 6);
    if (r < 0.08) return rampColor("rock", 2);
    if (variant === 1 && hash3(px >> 2, py >> 1, 0, 4) > 0.85) return rampColor("moss", 2);
    return null;
  });
}

function dirt(variant: number): Sprite {
  return groundTile(`t_dirt_${variant}`, "soil", 0.62, variant, (_px, _py, r) => {
    if (r > 0.93) return rampColor("stone", 3);
    if (r < 0.05) return rampColor("soil", 1);
    return null;
  });
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

type Side = "-x" | "-y" | "+x" | "+y";
const SIDES: Side[] = ["-x", "-y", "+x", "+y"];

function edgeDistance(side: Side, fx: number, fy: number): number {
  switch (side) {
    case "-x":
      return fx;
    case "-y":
      return fy;
    case "+x":
      return 1 - fx;
    case "+y":
      return 1 - fy;
  }
}

/** Coordinate along an edge, continuous across neighbouring tiles. */
function edgeAlong(side: Side, fx: number, fy: number): number {
  return side === "-x" || side === "+x" ? fy : fx;
}

function shallow(level: 1 | 2): Sprite {
  const colour = hexToRgba(level === 1 ? "#43a197" : "#2e908f", level === 1 ? 150 : 95);
  const ripple = hexToRgba("#6cb9a8", level === 1 ? 170 : 110);
  return tile(`w_shallow_${level}`, (_px, _py, fx, fy) => {
    const n = periodicNoise(fx, fy, 4, 40 + level);
    return n > 0.72 ? ripple : colour;
  });
}

function foam(side: Side): Sprite {
  const white = rampColor("foam", 3);
  const pale = hexToRgba("#cfe3d6", 200);
  const faint = hexToRgba("#a0c4b6", 140);
  return tile(`w_foam_${side}`, (_px, _py, fx, fy) => {
    const d = edgeDistance(side, fx, fy);
    const u = edgeAlong(side, fx, fy);
    const wobble = (periodicNoise(u, 0.5, 6, 70) - 0.5) * 0.08;
    const dd = d + wobble;
    if (dd < 0.07) return white;
    if (dd < 0.12) return pale;
    if (dd > 0.2 && dd < 0.25 && periodicNoise(u, 0.2, 8, 71) > 0.45) return faint;
    return null;
  });
}

function kelp(variant: number): Sprite {
  const rand = prng(9000 + variant);
  const blobs = Array.from({ length: 4 }, () => ({
    fx: 0.25 + rand() * 0.5,
    fy: 0.25 + rand() * 0.5,
    r: 0.12 + rand() * 0.14,
  }));
  const dark = hexToRgba("#0f3a3f", 110);
  const darker = hexToRgba("#0b2e33", 140);
  return tile(`w_kelp_${variant}`, (px, py, fx, fy) => {
    let v = 0;
    for (const b of blobs) v = Math.max(v, 1 - Math.hypot(fx - b.fx, (fy - b.fy) * 1.2) / b.r);
    if (v <= 0) return null;
    if (v > 0.55 && bayer(px, py) < 0.7) return darker;
    return bayer(px, py) < v * 1.6 ? dark : null;
  });
}

function fog(): Sprite {
  return tile("f_fog", (px, py, fx, fy) => {
    const n = periodicNoise(fx, fy, 3, 80);
    return shade("fog", 0.35 + (n - 0.5) * 0.5, px, py, 0.6);
  });
}

function fogEdge(side: Side): Sprite {
  const colour = rampColor("fog", 1);
  return tile(`f_edge_${side}`, (px, py, fx, fy) => {
    const d = edgeDistance(side, fx, fy);
    const u = edgeAlong(side, fx, fy);
    const reach = 0.45 + (periodicNoise(u, 0.3, 5, 81) - 0.5) * 0.25;
    if (d > reach) return null;
    const density = 1 - d / reach;
    return bayer(px, py) < density * 1.15 ? colour : null;
  });
}

export type Lip = "grass" | "sand" | "rock" | "dirt";
export const FACE_HEIGHTS = [4, 8, 12, 16, 20, 24, 28] as const;
export const LIPS: Lip[] = ["grass", "sand", "rock", "dirt"];

/** First face row under the diamond for a column (left half; mirror for the right half). */
function faceTop(px: number): number {
  const col = px < HALF_W ? px : TILE_W - 1 - px;
  const r = Math.min(7, Math.ceil((15 - col) / 2));
  return TILE_H - 1 - r + 1;
}

/** Vertical cliff face below a tile edge. `side` "left" faces +y (lit), "right" faces +x. */
function face(side: "left" | "right", height: number, lip: Lip): Sprite {
  const c = new Canvas(TILE_W, TILE_H + height + 1);
  const lit = side === "left";
  const lipRamp: RampName =
    lip === "grass" ? "grass" : lip === "sand" ? "sand" : lip === "dirt" ? "soil" : "rock";
  const earthy = height <= 4;
  const bodyRamp: RampName = earthy ? (lip === "sand" ? "sand" : "soil") : "rock";
  const x0 = lit ? 0 : HALF_W;
  for (let px = x0; px < x0 + HALF_W; px++) {
    const top = faceTop(px);
    const drip =
      lip === "grass" || lip === "dirt" ? 1 + Math.floor(hash3(px >> 1, 0, 0, 33) * 2.99) : 1;
    for (let k = 0; k < height; k++) {
      const py = top + k;
      let col: Rgba;
      if (k < drip && !earthy) {
        col = rampColor(lipRamp, lit ? (k === 0 ? 3 : 2) : k === 0 ? 2 : 1);
      } else if (earthy) {
        const base = lipRamp === "sand" ? (lit ? 2 : 1) : lit ? 2 : 1;
        col =
          k === 0 && lip === "grass"
            ? rampColor("grass", lit ? 2 : 1)
            : rampColor(bodyRamp, base - (k >= height - 1 ? 1 : 0));
      } else {
        // Stratified rock: blocky slabs with horizontal cracks and vertical fissures.
        const slab = Math.floor((k + hash3(px >> 2, 1, 0, 34) * 3) / 5);
        const crackH = (k + Math.floor(hash3(px >> 2, 1, 0, 34) * 3)) % 5 === 0;
        const fissure = hash3(px, slab, 0, 35) > 0.86;
        const depth = k / height;
        let v = (lit ? 0.62 : 0.36) - depth * 0.22 + (hash3(px >> 1, slab, 0, 36) - 0.5) * 0.18;
        if (crackH || fissure) v -= 0.22;
        col = shade("rock", v, px, py, 0.4);
      }
      c.set(px, py, col);
    }
  }
  return { name: `c_${side}_${height}_${lip}`, canvas: c, anchorX: HALF_W, anchorY: 0 };
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
  const sprites: Sprite[] = [
    grass(0),
    grass(1),
    grass(2),
    grass(3),
    sand(0),
    sand(1),
    sand(2),
    stony(0),
    stony(1),
    dirt(0),
    dirt(1),
    path(),
    shallow(1),
    shallow(2),
    ...SIDES.map(foam),
    kelp(0),
    kelp(1),
    kelp(2),
    fog(),
    ...SIDES.map(fogEdge),
  ];
  for (const height of FACE_HEIGHTS) {
    for (const lip of LIPS) {
      sprites.push(face("left", height, lip), face("right", height, lip));
    }
  }
  return sprites;
}

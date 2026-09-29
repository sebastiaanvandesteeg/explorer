// Terrain tiles and cliff faces for every biome, plus foam, kelp and the tiling ocean texture.
import { BIOMES, HALF_H, HALF_W, TILE_H, TILE_W, type BiomeId } from "@explorer/shared";
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
export function periodicNoise(fx: number, fy: number, cells: number, seed: number): number {
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

/** Per-pixel detail hook: return a colour to override the base texture. */
type Detail = (px: number, py: number, r: number, fx: number, fy: number) => Rgba | null;

interface Ground {
  ramp: RampName;
  base: number;
  spread?: number;
  detail?: (variant: number) => Detail;
}

interface BiomeTerrain {
  ground: Ground;
  beach: Ground;
  rock: Ground;
  /** Tall cliff faces and low banks. */
  cliff: RampName;
  bank: RampName;
  /** Sparks of lava or crystal light in the cliff cracks. */
  seam?: RampName;
}

function groundTile(name: string, g: Ground, variant: number): Sprite {
  const detail = g.detail?.(variant);
  const spread = g.spread ?? 0.34;
  return tile(name, (px, py, fx, fy) => {
    const n = periodicNoise(fx, fy, 4, 11) * 0.6 + periodicNoise(fx, fy, 8, 12) * 0.4;
    const extra = detail?.(px, py, hash3(px, py, variant, 91), fx, fy);
    if (extra) return extra;
    return shade(g.ramp, g.base + (n - 0.5) * spread, px, py, 0.5);
  });
}

const speckle =
  (ramp: RampName, hi: number, lo: number, extra?: (v: number) => Detail) =>
  (variant: number): Detail =>
  (px, py, r, fx, fy) => {
    const e = extra?.(variant)(px, py, r, fx, fy);
    if (e) return e;
    if (r > 0.94) return rampColor(ramp, hi);
    if (r < 0.04) return rampColor(ramp, lo);
    return null;
  };

/** Scattered coloured pixels (flowers, petals, leaves) on some variants. */
const sprinkle =
  (colors: Rgba[], density: number, variants: number[]) =>
  (variant: number): Detail =>
  (_px, _py, r) =>
    variants.includes(variant) && r > 1 - density
      ? colors[Math.floor(r * 997) % colors.length]!
      : null;

const TERRAIN: Record<BiomeId, BiomeTerrain> = {
  temperate: {
    ground: {
      ramp: "grass",
      base: 0.55,
      detail: speckle(
        "grass",
        5,
        2,
        sprinkle([rampColor("sunflower", 3), rampColor("plaster", 4)], 0.08, [3]),
      ),
    },
    beach: { ramp: "sand", base: 0.58, detail: speckle("sand", 5, 1) },
    rock: { ramp: "rock", base: 0.62, detail: speckle("rock", 6, 2) },
    cliff: "rock",
    bank: "soil",
  },
  desert: {
    ground: {
      ramp: "dune",
      base: 0.55,
      spread: 0.28,
      detail: (v) => (px, py, r, fx, fy) => {
        // Wind ripples across the dunes.
        const ripple = (fx * 3 + fy * 5 + periodicNoise(fx, fy, 3, 70 + v) * 0.8) % 1;
        if (ripple < 0.08) return rampColor("dune", 5);
        if (ripple > 0.94) return rampColor("dune", 1);
        if (r > 0.985) return rampColor("sandstone", 2);
        return null;
      },
    },
    beach: { ramp: "dune", base: 0.72, detail: speckle("dune", 5, 2) },
    rock: { ramp: "sandstone", base: 0.55, detail: speckle("sandstone", 5, 1) },
    cliff: "sandstone",
    bank: "dune",
  },
  infernal: {
    ground: {
      ramp: "ash",
      base: 0.45,
      detail: (v) => (px, py, r, fx, fy) => {
        // Glowing lava cracks through the ash.
        const crack = Math.abs(periodicNoise(fx, fy, 3, 40 + (v % 2)) - 0.5);
        if (v !== 1 && crack < 0.016) return rampColor("lava", 3 + (r > 0.6 ? 1 : 0));
        if (v !== 1 && crack < 0.03) return rampColor("lava", 1);
        if (r > 0.988) return rampColor("lava", 2);
        if (r < 0.06) return rampColor("ash", 0);
        return null;
      },
    },
    beach: { ramp: "basalt", base: 0.5, detail: speckle("ash", 5, 0) },
    rock: {
      ramp: "basalt",
      base: 0.55,
      detail: (v) => (px, py, r, fx, fy) => {
        const crack = Math.abs(periodicNoise(fx, fy, 4, 44 + v) - 0.5);
        if (crack < 0.03) return rampColor("lava", 3);
        return r > 0.94 ? rampColor("basalt", 5) : null;
      },
    },
    cliff: "basalt",
    bank: "ash",
    seam: "lava",
  },
  tundra: {
    ground: {
      ramp: "snow",
      base: 0.68,
      spread: 0.26,
      detail: speckle(
        "snow",
        5,
        1,
        (v) => (_px, _py, r) => (v === 2 && r > 0.93 ? rampColor("ice", 2) : null),
      ),
    },
    beach: { ramp: "snow", base: 0.45, detail: speckle("sand", 3, 1) },
    rock: { ramp: "ice", base: 0.6, detail: speckle("ice", 5, 1) },
    cliff: "ice",
    bank: "snow",
  },
  jungle: {
    ground: {
      ramp: "jungle",
      base: 0.5,
      detail: speckle(
        "jungle",
        6,
        1,
        sprinkle([rampColor("berry", 3), rampColor("sunflower", 3)], 0.03, [2]),
      ),
    },
    beach: { ramp: "sand", base: 0.62, detail: speckle("sand", 5, 1) },
    rock: { ramp: "rock", base: 0.55, detail: speckle("moss", 3, 0) },
    cliff: "rock",
    bank: "soil",
  },
  swamp: {
    ground: {
      ramp: "swampGround",
      base: 0.5,
      detail: (v) => (px, py, r, fx, fy) => {
        // Murky puddles.
        const p = periodicNoise(fx, fy, 3, 60 + v);
        if (v !== 0 && p > 0.72) return p > 0.76 ? hexToRgba("#1e3a36") : hexToRgba("#3e5a4a");
        if (r > 0.95) return rampColor("swampGround", 5);
        return null;
      },
    },
    beach: { ramp: "soil", base: 0.45, detail: speckle("swampGround", 3, 0) },
    rock: { ramp: "rock", base: 0.45, detail: speckle("moss", 2, 0) },
    cliff: "rock",
    bank: "swampGround",
  },
  fungal: {
    ground: {
      ramp: "fungalGround",
      base: 0.5,
      detail: (v) => (px, py, r) => {
        if (r > 0.975) return rampColor("glow", 3 + (v % 2));
        if (r > 0.93) return rampColor("fungalGround", 5);
        if (r < 0.05) return rampColor("fungalGround", 1);
        return null;
      },
    },
    beach: { ramp: "crystalGround", base: 0.45, detail: speckle("crystalGround", 4, 1) },
    rock: { ramp: "crystalGround", base: 0.4, detail: speckle("fungalGround", 4, 0) },
    cliff: "crystalGround",
    bank: "fungalGround",
    seam: "glow",
  },
  crystal: {
    ground: {
      ramp: "crystalGround",
      base: 0.6,
      detail: (v) => (px, py, r) => {
        if (r > 0.975) return rampColor("crystal", 5 + (v % 2));
        if (r > 0.93) return rampColor("crystalGround", 5);
        if (r < 0.05) return rampColor("crystalGround", 1);
        return null;
      },
    },
    beach: { ramp: "sand", base: 0.72, detail: speckle("crystal", 5, 3) },
    rock: { ramp: "crystalGround", base: 0.45, detail: speckle("crystal", 4, 1) },
    cliff: "crystalGround",
    bank: "crystalGround",
    seam: "crystal",
  },
  autumn: {
    ground: {
      ramp: "autumnGround",
      base: 0.55,
      detail: speckle(
        "autumnGround",
        5,
        1,
        sprinkle(
          [rampColor("autumnLeaf", 3), rampColor("autumnLeaf", 5), rampColor("autumnLeaf", 2)],
          0.05,
          [1, 2, 3],
        ),
      ),
    },
    beach: { ramp: "sand", base: 0.55, detail: speckle("sand", 5, 1) },
    rock: { ramp: "rock", base: 0.6, detail: speckle("rock", 6, 2) },
    cliff: "rock",
    bank: "soil",
  },
  blossom: {
    ground: {
      ramp: "blossomGround",
      base: 0.58,
      detail: speckle(
        "blossomGround",
        5,
        1,
        sprinkle(
          [rampColor("petal", 4), rampColor("petal", 5), rampColor("plaster", 4)],
          0.06,
          [1, 3],
        ),
      ),
    },
    beach: { ramp: "sand", base: 0.66, detail: speckle("petal", 5, 3) },
    rock: { ramp: "rock", base: 0.65, detail: speckle("rock", 6, 2) },
    cliff: "rock",
    bank: "soil",
  },
};

export function biomeGroundRamp(biome: BiomeId): RampName {
  return TERRAIN[biome].ground.ramp;
}

function dirt(variant: number): Sprite {
  return groundTile(
    `t_dirt_${variant}`,
    { ramp: "soil", base: 0.62, detail: speckle("stone", 3, 1) },
    variant,
  );
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

export const FACE_HEIGHTS = [4, 8, 12, 16, 20, 24, 28] as const;
export const LIPS = ["ground", "beach", "rock", "dirt"] as const;
export type Lip = (typeof LIPS)[number];

/** First face row under the diamond for a column (left half; mirror for the right half). */
function faceTop(px: number): number {
  const col = px < HALF_W ? px : TILE_W - 1 - px;
  const r = Math.min(7, Math.ceil((15 - col) / 2));
  return TILE_H - 1 - r + 1;
}

/** Cliff face body below a tile edge. "left" faces +y (lit), "right" faces +x (shaded). */
function face(biome: BiomeId, side: "left" | "right", height: number): Sprite {
  const t = TERRAIN[biome];
  const c = new Canvas(TILE_W, TILE_H + height + 1);
  const lit = side === "left";
  const x0 = lit ? 0 : HALF_W;
  for (let px = x0; px < x0 + HALF_W; px++) {
    const top = faceTop(px);
    for (let k = 0; k < height; k++) {
      const py = top + k;
      let col: Rgba;
      if (height <= 4) {
        col = rampColor(t.bank, (lit ? 2 : 1) - (k >= height - 1 ? 1 : 0));
      } else {
        // Stratified rock: blocky slabs with horizontal cracks and vertical fissures.
        const slab = Math.floor((k + hash3(px >> 2, 1, 0, 34) * 3) / 5);
        const crackH = (k + Math.floor(hash3(px >> 2, 1, 0, 34) * 3)) % 5 === 0;
        const fissure = hash3(px, slab, 0, 35) > 0.86;
        const depth = k / height;
        let v = (lit ? 0.62 : 0.36) - depth * 0.22 + (hash3(px >> 1, slab, 0, 36) - 0.5) * 0.18;
        if (crackH || fissure) v -= 0.22;
        col = shade(t.cliff, v, px, py, 0.4);
        if (t.seam && (crackH || fissure) && hash3(px, k, 0, 37) > 0.55) {
          col = rampColor(t.seam, lit ? 4 : 3);
        }
      }
      c.set(px, py, col);
    }
  }
  return { name: `c_${biome}_${side}_${height}`, canvas: c, anchorX: HALF_W, anchorY: 0 };
}

/** The top rows of a cliff face, coloured by the ground above (grass drips, snow caps…). */
function lip(biome: BiomeId, side: "left" | "right", kind: Lip): Sprite {
  const t = TERRAIN[biome];
  const ramp: RampName =
    kind === "ground"
      ? t.ground.ramp
      : kind === "beach"
        ? t.beach.ramp
        : kind === "rock"
          ? t.rock.ramp
          : "soil";
  const c = new Canvas(TILE_W, TILE_H + 4);
  const lit = side === "left";
  const x0 = lit ? 0 : HALF_W;
  const drips = kind === "ground" || kind === "dirt";
  for (let px = x0; px < x0 + HALF_W; px++) {
    const top = faceTop(px);
    const drip = drips ? 1 + Math.floor(hash3(px >> 1, 0, 0, 33) * 2.99) : 1;
    for (let k = 0; k < drip; k++)
      c.set(px, top + k, rampColor(ramp, lit ? (k === 0 ? 3 : 2) : k === 0 ? 2 : 1));
  }
  return { name: `l_${biome}_${side}_${kind}`, canvas: c, anchorX: HALF_W, anchorY: 0 };
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
    dirt(0),
    dirt(1),
    path(),
    ...SIDES.map(foam),
    kelp(0),
    kelp(1),
    kelp(2),
  ];
  for (const biome of BIOMES) {
    const t = TERRAIN[biome];
    for (let v = 0; v < 4; v++) sprites.push(groundTile(`t_${biome}_ground_${v}`, t.ground, v));
    for (let v = 0; v < 3; v++) sprites.push(groundTile(`t_${biome}_beach_${v}`, t.beach, v));
    for (let v = 0; v < 2; v++) sprites.push(groundTile(`t_${biome}_rock_${v}`, t.rock, v));
    for (const height of FACE_HEIGHTS)
      sprites.push(face(biome, "left", height), face(biome, "right", height));
    for (const kind of LIPS) sprites.push(lip(biome, "left", kind), lip(biome, "right", kind));
  }
  return sprites;
}

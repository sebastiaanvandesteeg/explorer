// What the ground is made of. Every biome has a ground, a beach, a rock and a dirt look, plus a
// cliff and bank ramp for the faces. Colours are functions of the world position, not of a tile,
// so nothing repeats on a 32×16 grid: patches of colour drift smoothly across tile borders.
import type { BiomeId } from "@explorer/shared";
import { hexToRgba, rampColor, shade, type RampName, type Rgba } from "../palette";
import { clamp01, hash2, vnoise } from "../noise";

/** A pixel being painted: its world pixel, the tile-space point it shows and a per-pixel hash. */
export interface PixelCtx {
  X: number;
  Y: number;
  u: number;
  v: number;
  /** Uniform per-pixel random number in [0, 1). */
  r: number;
}

export const MAT_SAND = 0;
export const MAT_GROUND = 1;
export const MAT_ROCK = 2;
export const MAT_DIRT = 3;
/** Flagstones laid by a Path building. */
export const MAT_PATH = 4;
export type Material =
  typeof MAT_SAND | typeof MAT_GROUND | typeof MAT_ROCK | typeof MAT_DIRT | typeof MAT_PATH;

type Surface = (c: PixelCtx) => Rgba;
type Detail = (c: PixelCtx, n: number) => Rgba | null;

export interface BiomeArt {
  ground: Surface;
  beach: Surface;
  rock: Surface;
  dirt: Surface;
  path: Surface;
  /** Tall cliff faces and low banks. */
  cliff: RampName;
  bank: RampName;
  /** The ramp that drips over the top of a cliff (matches the ground). */
  lip: RampName;
  /** Sparks of lava or crystal light in the cliff cracks. */
  seam?: RampName;
}

/** Ground colour with soft drifting patches, in the given ramp. */
function surface(ramp: RampName, base: number, spread = 0.34, detail?: Detail): Surface {
  return (c) => {
    const n = vnoise(c.u * 4, c.v * 4, 11) * 0.6 + vnoise(c.u * 8, c.v * 8, 12) * 0.4;
    // Broad drifts of lighter and darker ground so big open areas are never flat.
    const drift =
      (vnoise(c.u * 0.7 + 3.1, c.v * 0.7 + 8.2, 13) - 0.5) * 0.24 +
      (vnoise(c.u * 0.24 + 5.5, c.v * 0.24 + 1.9, 14) - 0.5) * 0.3;
    const d = detail?.(c, n);
    if (d) return d;
    return shade(ramp, base + (n - 0.5) * spread + drift, c.X, c.Y, 0.5);
  };
}

const speckle =
  (ramp: RampName, hi: number, lo: number, extra?: Detail): Detail =>
  (c, n) => {
    const e = extra?.(c, n);
    if (e) return e;
    if (c.r > 0.955) return rampColor(ramp, hi);
    if (c.r < 0.035) return rampColor(ramp, lo);
    return null;
  };

/** Scattered coloured pixels (flowers, petals, leaves) that gather in patches. */
const sprinkle =
  (colors: Rgba[], density: number, seed = 21): Detail =>
  (c) => {
    if (vnoise(c.u * 0.9 + 1.7, c.v * 0.9 + 4.1, seed) < 0.5) return null;
    return c.r > 1 - density * 2 ? colors[Math.floor(c.r * 9973) % colors.length]! : null;
  };

/** Short blades of grass: a light stroke over a dark pixel, on a jittered pixel lattice. */
const tufts =
  (ramp: RampName, light: number, dark: number, density = 0.1): Detail =>
  (c) => {
    const h = hash2(c.X >> 1, c.Y >> 1, 57);
    if (h > 1 - density) return (c.X & 1) === 0 ? rampColor(ramp, light) : null;
    if (h < density * 0.6) return (c.Y & 1) === 0 ? rampColor(ramp, dark) : null;
    return null;
  };

const chain =
  (...ds: (Detail | undefined)[]): Detail =>
  (c, n) => {
    for (const d of ds) {
      const e = d?.(c, n);
      if (e) return e;
    }
    return null;
  };

const soilDirt = surface("soil", 0.62, 0.34, speckle("stone", 3, 1));

/**
 * Flagstones: irregular stones set in earth. A jittered grid of stone centres; a pixel belongs to
 * the nearest one, and where two stones are nearly as close the gap between them shows as mortar.
 */
function flagstones(
  ramp: RampName,
  mortar: RampName,
  { scale = 2.7, edge: gap = 0.1, base = 0.32, spread = 0.42, moss = 0 } = {},
): Surface {
  return (c) => {
    // Stretch, turn and wobble the grid so the cells come out uneven, like cracked rock.
    const su = c.u + (vnoise(c.u * 1.3, c.v * 1.3, 65) - 0.5) * 0.7;
    const sv = c.v + (vnoise(c.u * 1.3 + 9.2, c.v * 1.3 + 4.1, 66) - 0.5) * 0.7;
    const gx = (su * 0.94 - sv * 0.34) * scale * 1.2;
    const gy = (su * 0.34 + sv * 0.94) * scale * 0.85;
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const px = cx + i + 0.05 + hash2(cx + i, cy + j, 61) * 0.9;
        const py = cy + j + 0.05 + hash2(cx + i, cy + j, 62) * 0.9;
        const d = (gx - px) * (gx - px) + (gy - py) * (gy - py);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash2(cx + i, cy + j, 63);
        } else if (d < d2) d2 = d;
      }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    // Moss and grass tuck into the cracks and settle on some slabs.
    if (moss > 0 && (edge < gap * 1.4 || id > 1 - moss) && vnoise(c.u * 2.4, c.v * 2.4, 64) > 0.5)
      return rampColor("moss", 1 + (c.r > 0.6 ? 1 : 0));
    if (edge < gap) return shade(mortar, 0.22 + c.r * 0.2, c.X, c.Y, 0.3);
    // Stones catch the light on their upper-left edge.
    const rim = edge < gap * 1.9 ? -0.08 : edge > gap * 4.2 ? 0.05 : 0;
    return shade(ramp, base + id * spread + rim + (c.r - 0.5) * 0.1, c.X, c.Y, 0.3);
  };
}

/** Weathered rock ground: big cracked slabs. */
const slabs = (ramp: RampName, moss = 0.35): Surface =>
  flagstones(ramp, ramp, { scale: 1.5, edge: 0.05, base: 0.44, spread: 0.3, moss });

const stonePath = flagstones("stone", "soil");

const ART: Record<BiomeId, BiomeArt> = {
  temperate: {
    ground: surface(
      "grass",
      0.55,
      0.34,
      chain(
        sprinkle([rampColor("sunflower", 3), rampColor("plaster", 4)], 0.008),
        tufts("grass", 5, 1, 0.08),
        speckle("grass", 5, 2),
      ),
    ),
    beach: surface("sand", 0.58, 0.34, speckle("sand", 5, 1)),
    rock: slabs("rock"),
    dirt: soilDirt,
    path: stonePath,
    cliff: "rock",
    bank: "soil",
    lip: "grass",
  },
  desert: {
    ground: surface("dune", 0.55, 0.28, (c) => {
      // Wind ripples across the dunes.
      const ripple = (c.u * 3 + c.v * 5 + vnoise(c.u * 3, c.v * 3, 70) * 0.8) % 1;
      if (ripple < 0.08) return rampColor("dune", 5);
      if (ripple > 0.94) return rampColor("dune", 1);
      if (c.r > 0.985) return rampColor("sandstone", 2);
      return null;
    }),
    beach: surface("dune", 0.72, 0.34, speckle("dune", 5, 2)),
    rock: slabs("sandstone", 0),
    dirt: surface("dune", 0.4, 0.3, speckle("sandstone", 3, 0)),
    path: flagstones("sandstone", "dune"),
    cliff: "sandstone",
    bank: "dune",
    lip: "dune",
  },
  infernal: {
    ground: surface("ash", 0.45, 0.34, (c) => {
      // Glowing lava cracks through the ash.
      const crack = Math.abs(vnoise(c.u * 3, c.v * 3, 40) - 0.5);
      if (crack < 0.016) return rampColor("lava", 3 + (c.r > 0.6 ? 1 : 0));
      if (crack < 0.03) return rampColor("lava", 1);
      if (c.r > 0.988) return rampColor("lava", 2);
      if (c.r < 0.06) return rampColor("ash", 0);
      return null;
    }),
    beach: surface("basalt", 0.5, 0.34, speckle("ash", 5, 0)),
    rock: surface("basalt", 0.55, 0.34, (c) => {
      const crack = Math.abs(vnoise(c.u * 4, c.v * 4, 44) - 0.5);
      if (crack < 0.03) return rampColor("lava", 3);
      return c.r > 0.94 ? rampColor("basalt", 5) : null;
    }),
    dirt: surface("ash", 0.3, 0.3, speckle("basalt", 4, 0)),
    path: flagstones("basalt", "ash"),
    cliff: "basalt",
    bank: "ash",
    lip: "ash",
    seam: "lava",
  },
  tundra: {
    ground: surface(
      "snow",
      0.68,
      0.26,
      speckle("snow", 5, 1, (c) =>
        vnoise(c.u * 1.1, c.v * 1.1, 50) > 0.7 && c.r > 0.93 ? rampColor("ice", 2) : null,
      ),
    ),
    beach: surface("snow", 0.45, 0.34, speckle("sand", 3, 1)),
    rock: slabs("ice", 0),
    dirt: surface("soil", 0.5, 0.3, speckle("snow", 3, 0)),
    path: flagstones("stone", "snow"),
    cliff: "ice",
    bank: "snow",
    lip: "snow",
  },
  jungle: {
    ground: surface(
      "jungle",
      0.5,
      0.34,
      chain(
        sprinkle([rampColor("berry", 3), rampColor("sunflower", 3)], 0.012),
        tufts("jungle", 6, 1, 0.12),
        speckle("jungle", 6, 1),
      ),
    ),
    beach: surface("sand", 0.62, 0.34, speckle("sand", 5, 1)),
    rock: slabs("rock", 0.5),
    dirt: soilDirt,
    path: stonePath,
    cliff: "rock",
    bank: "soil",
    lip: "jungle",
  },
  swamp: {
    ground: surface("swampGround", 0.5, 0.34, (c) => {
      // Murky puddles.
      const p = vnoise(c.u * 3, c.v * 3, 60);
      if (p > 0.74) return p > 0.78 ? hexToRgba("#1e3a36") : hexToRgba("#3e5a4a");
      if (c.r > 0.95) return rampColor("swampGround", 5);
      return null;
    }),
    beach: surface("soil", 0.45, 0.34, speckle("swampGround", 3, 0)),
    rock: slabs("rock", 0.5),
    dirt: surface("soil", 0.4, 0.3, speckle("swampGround", 3, 0)),
    path: stonePath,
    cliff: "rock",
    bank: "swampGround",
    lip: "swampGround",
  },
  fungal: {
    ground: surface("fungalGround", 0.5, 0.34, (c) => {
      if (c.r > 0.975) return rampColor("glow", 3 + (c.X & 1));
      if (c.r > 0.93) return rampColor("fungalGround", 5);
      if (c.r < 0.05) return rampColor("fungalGround", 1);
      return null;
    }),
    beach: surface("crystalGround", 0.45, 0.34, speckle("crystalGround", 4, 1)),
    rock: surface("crystalGround", 0.4, 0.34, speckle("fungalGround", 4, 0)),
    dirt: surface("fungalGround", 0.3, 0.3, speckle("crystalGround", 3, 0)),
    path: flagstones("crystalGround", "fungalGround"),
    cliff: "crystalGround",
    bank: "fungalGround",
    lip: "fungalGround",
    seam: "glow",
  },
  crystal: {
    ground: surface("crystalGround", 0.6, 0.34, (c) => {
      if (c.r > 0.975) return rampColor("crystal", 5 + (c.Y & 1));
      if (c.r > 0.93) return rampColor("crystalGround", 5);
      if (c.r < 0.05) return rampColor("crystalGround", 1);
      return null;
    }),
    beach: surface("sand", 0.72, 0.34, speckle("crystal", 5, 3)),
    rock: surface("crystalGround", 0.45, 0.34, speckle("crystal", 4, 1)),
    dirt: surface("crystalGround", 0.35, 0.3, speckle("crystal", 3, 0)),
    path: flagstones("crystalGround", "sand"),
    cliff: "crystalGround",
    bank: "crystalGround",
    lip: "crystalGround",
    seam: "crystal",
  },
  autumn: {
    ground: surface(
      "autumnGround",
      0.55,
      0.34,
      chain(
        sprinkle(
          [rampColor("autumnLeaf", 3), rampColor("autumnLeaf", 5), rampColor("autumnLeaf", 2)],
          0.02,
        ),
        tufts("autumnGround", 5, 1),
        speckle("autumnGround", 5, 1),
      ),
    ),
    beach: surface("sand", 0.55, 0.34, speckle("sand", 5, 1)),
    rock: slabs("rock"),
    dirt: soilDirt,
    path: stonePath,
    cliff: "rock",
    bank: "soil",
    lip: "autumnGround",
  },
  blossom: {
    ground: surface(
      "blossomGround",
      0.58,
      0.34,
      chain(
        sprinkle([rampColor("petal", 4), rampColor("petal", 5), rampColor("plaster", 4)], 0.02),
        tufts("blossomGround", 5, 1),
        speckle("blossomGround", 5, 1),
      ),
    ),
    beach: surface("sand", 0.66, 0.34, speckle("petal", 5, 3)),
    rock: slabs("rock"),
    dirt: soilDirt,
    path: stonePath,
    cliff: "rock",
    bank: "soil",
    lip: "blossomGround",
  },
};

export function biomeArt(biome: BiomeId): BiomeArt {
  return ART[biome];
}

export function surfaceColor(art: BiomeArt, mat: Material, c: PixelCtx): Rgba {
  switch (mat) {
    case MAT_SAND:
      return art.beach(c);
    case MAT_ROCK:
      return art.rock(c);
    case MAT_DIRT:
      return art.dirt(c);
    case MAT_PATH:
      return art.path(c);
    default:
      return art.ground(c);
  }
}

/** A pixel on a vertical face. */
export interface WallCtx {
  X: number;
  Y: number;
  /** Height above the water plane of the wall point, in pixels. */
  z: number;
  /** Distance along the face in pixels (continuous along a curving cliff). */
  t: number;
  /** Lighting from the face's direction, 0 (shaded) to 1 (lit). */
  lit: number;
  /** Heights of the rim and of the ground at the foot. */
  topZ: number;
  baseZ: number;
  /** What the ground on top is made of. */
  top: Material;
  /** Whether the foot stands in water. */
  wet: boolean;
  u: number;
  v: number;
  r: number;
}

/** Stratified rock face: blocky slabs, cracks, moss near the rim and grass drips over the edge. */
export function wallColor(art: BiomeArt, c: WallCtx): Rgba {
  const height = c.topZ - c.baseZ;
  const depth = c.topZ - c.z;
  const up = c.z - c.baseZ;
  const lit = c.lit;

  // Low banks of sand or soil rather than rock.
  const soft = c.top === MAT_SAND || (height <= 4 && c.top !== MAT_ROCK);
  if (soft) {
    // Ledges at the foot of a cliff are rubble, not soil.
    if (c.wet && c.top !== MAT_SAND)
      return shade(art.cliff, 0.16 + lit * 0.24 + (c.r - 0.5) * 0.14, c.X, c.Y, 0.4);
    const ramp: RampName = c.top === MAT_SAND ? "sand" : art.bank;
    let v = 0.18 + lit * 0.3 + (hash2(c.X >> 1, c.Y >> 1, 36) - 0.5) * 0.12;
    if (up < 2 && c.wet) v -= 0.12;
    if (depth < 1) v += 0.16;
    return shade(ramp, v, c.X, c.Y, 0.35);
  }

  // Grass, snow or sand drips over the top edge.
  const drip = 1 + Math.floor(hash2(Math.floor(c.t / 2), 0, 33) * 2.99);
  if (c.top !== MAT_ROCK && depth < drip) {
    return rampColor(art.lip, depth < 1 ? (lit > 0.5 ? 3 : 2) : lit > 0.5 ? 2 : 1);
  }

  // Terraces inland: an earth bank with a few stones in it, not a stone wall.
  if (!c.wet && height <= 8 && c.top !== MAT_ROCK) {
    if (hash2(Math.floor(c.t / 3), Math.floor(c.z / 3), 38) > 0.84)
      return shade(art.cliff, 0.3 + lit * 0.35 + (c.r - 0.5) * 0.2, c.X, c.Y, 0.4);
    const v =
      0.12 + lit * 0.36 + (hash2(c.X >> 1, c.Y >> 1, 39) - 0.5) * 0.16 - (up < 3 ? 0.06 : 0);
    return shade(art.bank, v, c.X, c.Y, 0.4);
  }

  // Boulders: staggered rows of rounded blocks, each lit from the upper left and split by dark
  // crevices. `t` grows toward the left of the screen on every face.
  const rowH = 6;
  const rowF = (c.z + hash2(Math.floor(c.t / 9), 0, 41) * 4) / rowH;
  const row = Math.floor(rowF);
  const ry = rowF - row;
  const bw = 7 + hash2(row, 0, 42) * 6;
  const bo = (c.t + hash2(row, 1, 43) * bw) / bw;
  const bi = Math.floor(bo);
  const bx = bo - bi;
  const id = hash2(bi, row, 44);
  const crevice = ry < 0.17 || bx < 0.1 || ((bx > 0.9 || bx < 0.18) && (ry > 0.86 || ry < 0.26));
  let v = 0.22 + lit * 0.46 + (id - 0.5) * 0.24;
  // Form shading inside a block: bright at the top left, dark at the bottom right.
  v += (bx - 0.5) * 0.16 + (ry - 0.5) * 0.18;
  // Darker toward the foot, where the sea licks it, and just under the rim.
  if (up < 5) v -= (5 - up) * 0.025 + (c.wet ? 0.05 : 0);
  if (depth >= 1 && depth < 3 && c.top !== MAT_ROCK) v -= 0.1;
  if (crevice) v -= 0.2;
  else if (ry > 0.86 && lit > 0.45) v += 0.07;

  if (art.seam && crevice && hash2(c.X, Math.floor(c.z), 37) > 0.62)
    return rampColor(art.seam, lit > 0.5 ? 4 : 3);

  // Moss creeping down from the top and settling on the tops of blocks.
  if (!crevice && c.top === MAT_GROUND) {
    const moss = vnoise(c.t * 0.17, c.z * 0.22, 55);
    if (moss > 0.62 + Math.min(depth, 12) * 0.025 && ry > 0.35)
      return rampColor("moss", lit > 0.5 ? 2 : 1);
  }
  return shade(art.cliff, clamp01(v), c.X, c.Y, 0.4);
}

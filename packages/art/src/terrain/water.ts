// Water next to land: the white foam line along every shore, the turquoise shallows fading out
// to sea with pixel-art dithering, and the dark reef and kelp shadows drifting under the surface.
// Pixels here are translucent so the animated ocean underneath keeps moving through them.
import { bayer, hexToRgba, rampColor, type Rgba } from "../palette";
import { hash2, smoothstep, vnoise } from "../noise";
import { LEVEL_THRESHOLD, type Fields, type TerrainWorld, warpU, warpV } from "./field";

export type RgbTriple = readonly [number, number, number];

/** Glow strength by shore distance in tiles: 0 is on land, 1 the water touching it. */
const GLOW = [0.9, 0.82, 0.58, 0.34, 0.16, 0.05] as const;

function glowTile(world: TerrainWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  return GLOW[world.shore[y * world.width + x]!] ?? 0;
}

/** Shallow-water glow at a point: tile values interpolated between tile centres. */
export function shoreGlow(world: TerrainWorld, u: number, v: number): number {
  const pu = u + warpU(u, v) * 0.6 - 0.5;
  const pv = v + warpV(u, v) * 0.6 - 0.5;
  const i = Math.floor(pu);
  const j = Math.floor(pv);
  const a = pu - i;
  const b = pv - j;
  return (
    glowTile(world, i, j) * (1 - a) * (1 - b) +
    glowTile(world, i + 1, j) * a * (1 - b) +
    glowTile(world, i, j + 1) * (1 - a) * b +
    glowTile(world, i + 1, j + 1) * a * b
  );
}

const FOAM_WHITE = rampColor("foam", 4);
const FOAM_PALE = rampColor("foam", 2);
const FOAM_FAINT = hexToRgba("#a0c4b6");
const REEF = hexToRgba("#0f3a42");
const REEF_DEEP = hexToRgba("#0a2a31");

export interface WaterPixel {
  X: number;
  Y: number;
  u: number;
  v: number;
  /** Colour of the shallows for the biome region here. */
  glow: RgbTriple;
  /** Tile distance to land under this point (0 on land, 255 far out to sea). */
  shore: number;
}

/**
 * Colour one water pixel into `rgba`. Returns false when the pixel stays clear, letting the
 * animated ocean show through.
 */
export function shadeWater(
  fields: Fields,
  world: TerrainWorld,
  p: WaterPixel,
  rgba: Rgba,
): boolean {
  const { X, Y, u, v } = p;
  const land = fields.landAt(u, v);
  // Foam hugs the coast contour: a bright line, a paler line and broken outer ripples.
  if (land > 0.04) {
    const wob = (vnoise(u * 7, v * 7, 71) - 0.5) * 0.1 + (hash2(X, Y, 72) - 0.5) * 0.035;
    const d = LEVEL_THRESHOLD - land + wob;
    if (d < 0.06) return set(rgba, FOAM_WHITE, 255);
    if (d < 0.115) return set(rgba, FOAM_PALE, 240);
    if (d > 0.17 && d < 0.24 && vnoise(u * 5, v * 5, 73) > 0.45 && hash2(X >> 1, Y, 74) > 0.3)
      return set(rgba, FOAM_FAINT, 200);
    if (d > 0.3 && d < 0.34 && vnoise(u * 3.2, v * 3.2, 75) > 0.62 && hash2(X, Y >> 1, 76) > 0.4)
      return set(rgba, FOAM_FAINT, 120);
  }

  // Turquoise shallows: ordered dithering between a few translucent steps.
  let has = false;
  const g = shoreGlow(world, u, v) * (0.9 + (vnoise(u * 2.3, v * 2.3, 93) - 0.5) * 0.36);
  const step = Math.floor(g * 5 + bayer(X, Y) - 0.5);
  if (step >= 1) {
    // The brightest steps lean toward white, like sunlit sand seen through clear water.
    const k = step >= 3 ? 0.22 + (step - 3) * 0.12 : 0;
    rgba[0] = p.glow[0] + (255 - p.glow[0]) * k;
    rgba[1] = p.glow[1] + (255 - p.glow[1]) * k;
    rgba[2] = p.glow[2] + (255 - p.glow[2]) * k;
    rgba[3] = step === 1 ? 70 : step === 2 ? 120 : step === 3 ? 165 : 205;
    has = true;
  }

  // Reef and kelp shadows on the sea floor, sitting in the shallows.
  if (p.shore >= 1 && p.shore <= 8) {
    const rn =
      vnoise(u * 1.25, v * 1.25, 91) * 0.5 +
      vnoise(u * 2.9 + 7.7, v * 2.9 + 1.3, 94) * 0.3 +
      vnoise(u * 6.1 + 2.2, v * 6.1 + 9.1, 95) * 0.2 +
      (hash2(X, Y, 92) - 0.5) * 0.05;
    const limit = 0.64 + smoothstep(1, 8, p.shore) * 0.06;
    if (rn > limit) {
      const deep = rn > limit + 0.06;
      const c = deep ? REEF_DEEP : REEF;
      blend(rgba, has, c, deep ? 150 : 110);
      has = true;
    }
  }
  return has;
}

/** Layer a translucent colour over what is already in `rgba` (when `has`). */
function blend(rgba: Rgba, has: boolean, c: Rgba, a: number): void {
  if (!has || rgba[3] === 0) {
    rgba[0] = c[0];
    rgba[1] = c[1];
    rgba[2] = c[2];
    rgba[3] = a;
    return;
  }
  const sa = a / 255;
  const da = rgba[3] / 255;
  const oa = sa + da * (1 - sa);
  rgba[0] = (c[0] * sa + rgba[0] * da * (1 - sa)) / oa;
  rgba[1] = (c[1] * sa + rgba[1] * da * (1 - sa)) / oa;
  rgba[2] = (c[2] * sa + rgba[2] * da * (1 - sa)) / oa;
  rgba[3] = oa * 255;
}

function set(out: Rgba, c: Rgba, a: number): boolean {
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
  out[3] = a;
  return true;
}

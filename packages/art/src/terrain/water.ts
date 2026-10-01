// Water next to land: the white foam lapping every shore, the turquoise shallows fading out to sea
// with pixel-art dithering, and the dark reef and kelp shadows under the surface.
//
// The foam and shallows move: they are painted in WAVE_FRAMES frames that the game plays in turn
// (WAVE_SEQUENCE), so waves seem to run up the shore and back, rings drift and the shallows
// shimmer. Reef shadows stand still. Pixels are translucent, so the animated ocean underneath
// keeps moving through them.
import { bayer, hexToRgba, rampColor, type Rgba } from "../palette";
import { hash2, smoothstep, vnoise } from "../noise";
import { LEVEL_THRESHOLD, type Fields, type TerrainWorld, warpU, warpV } from "./field";

export type RgbTriple = readonly [number, number, number];

/** Wave images per chunk, and the order they are shown in (in and out again). */
export const WAVE_FRAMES = 3;
export const WAVE_SEQUENCE: readonly number[] = [0, 1, 2, 1];

/** Glow strength by shore distance in tiles: 0 is on land, 1 the water touching it. */
const GLOW = [0.9, 0.82, 0.58, 0.34, 0.16, 0.05] as const;

function glowTile(world: TerrainWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  return GLOW[world.shore[y * world.width + x]!] ?? 0;
}

/** Shallow-water glow at a point: tile values interpolated between tile centres. */
function shoreGlow(world: TerrainWorld, u: number, v: number): number {
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

/** Small pixel shifts of the dither pattern, one per wave frame, so the shallows shimmer. */
const SHIMMER: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, 1],
  [1, 3],
];

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

/** What `shadeWater` produced for a pixel. */
export const HAS_WAVES = 1;
export const HAS_REEF = 2;

/**
 * Colour one water pixel. `frames[k]` receives the moving part (foam and shallows) for wave frame
 * k, with alpha 0 where there is none, and `reef` the standing part. Returns HAS_WAVES and/or
 * HAS_REEF, or 0 when the pixel stays clear.
 */
export function shadeWater(
  fields: Fields,
  world: TerrainWorld,
  p: WaterPixel,
  frames: Rgba[],
  reef: Rgba,
): number {
  const { X, Y, u, v } = p;
  const land = fields.landAt(u, v);
  let result = 0;
  // How far this pixel is from the coast contour, in tiles, with a little wobble.
  let d = 9;
  if (land > 0.04) {
    const wob = (vnoise(u * 7, v * 7, 71) - 0.5) * 0.1 + (hash2(X, Y, 72) - 0.5) * 0.035;
    d = LEVEL_THRESHOLD - land + wob;
  }
  const ringA = land > 0.04 && vnoise(u * 5, v * 5, 73) > 0.45 && hash2(X >> 1, Y, 74) > 0.3;
  const ringB = land > 0.04 && vnoise(u * 3.2, v * 3.2, 75) > 0.62 && hash2(X, Y >> 1, 76) > 0.4;
  const g = shoreGlow(world, u, v) * (0.9 + (vnoise(u * 2.3, v * 2.3, 93) - 0.5) * 0.36);

  for (let k = 0; k < frames.length; k++) {
    const out = frames[k]!;
    out[3] = 0;
    const phase = frames.length > 1 ? k / (frames.length - 1) : 0.5;
    // The foam line breathes: a wave runs up the beach and slides back.
    if (d < 0.03 + 0.05 * phase) {
      set(out, FOAM_WHITE, 255);
    } else if (d < 0.075 + 0.085 * phase) {
      set(out, FOAM_PALE, 240);
    } else if (ringA && Math.abs(d - (0.19 + 0.1 * phase)) < 0.034) {
      set(out, FOAM_FAINT, 200 - 50 * phase);
    } else if (ringB && Math.abs(d - (0.34 + 0.13 * phase)) < 0.024) {
      set(out, FOAM_FAINT, 120);
    } else {
      // Turquoise shallows: ordered dithering, its pattern shifting a little each frame.
      const [sx, sy] = SHIMMER[k % SHIMMER.length]!;
      const step = Math.floor(g * (0.96 + 0.08 * phase) * 5 + bayer(X + sx, Y + sy) - 0.5);
      if (step >= 1) {
        // The brightest steps lean toward white, like sunlit sand seen through clear water.
        const lean = step >= 3 ? 0.22 + (step - 3) * 0.12 : 0;
        out[0] = p.glow[0] + (255 - p.glow[0]) * lean;
        out[1] = p.glow[1] + (255 - p.glow[1]) * lean;
        out[2] = p.glow[2] + (255 - p.glow[2]) * lean;
        out[3] = step === 1 ? 70 : step === 2 ? 120 : step === 3 ? 165 : 205;
      }
    }
    if (out[3] > 0) result |= HAS_WAVES;
  }

  // Reef and kelp shadows on the sea floor, in the shallows and clear of the foam.
  reef[3] = 0;
  if (p.shore >= 1 && p.shore <= 8 && d > 0.4) {
    const rn =
      vnoise(u * 1.25, v * 1.25, 91) * 0.5 +
      vnoise(u * 2.9 + 7.7, v * 2.9 + 1.3, 94) * 0.3 +
      vnoise(u * 6.1 + 2.2, v * 6.1 + 9.1, 95) * 0.2 +
      (hash2(X, Y, 92) - 0.5) * 0.05;
    const limit = 0.64 + smoothstep(1, 8, p.shore) * 0.06;
    if (rn > limit) {
      const deep = rn > limit + 0.06;
      set(reef, deep ? REEF_DEEP : REEF, deep ? 150 : 110);
      result |= HAS_REEF;
    }
  }
  return result;
}

function set(out: Rgba, c: Rgba, a: number): void {
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
  out[3] = a;
}

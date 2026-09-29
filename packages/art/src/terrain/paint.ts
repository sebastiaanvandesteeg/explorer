// The terrain painter. For every pixel of a chunk it casts the pixel's view ray through the smooth
// level fields (see field.ts), finds the first surface it meets (a plateau top, a cliff face or the
// sea) and colours it from the biome's materials. Nothing here knows about tile sprites: coasts,
// beaches and cliffs are whatever shape the fields make them.
import { BIOMES, HALF_H, HALF_W, Terrain, type BiomeId } from "@explorer/shared";
import { shade, type Rgba } from "../palette";
import { clamp01, hash2, vnoise } from "../noise";
import {
  CELL,
  Fields,
  LEVEL_PX,
  LEVEL_THRESHOLD,
  MARGIN,
  MAX_LEVEL,
  type TerrainWorld,
} from "./field";
import {
  MAT_DIRT,
  MAT_FIELD,
  MAT_GROUND,
  MAT_PATH,
  MAT_ROCK,
  MAT_SAND,
  biomeArt,
  surfaceColor,
  wallColor,
  type Material,
  type PixelCtx,
  type WallCtx,
} from "./materials";
import {
  HAS_REEF,
  HAS_WAVES,
  WAVE_FRAMES,
  shadeWater,
  type RgbTriple,
  type WaterPixel,
} from "./water";

export type { TerrainWorld } from "./field";

/** The pixel rectangle (in world pixels) that the returned image covers. */
export interface PaintRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaintOptions {
  /** Colour of the shallows near a biome index (open ocean gets an out-of-range index). */
  glow: (biome: number) => RgbTriple;
}

/** Tall decoration and raised land poke above a chunk's diamond. */
export const TOP_MARGIN = 64;
export const BOTTOM_MARGIN = 8;

const DEFAULT_GLOW: RgbTriple = [67, 161, 151];
const DEFAULT_OPTIONS: PaintOptions = { glow: () => DEFAULT_GLOW };

/** Ray march step along the view direction, in tiles: half a pixel of screen height. */
const STEP = 1 / CELL;
/** Light comes from the upper left of the screen: world direction (-0.45, 0.89) in tile space. */
const LIGHT_U = -0.45;
const LIGHT_V = 0.89;

/**
 * The pixel rectangle a chunk's image covers: the chunk's diamond plus room above for cliffs and
 * anything that pokes up, and below for the foam.
 */
export function chunkRect(cx: number, cy: number, chunk: number): PaintRect {
  const x0 = cx * chunk;
  const y0 = cy * chunk;
  const minSx = (x0 - (y0 + chunk - 1)) * HALF_W - HALF_W;
  const maxSx = (x0 + chunk - 1 - y0) * HALF_W + HALF_W;
  const minSy = (x0 + y0) * HALF_H - TOP_MARGIN;
  const maxSy = (x0 + y0 + (chunk - 1) * 2) * HALF_H + HALF_H * 2 + BOTTOM_MARGIN;
  return { x: minSx, y: minSy, w: maxSx - minSx, h: maxSy - minSy };
}

function materialOfTile(world: TerrainWorld, k: number): Material | -1 {
  if (world.paved?.[k]) return MAT_PATH;
  if (world.field?.[k]) return MAT_FIELD;
  return materialOfTerrain(world.terrain[k]!);
}

function materialOfTerrain(t: number): Material | -1 {
  switch (t) {
    case Terrain.Sand:
      return MAT_SAND;
    case Terrain.Grass:
      return MAT_GROUND;
    case Terrain.Rock:
      return MAT_ROCK;
    case Terrain.Dirt:
      return MAT_DIRT;
    default:
      return -1;
  }
}

function levelOfTile(world: TerrainWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  const k = y * world.width + x;
  const t = world.terrain[k]!;
  return t === Terrain.Deep || t === Terrain.Shallow ? 0 : world.elevation[k]! + 1;
}

const votes = new Float64Array(6);

/**
 * What the ground is at a point: the material of the nearby land tiles of the same level, voted by
 * bilinear weight over a wobbling sample position, so the borders between grass, sand, rock and
 * dirt are organic curves rather than tile edges.
 */
function pickMaterial(world: TerrainWorld, u: number, v: number, level: number): Material {
  const pu = u + (vnoise(u * 1.3 + 4.4, v * 1.3 + 9.9, 101) - 0.5) * 0.8 - 0.5;
  const pv = v + (vnoise(u * 1.3 + 7.7, v * 1.3 + 2.2, 102) - 0.5) * 0.8 - 0.5;
  const i = Math.floor(pu);
  const j = Math.floor(pv);
  const a = pu - i;
  const b = pv - j;
  votes.fill(0);
  let total = 0;
  for (let n = 0; n < 4; n++) {
    const tx = i + (n & 1);
    const ty = j + (n >> 1);
    if (levelOfTile(world, tx, ty) !== level) continue;
    const m = materialOfTile(world, ty * world.width + tx);
    if (m < 0) continue;
    const w = ((n & 1) === 0 ? 1 - a : a) * (n >> 1 === 0 ? 1 - b : b);
    votes[m] = votes[m]! + w;
    total += w;
  }
  if (total < 0.02) {
    // Nothing of this level right around the point (a sliver of plateau, or a rim that bulges over
    // the tile below): take the nearest tile of the level instead.
    const tx = Math.floor(u);
    const ty = Math.floor(v);
    let nearest = -1;
    let nearestD = 9;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (levelOfTile(world, tx + dx, ty + dy) !== level) continue;
        const d = (tx + dx + 0.5 - u) ** 2 + (ty + dy + 0.5 - v) ** 2;
        if (d < nearestD) {
          nearestD = d;
          nearest = (ty + dy) * world.width + tx + dx;
        }
      }
    if (nearest < 0) return MAT_GROUND;
    const m = materialOfTile(world, nearest);
    return m < 0 ? MAT_GROUND : (m as Material);
  }
  let best = 0;
  let bestScore = -1;
  let second = -1;
  for (let m = 0; m < 6; m++) {
    const score = votes[m]! + hash2(Math.floor(u * 4), Math.floor(v * 4), 103 + m) * 0.05;
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = m;
    } else if (score > second) second = score;
  }
  // Worn earth frames the flagstones where a path meets the ground, and the plough where a field
  // does.
  if ((best === MAT_PATH || best === MAT_FIELD) && bestScore - second < 0.16) return MAT_DIRT;
  // Grass round a building is trampled bare, in an irregular clearing.
  if (best === MAT_GROUND && world.wear) {
    let trample = 0;
    for (let n = 0; n < 4; n++) {
      const tx = i + (n & 1);
      const ty = j + (n >> 1);
      if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) continue;
      const w = ((n & 1) === 0 ? 1 - a : a) * (n >> 1 === 0 ? 1 - b : b);
      trample += w * world.wear[ty * world.width + tx]!;
    }
    if (trample / 255 + (vnoise(u * 2.6 + 3.3, v * 2.6 + 8.1, 111) - 0.5) * 0.55 > 0.55)
      return MAT_DIRT;
  }
  return best as Material;
}

/** Sand only lies at beach level, so nothing higher is ever sandy, whatever leans over it. */
function materialAt(world: TerrainWorld, u: number, v: number, level: number): Material {
  const m = pickMaterial(world, u, v, level);
  return level >= 2 && m === MAT_SAND ? MAT_GROUND : m;
}

function biomeOf(world: TerrainWorld, u: number, v: number): BiomeId {
  const tx = Math.min(world.width - 1, Math.max(0, Math.floor(u)));
  const ty = Math.min(world.height - 1, Math.max(0, Math.floor(v)));
  return BIOMES[world.biome[ty * world.width + tx]!] ?? "temperate";
}

const FRAMES: Rgba[] = Array.from({ length: WAVE_FRAMES }, () => [0, 0, 0, 0] as Rgba);
const REEF_PIXEL: Rgba = [0, 0, 0, 0];

/** A painted chunk: the standing ground, and the moving waves that run under it. */
export interface PaintedChunk {
  /** Land, cliffs and reef shadows. */
  ground: Uint8ClampedArray<ArrayBuffer>;
  /** WAVE_FRAMES images of the foam and shallows, drawn under the ground. */
  waves: Uint8ClampedArray<ArrayBuffer>[];
}
// Contexts reused for every pixel, so painting allocates nothing in its hot loop.
const PIXEL: PixelCtx = { X: 0, Y: 0, u: 0, v: 0, r: 0 };
const WALL: WallCtx = {
  X: 0,
  Y: 0,
  z: 0,
  t: 0,
  lit: 0,
  topZ: 0,
  baseZ: 0,
  top: MAT_GROUND,
  wet: false,
  u: 0,
  v: 0,
  r: 0,
};
const WATER: WaterPixel = { X: 0, Y: 0, u: 0, v: 0, glow: DEFAULT_GLOW, shore: 0 };

/**
 * Paint one chunk of the world (`chunk` × `chunk` tiles starting at tile (cx·chunk, cy·chunk)).
 * Returns RGBA pixels for `rect`, or null when nothing near the chunk is land. Only pixels whose
 * visible surface lies inside the chunk are written, so neighbouring chunks never overlap.
 */
export function paintChunk(
  world: TerrainWorld,
  cx: number,
  cy: number,
  chunk: number,
  rect: PaintRect,
  options: PaintOptions = DEFAULT_OPTIONS,
): PaintedChunk | null {
  const x0 = cx * chunk;
  const y0 = cy * chunk;
  const fields = new Fields(world, x0 - MARGIN, y0 - MARGIN, chunk + MARGIN * 2);
  if (!fields.hasLand) return null;
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  const waves = Array.from(
    { length: WAVE_FRAMES },
    () => new Uint8ClampedArray(rect.w * rect.h * 4),
  );
  const levels = fields.level;
  const cells = fields.n;
  const ox = fields.tx0;
  const oy = fields.ty0;

  // The ray from the top of the tallest cliff to the sea covers this many tiles along its axis;
  // its hits lie within a quarter of that (plus some slack) of the middle point in u and v.
  const mid = LEVEL_PX[MAX_LEVEL]! / 2;
  const reach = LEVEL_PX[MAX_LEVEL]! / HALF_H / 4 + 0.55;
  for (let py = 0; py < rect.h; py++) {
    const Y = rect.y + py;
    // A ray can only hit something this chunk owns when its middle point is near the chunk. That
    // bounds w = u - v for the row, which bounds the columns worth looking at.
    const sMid = (Y + 0.5 + mid) / HALF_H;
    const wLo = Math.max(2 * (x0 - reach) - sMid, sMid - 2 * (y0 + chunk + reach));
    const wHi = Math.min(2 * (x0 + chunk + reach) - sMid, sMid - 2 * (y0 - reach));
    const pxLo = Math.max(0, Math.ceil(wLo * HALF_W - 0.5 - rect.x));
    const pxHi = Math.min(rect.w - 1, Math.floor(wHi * HALF_W - 0.5 - rect.x));
    for (let px = pxLo; px <= pxHi; px++) {
      const X = rect.x + px;
      const w = (X + 0.5) / HALF_W;
      const uMid = (sMid + w) * 0.5;
      const vMid = (sMid - w) * 0.5;

      let kind = 0; // 0 water, 1 top, 2 wall
      let hu = 0;
      let hv = 0;
      let hl = 0;
      let hz = 0;
      const ceiling = fields.maxNearAt(uMid, vMid);
      if (ceiling > 0) {
        march: for (let l = ceiling; l >= 1; l--) {
          const sHi = (Y + 0.5 + LEVEL_PX[l]!) / HALF_H;
          const sLo = (Y + 0.5 + LEVEL_PX[l - 1]!) / HALF_H;
          for (let j = 0; ; j++) {
            const s = sHi - j * STEP;
            if (s < sLo - 1e-9) break;
            const u = (s + w) * 0.5;
            const v = (s - w) * 0.5;
            const ci = Math.floor((u - ox) * CELL);
            const cj = Math.floor((v - oy) * CELL);
            if (ci < 0 || cj < 0 || ci >= cells || cj >= cells) continue;
            const level = levels[cj * cells + ci]!;
            if (level < l) continue;
            hu = u;
            hv = v;
            hl = level;
            if (j === 0 && level === l) {
              kind = 1;
              hz = LEVEL_PX[l]!;
            } else {
              kind = 2;
              hz = s * HALF_H - (Y + 0.5);
            }
            break march;
          }
        }
      }
      if (kind === 0) {
        const s0 = (Y + 0.5) / HALF_H;
        hu = (s0 + w) * 0.5;
        hv = (s0 - w) * 0.5;
      }
      if (hu < x0 || hu >= x0 + chunk || hv < y0 || hv >= y0 + chunk) continue;

      const o = (py * rect.w + px) * 4;
      if (kind === 0) {
        const tx = Math.floor(hu);
        const ty = Math.floor(hv);
        const inMap = tx >= 0 && ty >= 0 && tx < world.width && ty < world.height;
        const k = ty * world.width + tx;
        const shore = inMap ? world.shore[k]! : 255;
        if (shore > 9) continue;
        WATER.X = X;
        WATER.Y = Y;
        WATER.u = hu;
        WATER.v = hv;
        WATER.glow = options.glow(inMap ? world.biome[k]! : 255);
        WATER.shore = shore;
        const fx = shadeWater(fields, world, WATER, FRAMES, REEF_PIXEL);
        if (fx & HAS_WAVES)
          for (let f = 0; f < WAVE_FRAMES; f++) {
            const frame = FRAMES[f]!;
            const image = waves[f]!;
            image[o] = frame[0];
            image[o + 1] = frame[1];
            image[o + 2] = frame[2];
            image[o + 3] = frame[3];
          }
        if (fx & HAS_REEF) {
          out[o] = REEF_PIXEL[0];
          out[o + 1] = REEF_PIXEL[1];
          out[o + 2] = REEF_PIXEL[2];
          out[o + 3] = REEF_PIXEL[3];
        }
        continue;
      }

      const r = hash2(X, Y, 7);
      const art = biomeArt(biomeOf(world, hu, hv));
      let c: Rgba;
      if (kind === 1) {
        const mat = materialAt(world, hu, hv, hl);
        PIXEL.X = X;
        PIXEL.Y = Y;
        PIXEL.u = hu;
        PIXEL.v = hv;
        PIXEL.r = r;
        c = surfaceColor(art, mat, PIXEL);
        if (mat === MAT_SAND && hl === 1) {
          // Wet sand darkens toward the waterline.
          const wet = clamp01((LEVEL_THRESHOLD + 0.3 - fields.landAt(hu, hv)) / 0.3);
          if (wet > 0.35 + (hash2(X, Y, 9) - 0.5) * 0.5)
            c = shade("sand", 0.22 + r * 0.12, X, Y, 0.3);
        }
      } else {
        let nu = 0.707;
        let nv = 0.707;
        if (fields.outward(hu, hv)) {
          nu = fields.nu;
          nv = fields.nv;
        }
        let lo = fields.levelAt(hu + nu * 0.2, hv + nv * 0.2);
        if (lo >= hl) lo = Math.max(0, hl - 1);
        WALL.X = X;
        WALL.Y = Y;
        WALL.z = hz;
        WALL.t = 16 * (-hu * nv + hv * nu);
        WALL.lit = clamp01(0.5 + 0.5 * (nu * LIGHT_U + nv * LIGHT_V));
        WALL.topZ = LEVEL_PX[hl]!;
        WALL.baseZ = Math.min(LEVEL_PX[lo]!, hz);
        WALL.top = materialAt(world, hu, hv, hl);
        WALL.wet = lo === 0;
        WALL.u = hu;
        WALL.v = hv;
        WALL.r = r;
        c = wallColor(art, WALL);
      }
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return { ground: out, waves };
}

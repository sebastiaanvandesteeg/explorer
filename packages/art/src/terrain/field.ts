// Smooth terrain fields. The game world is a grid of tiles; the painter never draws tiles. Instead
// it turns the tile data into continuous fields: each tile has a level (0 water, 1 + elevation for
// land), and the levels are interpolated between tile centres after a wobbling domain warp. The
// contour of that field is what becomes the coast and the cliff edges, so shores come out as
// rounded, irregular curves instead of a staircase of diamonds.
import { Terrain, surfaceHeight } from "@explorer/shared";
import { vnoise } from "../noise";

/** Cells per tile along each axis: the fine grid the painter samples while ray marching. */
export const CELL = 16;
/** Tiles of context around a chunk (foam, glow and the ray march reach this far). */
export const MARGIN = 5;
/** Warp lattice points per tile edge (eighth-tile spacing). */
const LAT = 9;
/** Highest level: elevation 3 land. */
export const MAX_LEVEL = 4;

/** Height in pixels of a level's top surface (level 0 is the water plane). */
export const LEVEL_PX: readonly number[] = Array.from({ length: MAX_LEVEL + 1 }, (_, l) =>
  l === 0 ? 0 : surfaceHeight(true, l - 1),
);

/** The tile data the painter reads (a subset of WorldMap). */
export interface TerrainWorld {
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  biome: Uint8Array;
  shore: Uint8Array;
  /** Tiles paved by finished Path buildings (1) — optional, it changes as the settlement grows. */
  paved?: Uint8Array | undefined;
  /** How trampled the ground is around buildings, 0 (untouched) to 255 (bare earth). */
  wear?: Uint8Array | undefined;
  /** Tiles under a farm (1): ploughed field. */
  field?: Uint8Array | undefined;
}

/** Interpolated indicator value above which a level counts as present. */
export const LEVEL_THRESHOLD = 0.5;

/** Level of a tile: 0 for water and everything outside the map. */
export function tileLevel(world: TerrainWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  const k = y * world.width + x;
  const t = world.terrain[k]!;
  return t === Terrain.Deep || t === Terrain.Shallow ? 0 : world.elevation[k]! + 1;
}

const ROUGH_A = 0x3b1f;
const ROUGH_C = 0x0c97;
const WARP_A = 0x51ed;
const WARP_B = 0x2f6b;
const WARP_C = 0x7a31;
const WARP_D = 0x19c5;

/** Wobble applied to where the tile data is sampled, in tiles. Bigger than a pixel, smaller than a tile. */
export function warpU(u: number, v: number): number {
  return (
    (vnoise(u * 0.42, v * 0.42, WARP_A) - 0.5) * 0.72 +
    (vnoise(u * 1.7 + 9.1, v * 1.7 + 3.3, WARP_C) - 0.5) * 0.3
  );
}

export function warpV(u: number, v: number): number {
  return (
    (vnoise(u * 0.42 + 17.3, v * 0.42 + 8.9, WARP_B) - 0.5) * 0.72 +
    (vnoise(u * 1.7 + 4.4, v * 1.7 + 12.6, WARP_D) - 0.5) * 0.3
  );
}

/** Fine-grid fields for a square window of tiles (a chunk plus MARGIN on every side). */
export class Fields {
  /** First tile of the window. */
  readonly tx0: number;
  readonly ty0: number;
  /** Window size in tiles and in cells. */
  readonly tiles: number;
  readonly n: number;
  /** Level per cell (0 = water). */
  readonly level: Uint8Array;
  /** Continuous elevation surface per cell: the warped, interpolated tile levels. */
  readonly f: Float32Array;
  /** Land indicator per cell in [0, 1]; the coast is where it crosses LEVEL_THRESHOLD. */
  readonly land: Float32Array;
  /** Tile levels with a border of 2 tiles, for interpolation. */
  private readonly lv: Uint8Array;
  private readonly lvStride: number;
  /** Per tile: the highest level within two tiles (0 means only open water, no marching needed). */
  readonly nearLand: Uint8Array;
  /** Per tile: 1 when the tile is land or within a tile of it (fine fields are computed there). */
  private readonly active: Uint8Array;
  /** Per tile: 1 when a contour can pass through it (the fine fields were interpolated). */
  private readonly mixed: Uint8Array;
  hasLand = false;

  constructor(
    private readonly world: TerrainWorld,
    tx0: number,
    ty0: number,
    tiles: number,
  ) {
    this.tx0 = tx0;
    this.ty0 = ty0;
    this.tiles = tiles;
    this.n = tiles * CELL;
    this.level = new Uint8Array(this.n * this.n);
    this.f = new Float32Array(this.n * this.n);
    this.land = new Float32Array(this.n * this.n);
    this.lvStride = tiles + 4;
    this.lv = new Uint8Array(this.lvStride * this.lvStride);
    this.nearLand = new Uint8Array(tiles * tiles);
    this.active = new Uint8Array(tiles * tiles);
    this.mixed = new Uint8Array(tiles * tiles);
    this.build();
  }

  /** Level of the tile at window-relative (lx, ly), which may lie in the 2-tile border. */
  private lvAt(lx: number, ly: number): number {
    return this.lv[(ly + 2) * this.lvStride + lx + 2]!;
  }

  private build(): void {
    const { tiles, world } = this;
    for (let ly = -2; ly < tiles + 2; ly++)
      for (let lx = -2; lx < tiles + 2; lx++) {
        const l = tileLevel(world, this.tx0 + lx, this.ty0 + ly);
        this.lv[(ly + 2) * this.lvStride + lx + 2] = l;
        if (l > 0) this.hasLand = true;
      }
    if (!this.hasLand) return;
    for (let ly = 0; ly < tiles; ly++)
      for (let lx = 0; lx < tiles; lx++) {
        let near2 = 0;
        let near1 = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const l = this.lvAt(lx + dx, ly + dy);
            if (l === 0) continue;
            if (l > near2) near2 = l;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) near1 = 1;
          }
        this.nearLand[ly * tiles + lx] = near2;
        this.active[ly * tiles + lx] = near1;
      }
    for (let ly = 0; ly < tiles; ly++)
      for (let lx = 0; lx < tiles; lx++) {
        if (!this.active[ly * tiles + lx]) continue;
        this.fillTile(lx, ly);
      }
    this.removeSlivers();
  }

  /**
   * Cliff levels come from a rough sample, which at the saddles of the interpolated field can leave
   * spikes and specks a few cells wide. Wherever less than half the surrounding cells stand at least
   * as high, a raised cell drops a level, which trims those without touching real cliffs.
   */
  private removeSlivers(): void {
    const { n, tiles } = this;
    const src = this.level.slice();
    const r = 3;
    for (let ly = 0; ly < tiles; ly++)
      for (let lx = 0; lx < tiles; lx++) {
        if (!this.mixed[ly * tiles + lx]) continue;
        for (let cj = ly * CELL; cj < (ly + 1) * CELL; cj++)
          for (let ci = lx * CELL; ci < (lx + 1) * CELL; ci++) {
            let level = src[cj * n + ci]!;
            if (level < 2) continue;
            while (level >= 2) {
              let same = 0;
              let total = 0;
              for (let dj = -r; dj <= r; dj++) {
                const j = cj + dj;
                if (j < 0 || j >= n) continue;
                for (let di = -r; di <= r; di++) {
                  const i = ci + di;
                  if (i < 0 || i >= n) continue;
                  total++;
                  if (src[j * n + i]! >= level) same++;
                }
              }
              if (same * 2 >= total) break;
              level--;
            }
            this.level[cj * n + ci] = level;
          }
      }
  }

  private readonly latU = new Float32Array(LAT * LAT);
  private readonly latV = new Float32Array(LAT * LAT);

  /** The level shared by every tile the warp could reach from (lx, ly), or -1 when they differ. */
  private uniformLevel(lx: number, ly: number): number {
    const first = this.lvAt(lx - 1, ly - 1);
    for (let dy = -1; dy <= 2; dy++)
      for (let dx = -1; dx <= 2; dx++) if (this.lvAt(lx + dx, ly + dy) !== first) return -1;
    return first;
  }

  private fillTile(lx: number, ly: number): void {
    const n = this.n;
    const uniform = this.uniformLevel(lx, ly);
    if (uniform >= 0) {
      // Deep inside a plateau or open water: no contour can pass through, skip the interpolation.
      for (let cj = 0; cj < CELL; cj++) {
        const row = (ly * CELL + cj) * n + lx * CELL;
        this.level.fill(uniform, row, row + CELL);
        this.f.fill(uniform, row, row + CELL);
        this.land.fill(uniform > 0 ? 1 : 0, row, row + CELL);
      }
      return;
    }
    this.mixed[ly * this.tiles + lx] = 1;
    const tu = this.tx0 + lx;
    const tv = this.ty0 + ly;
    // The warp is smooth, so evaluate it on a lattice of eighth-tile spacing and interpolate.
    for (let j = 0; j < LAT; j++)
      for (let i = 0; i < LAT; i++) {
        const u = tu + i / 8;
        const v = tv + j / 8;
        this.latU[j * LAT + i] = warpU(u, v);
        this.latV[j * LAT + i] = warpV(u, v);
      }
    for (let cj = 0; cj < CELL; cj++) {
      const j0 = cj >> 1;
      const fj = (cj & 1) === 0 ? 0.25 : 0.75;
      for (let ci = 0; ci < CELL; ci++) {
        const i0 = ci >> 1;
        const fi = (ci & 1) === 0 ? 0.25 : 0.75;
        const k00 = j0 * LAT + i0;
        const wa = (1 - fi) * (1 - fj);
        const wb = fi * (1 - fj);
        const wc = (1 - fi) * fj;
        const wd = fi * fj;
        const du =
          this.latU[k00]! * wa +
          this.latU[k00 + 1]! * wb +
          this.latU[k00 + LAT]! * wc +
          this.latU[k00 + LAT + 1]! * wd;
        const dv =
          this.latV[k00]! * wa +
          this.latV[k00 + 1]! * wb +
          this.latV[k00 + LAT]! * wc +
          this.latV[k00 + LAT + 1]! * wd;
        const cu = tu + (ci + 0.5) / CELL;
        const cv = tv + (cj + 0.5) / CELL;
        const pu = lx + (ci + 0.5) / CELL + du - 0.5;
        const pv = ly + (cj + 0.5) / CELL + dv - 0.5;
        const i = Math.floor(pu);
        const j = Math.floor(pv);
        const a = pu - i;
        const b = pv - j;
        const l00 = this.lvAt(i, j);
        const l10 = this.lvAt(i + 1, j);
        const l01 = this.lvAt(i, j + 1);
        const l11 = this.lvAt(i + 1, j + 1);
        const w00 = (1 - a) * (1 - b);
        const w10 = a * (1 - b);
        const w01 = (1 - a) * b;
        const w11 = a * b;
        // The coast comes from the smooth sample. Every level above the beach gets a sample of its
        // own with extra jitter, rougher the higher it goes, so tall rock steps in and out from
        // level to level instead of rising in one clean extrusion. Levels are clipped to the
        // coast, so no cliff ever stands in the sea.
        const coast =
          (l00 > 0 ? w00 : 0) + (l10 > 0 ? w10 : 0) + (l01 > 0 ? w01 : 0) + (l11 > 0 ? w11 : 0);
        const highest = Math.max(l00, l10, l01, l11);
        let level = 0;
        let surface = coast;
        if (coast >= LEVEL_THRESHOLD) level = 1;
        let open = level === 1;
        for (let k = 2; k <= highest; k++) {
          const rough = 0.2 + 0.09 * (k - 2);
          const qu = pu + (vnoise(cu * 3.1 + 7 * k, cv * 3.1, ROUGH_A + k) - 0.5) * rough;
          const qv =
            pv + (vnoise(cu * 3.1 + 6.1, cv * 3.1 + 2.7 + 5 * k, ROUGH_C + k) - 0.5) * rough;
          const ri = Math.floor(qu);
          const rj = Math.floor(qv);
          const ra = qu - ri;
          const rb = qv - rj;
          const ind =
            (this.lvAt(ri, rj) >= k ? (1 - ra) * (1 - rb) : 0) +
            (this.lvAt(ri + 1, rj) >= k ? ra * (1 - rb) : 0) +
            (this.lvAt(ri, rj + 1) >= k ? (1 - ra) * rb : 0) +
            (this.lvAt(ri + 1, rj + 1) >= k ? ra * rb : 0);
          surface += ind;
          if (open && ind >= LEVEL_THRESHOLD) level = k;
          else open = false;
        }
        const idx = (ly * CELL + cj) * n + lx * CELL + ci;
        this.level[idx] = level;
        this.f[idx] = surface;
        this.land[idx] = coast;
      }
    }
  }

  /** Level at a world position (tile units); 0 outside the window. */
  levelAt(u: number, v: number): number {
    const ci = Math.floor((u - this.tx0) * CELL);
    const cj = Math.floor((v - this.ty0) * CELL);
    if (ci < 0 || cj < 0 || ci >= this.n || cj >= this.n) return 0;
    return this.level[cj * this.n + ci]!;
  }

  /** Land indicator at a world position; 0 outside the window. */
  landAt(u: number, v: number): number {
    const ci = Math.floor((u - this.tx0) * CELL);
    const cj = Math.floor((v - this.ty0) * CELL);
    if (ci < 0 || cj < 0 || ci >= this.n || cj >= this.n) return 0;
    return this.land[cj * this.n + ci]!;
  }

  /** The highest level within two tiles of the tile under (u, v); 0 when only water is near. */
  maxNearAt(u: number, v: number): number {
    const lx = Math.floor(u - this.tx0);
    const ly = Math.floor(v - this.ty0);
    if (lx < 0 || ly < 0 || lx >= this.tiles || ly >= this.tiles) return 0;
    return this.nearLand[ly * this.tiles + lx]!;
  }

  /** Result of `outward`: a unit vector in tile space. */
  nu = 0;
  nv = 0;

  /**
   * Direction pointing from high ground to low ground across a contour, from the gradient of the
   * elevation surface, stored in `nu`/`nv`. Returns false on flat ground.
   */
  outward(u: number, v: number): boolean {
    const ci = Math.floor((u - this.tx0) * CELL);
    const cj = Math.floor((v - this.ty0) * CELL);
    const r = 2;
    if (ci < r || cj < r || ci >= this.n - r || cj >= this.n - r) return false;
    const n = this.n;
    const gu = this.f[cj * n + ci + r]! - this.f[cj * n + ci - r]!;
    const gv = this.f[(cj + r) * n + ci]! - this.f[(cj - r) * n + ci]!;
    const len = Math.hypot(gu, gv);
    if (len < 1e-4) return false;
    this.nu = -gu / len;
    this.nv = -gv / len;
    return true;
  }
}

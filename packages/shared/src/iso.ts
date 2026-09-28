// 2:1 dimetric projection. World coordinates are continuous tile units: tile (x, y) covers
// [x, x+1) × [y, y+1) and its top (back) vertex projects to screen ((x - y) * 16, (x + y) * 8).

export const TILE_W = 32;
export const TILE_H = 16;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Screen pixels per elevation level. */
export const ELEV_PX = 8;
/** Land sits this many pixels above the water plane, even at elevation 0. */
export const LAND_BASE_PX = 4;
export const MAX_ELEVATION = 3;
/** Screen pixels per world unit of height (true 30° dimetric), used for 3D sprite modelling. */
export const Z_SCALE = 19.6;

export interface Point {
  x: number;
  y: number;
}

export function worldToScreen(wx: number, wy: number, zPx = 0): Point {
  return { x: (wx - wy) * HALF_W, y: (wx + wy) * HALF_H - zPx };
}

export function screenToWorld(sx: number, sy: number, zPx = 0): Point {
  const a = sx / HALF_W;
  const b = (sy + zPx) / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Height in screen pixels of a tile's top surface above the water plane. */
export function surfaceHeight(land: boolean, elevation: number): number {
  return land ? LAND_BASE_PX + elevation * ELEV_PX : 0;
}

const CANDIDATE_HEIGHTS = Array.from({ length: MAX_ELEVATION + 1 }, (_, e) =>
  surfaceHeight(true, e),
)
  .reverse()
  .concat(0);

/**
 * Elevation-aware tile picking. Higher surfaces at a given screen point belong to tiles further
 * in front, so testing from the highest candidate down returns the visible tile.
 * `heightAt` returns the surface height of a tile or null when it's outside the map.
 */
export function pickTile(
  sx: number,
  sy: number,
  heightAt: (x: number, y: number) => number | null,
): Point | null {
  for (const h of CANDIDATE_HEIGHTS) {
    const w = screenToWorld(sx, sy, h);
    const tx = Math.floor(w.x);
    const ty = Math.floor(w.y);
    if (heightAt(tx, ty) === h) return { x: tx, y: ty };
  }
  return null;
}

/** Painter's-order depth for something standing on world position (wx, wy). */
export function depthOf(wx: number, wy: number): number {
  return wx + wy;
}

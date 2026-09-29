// Terrain is drawn under every sprite, so something standing on low ground behind a tall cliff or
// hill would be painted over the cliff. Instead of drawing it wrongly, it fades to a ghost.
import { HALF_H, isLandTerrain, surfaceHeight, type WorldMap } from "@explorer/shared";

type Heights = Pick<WorldMap, "width" | "height" | "terrain" | "elevation">;

/** Height of the surface of tile (x, y): sea level for water and everything off the map. */
export function groundHeight(w: Heights, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return 0;
  const k = y * w.width + x;
  return surfaceHeight(isLandTerrain(w.terrain[k]!), w.elevation[k]!);
}

/**
 * How many pixels terrain in front of a point rises above the line of sight from the camera to
 * it, or a negative number when nothing does. The camera looks along the tile diagonal, and the
 * line of sight climbs two half-tiles of height for every tile it advances.
 */
export function coverAt(w: Heights, x: number, y: number, z: number): number {
  let cover = -Infinity;
  for (let t = 0.5; t <= 3.5; t += 0.5) {
    const line = z + 2 * HALF_H * t;
    cover = Math.max(cover, groundHeight(w, Math.floor(x + t), Math.floor(y + t)) - line);
  }
  return cover;
}

/** Opacity for something whose base is `cover` pixels behind terrain: solid, then a ghost. */
export function coverAlpha(cover: number): number {
  const t = Math.min(1, Math.max(0, (cover - 3) / 13));
  return 1 - 0.65 * t * t * (3 - 2 * t);
}

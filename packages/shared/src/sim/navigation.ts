import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { findPath, type Tile } from "../world/pathfind";
import type { WorldMap } from "../world/types";
import { isPathTile, walkable, type GameState } from "./state";

/** Villager route over land: free tiles, one elevation step at a time, faster on paths. */
export function landPath(state: GameState, from: Tile, goals: Tile[]): Tile[] | null {
  const w = state.world;
  return findPath(
    {
      width: w.width,
      height: w.height,
      canMove: (ax, ay, bx, by) =>
        walkable(state, bx, by) &&
        Math.abs(w.elevation[tileIndex(w, ax, ay)]! - w.elevation[tileIndex(w, bx, by)]!) <= 1,
      cost: (x, y) => (isPathTile(state, x, y) ? 0.65 : 1),
      maxNodes: 12_000,
    },
    from,
    goals,
  );
}

const seaRockCache = new WeakMap<WorldMap, Set<number>>();

/** Water tiles ships cannot enter: sea rocks, and both feet of every sea arch. */
function seaRocks(world: WorldMap): Set<number> {
  let set = seaRockCache.get(world);
  if (!set) {
    set = new Set();
    for (const d of world.decor) {
      if (d.kind === "sea_rock") set.add(tileIndex(world, d.x, d.y));
      else if (d.kind === "sea_arch")
        set.add(d.variant === 0 ? tileIndex(world, d.x + 1, d.y) : tileIndex(world, d.x, d.y + 1));
      if (d.kind === "sea_arch") set.add(tileIndex(world, d.x, d.y));
    }
    seaRockCache.set(world, set);
  }
  return set;
}

export function sailable(state: GameState, x: number, y: number): boolean {
  const w = state.world;
  if (!inBounds(w, x, y)) return false;
  const k = tileIndex(w, x, y);
  return !isLandTerrain(w.terrain[k]!) && state.occupancy[k] === 0 && !seaRocks(w).has(k);
}

export function seaPath(state: GameState, from: Tile, to: Tile): Tile[] | null {
  const w = state.world;
  return findPath(
    {
      width: w.width,
      height: w.height,
      canMove: (_ax, _ay, bx, by) => sailable(state, bx, by),
      maxNodes: 60_000,
    },
    from,
    [to],
  );
}

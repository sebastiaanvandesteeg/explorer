import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { DIR_VECTORS, Terrain, type Dir } from "../world/types";
import { BUILDINGS, canAfford, type BuildingKind } from "./catalogue";
import { dockSpawn } from "./ferry";
import { sailable } from "./navigation";
import { settledIslands, walkable, type BuildingEntity, type GameState } from "./state";

/** Where a new dock's pier goes: its footprint and the way it points out to sea. */
export interface DockSite {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Dir;
}

export type PlaceCheck = { ok: true; site?: DockSite } | { ok: false; reason: string };

const PIER_SIDE: Record<Dir, { x: number; y: number }> = {
  "+x": { x: 0, y: 1 },
  "-x": { x: 0, y: 1 },
  "+y": { x: 1, y: 0 },
  "-y": { x: 1, y: 0 },
};
const PIER_DIRS: Dir[] = ["+x", "+y", "-x", "-y"];

/**
 * A pier that starts at the shore tile (lx, ly) and runs three tiles out to sea, two wide, with
 * open water past its end for ships. Docks are placed by clicking the shore, not the sea.
 */
export function dockSite(state: GameState, lx: number, ly: number): DockSite | null {
  for (const dir of PIER_DIRS) {
    const site = dockSiteFacing(state, lx, ly, dir);
    if (site) return site;
  }
  return null;
}

export function dockSiteFacing(
  state: GameState,
  lx: number,
  ly: number,
  dir: Dir,
): DockSite | null {
  const w = state.world;
  if (!walkable(state, lx, ly)) return null;
  const d = DIR_VECTORS[dir];
  const p = PIER_SIDE[dir];
  const tiles: { x: number; y: number }[] = [];
  for (let s = 1; s <= 3; s++)
    for (let j = 0; j <= 1; j++)
      tiles.push({ x: lx + d.x * s + p.x * j, y: ly + d.y * s + p.y * j });
  const alongX = dir === "+x" || dir === "-x";
  const site: DockSite = {
    x: Math.min(...tiles.map((t) => t.x)),
    y: Math.min(...tiles.map((t) => t.y)),
    w: alongX ? 3 : 2,
    h: alongX ? 2 : 3,
    dir,
  };
  const spawn = dockSpawn(site);
  const open = [...tiles, { x: Math.floor(spawn.x), y: Math.floor(spawn.y) }];
  for (const t of open) {
    if (!inBounds(w, t.x, t.y) || !state.explored[tileIndex(w, t.x, t.y)]) return null;
    if (!sailable(state, t.x, t.y)) return null;
  }
  return site;
}

/** Placement rules shared by the server (authoritative) and the client (ghost preview). */
export function canPlaceBuilding(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
  opts: { ignoreCost?: boolean } = {},
): PlaceCheck {
  const def = BUILDINGS[kind];
  if (!def.buildable) return { ok: false, reason: "That can't be built" };
  const w = state.world;
  if (kind === "dock") return canPlaceDock(state, x, y, opts);
  if (kind === "great_work") {
    for (const e of state.entities.values())
      if (e.type === "building" && e.kind === "great_work")
        return { ok: false, reason: "Only one Great Work can be raised" };
  }
  const [fw, fh] = def.size;
  let elevation = -1;
  const settled = settledIslands(state);
  for (let ty = y; ty < y + fh; ty++) {
    for (let tx = x; tx < x + fw; tx++) {
      if (!inBounds(w, tx, ty)) return { ok: false, reason: "Outside the map" };
      const k = tileIndex(w, tx, ty);
      if (!state.explored[k]) return { ok: false, reason: "Unexplored" };
      const t = w.terrain[k]!;
      if (!isLandTerrain(t)) return { ok: false, reason: "Needs dry land" };
      if (!settled.has(w.island[k]!))
        return { ok: false, reason: "Ferry villagers to this island by ship first" };
      if (kind === "great_work" && w.island[k] !== w.start.islandId)
        return { ok: false, reason: "The Great Work belongs on the home island" };
      if (kind === "farm" && t !== Terrain.Grass && t !== Terrain.Dirt)
        return { ok: false, reason: "Farms need grass" };
      const e = w.elevation[k]!;
      if (elevation >= 0 && e !== elevation) return { ok: false, reason: "Ground isn't flat" };
      elevation = e;
      const occupant = state.entities.get(state.occupancy[k]!);
      if (occupant) {
        const clearable =
          occupant.type === "node" && (occupant.stage === "stump" || occupant.stage === "sapling");
        if (!clearable)
          return {
            ok: false,
            reason: occupant.type === "node" ? "Clear the land first" : "Blocked",
          };
      }
    }
  }
  for (const e of state.entities.values()) {
    if (e.type !== "villager" && e.type !== "character") continue;
    const vx = Math.floor(e.x);
    const vy = Math.floor(e.y);
    if (vx >= x && vx < x + fw && vy >= y && vy < y + fh && kind !== "path") {
      return {
        ok: false,
        reason:
          e.type === "villager" ? "A villager is standing there" : "Someone is standing there",
      };
    }
  }
  if (!opts.ignoreCost && !canAfford(state.stock, def.cost))
    return { ok: false, reason: "Not enough resources" };
  return { ok: true };
}

/** Walkable tiles around a rectangle (8-neighbourhood ring), where villagers work from. */
export function tilesAround(
  state: GameState,
  x: number,
  y: number,
  w = 1,
  h = 1,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let ty = y - 1; ty <= y + h; ty++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      const inside = tx >= x && tx < x + w && ty >= y && ty < y + h;
      if (!inside && walkable(state, tx, ty)) out.push({ x: tx, y: ty });
    }
  }
  return out;
}

export function buildingAround(state: GameState, b: BuildingEntity): { x: number; y: number }[] {
  return tilesAround(state, b.x, b.y, b.w, b.h);
}

export function isAdjacentTo(tx: number, ty: number, x: number, y: number, w = 1, h = 1): boolean {
  return (
    tx >= x - 1 &&
    tx <= x + w &&
    ty >= y - 1 &&
    ty <= y + h &&
    !(tx >= x && tx < x + w && ty >= y && ty < y + h)
  );
}

/** Nearest water tile to (x, y), searching outward in rings (ships target water). */
export function nearestWater(
  state: GameState,
  x: number,
  y: number,
  maxRadius = 6,
): { x: number; y: number } | null {
  const w = state.world;
  for (let r = 0; r <= maxRadius; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let ty = y - r; ty <= y + r; ty++) {
      for (let tx = x - r; tx <= x + r; tx++) {
        if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) !== r) continue;
        if (!inBounds(w, tx, ty)) continue;
        const k = tileIndex(w, tx, ty);
        if (isLandTerrain(w.terrain[k]!) || state.occupancy[k] !== 0) continue;
        const d = Math.hypot(tx - x, ty - y);
        if (!best || d < best.d) best = { x: tx, y: ty, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

/** Docks are placed on a shore tile; the pier is worked out from the surrounding water. */
function canPlaceDock(
  state: GameState,
  x: number,
  y: number,
  opts: { ignoreCost?: boolean },
): PlaceCheck {
  const w = state.world;
  if (!inBounds(w, x, y)) return { ok: false, reason: "Outside the map" };
  const k = tileIndex(w, x, y);
  if (!state.explored[k]) return { ok: false, reason: "Unexplored" };
  if (!isLandTerrain(w.terrain[k]!))
    return { ok: false, reason: "Click the shore to place a dock" };
  if (!settledIslands(state).has(w.island[k]!))
    return { ok: false, reason: "Ferry villagers to this island by ship first" };
  const site = dockSite(state, x, y);
  if (!site) return { ok: false, reason: "No open water for a pier here" };
  if (!opts.ignoreCost && !canAfford(state.stock, BUILDINGS.dock.cost))
    return { ok: false, reason: "Not enough resources" };
  return { ok: true, site };
}

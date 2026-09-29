import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { Terrain } from "../world/types";
import { BUILDINGS, canAfford, type BuildingKind } from "./catalogue";
import { settledIslands, walkable, type BuildingEntity, type GameState } from "./state";

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

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
    if (e.type !== "villager") continue;
    const vx = Math.floor(e.x);
    const vy = Math.floor(e.y);
    if (vx >= x && vx < x + fw && vy >= y && vy < y + fh && kind !== "path") {
      return { ok: false, reason: "A villager is standing there" };
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

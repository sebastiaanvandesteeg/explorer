import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { Terrain, type Dir } from "../world/types";
import { BUILDINGS, PIER_TIERS, canAfford, type BuildingKind } from "./catalogue";
import { dockSpawn } from "./ferry";
import { sailable } from "./navigation";
import { settledIslands, walkable, type BuildingEntity, type GameState } from "./state";

/** A rectangle of tiles. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a new harbour goes: its body on land, its pier out over the water and the way it points. */
export interface HarbourSite {
  body: Rect;
  pier: Rect;
  dir: Dir;
}

export type PlaceCheck = { ok: true; site?: HarbourSite } | { ok: false; reason: string };

const PIER_DIRS: Dir[] = ["+x", "+y", "-x", "-y"];

/**
 * The pier of a harbour whose water-side shore tile is (ax, ay): `length` tiles out to sea in
 * direction `dir`, `width` tiles across, with the shore tile in line with its middle.
 */
export function pierRect(ax: number, ay: number, dir: Dir, length: number, width: number): Rect {
  const back = Math.floor((width - 1) / 2);
  switch (dir) {
    case "+x":
      return { x: ax + 1, y: ay - back, w: length, h: width };
    case "-x":
      return { x: ax - length, y: ay - back, w: length, h: width };
    case "+y":
      return { x: ax - back, y: ay + 1, w: width, h: length };
    default:
      return { x: ax - back, y: ay - length, w: width, h: length };
  }
}

/** How far along a pier (0 at the shore) and across it (below 0 or past its width: beside it). */
export function pierLocal(
  pier: Rect,
  dir: Dir,
  x: number,
  y: number,
): { along: number; across: number } {
  switch (dir) {
    case "+x":
      return { along: x - pier.x, across: y - pier.y };
    case "-x":
      return { along: pier.x + pier.w - 1 - x, across: y - pier.y };
    case "+y":
      return { along: y - pier.y, across: x - pier.x };
    default:
      return { along: pier.y + pier.h - 1 - y, across: x - pier.x };
  }
}

/** The harbour's body: a platform on piles in the water beside the pier's root, `side` 0 or 1. */
export function bodyBeside(pier: Rect, dir: Dir, side: 0 | 1): Rect {
  const alongX = dir === "+x" || dir === "-x";
  const along = 2;
  const depth = 3;
  if (alongX) {
    const x = dir === "+x" ? pier.x : pier.x + pier.w - along;
    return { x, y: side === 0 ? pier.y - depth : pier.y + pier.h, w: along, h: depth };
  }
  const y = dir === "+y" ? pier.y : pier.y + pier.h - along;
  return { x: side === 0 ? pier.x - depth : pier.x + pier.w, y, w: depth, h: along };
}

/** Whether every tile of a rectangle is open, free water (explored, unless told otherwise). */
export function openWater(
  state: GameState,
  r: Rect,
  opts: { ignore?: number; explored?: boolean } = {},
): boolean {
  const w = state.world;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inBounds(w, x, y)) return false;
      const k = tileIndex(w, x, y);
      if ((opts.explored ?? true) && !state.explored[k]) return false;
      if (isLandTerrain(w.terrain[k]!)) return false;
      const occ = state.occupancy[k]!;
      if (occ !== 0 && occ !== opts.ignore) return false;
      if (occ === 0 && !sailable(state, x, y)) return false;
    }
  return true;
}

/** Open water for a pier and the berth just past its end (`ignore`: the pier's own id). */
export function pierWater(
  state: GameState,
  pier: Rect,
  dir: Dir,
  ignore?: number,
  explored = true,
): boolean {
  const spawn = dockSpawn({ ...pier, dir });
  const tip = { x: Math.floor(spawn.x), y: Math.floor(spawn.y), w: 1, h: 1 };
  return (
    openWater(state, pier, { ...(ignore !== undefined ? { ignore } : {}), explored }) &&
    openWater(state, tip, { explored })
  );
}

/** Where a harbour would go if the land tile (lx, ly) is clicked, or null. */
export function harbourSite(
  state: GameState,
  lx: number,
  ly: number,
  opts: { ignoreCost?: boolean } = {},
): HarbourSite | null {
  const check = canPlaceBuilding(state, "harbour", lx, ly, opts);
  return check.ok ? (check.site ?? null) : null;
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
  if (kind === "harbour") return canPlaceHarbour(state, x, y, opts);
  if (kind === "great_work") {
    for (const e of state.entities.values())
      if (e.type === "building" && e.kind === "great_work")
        return { ok: false, reason: "Only one Great Work can be raised" };
  }
  const [fw, fh] = def.size;
  return checkFootprint(state, kind, { x, y, w: fw, h: fh }, opts);
}

/** The ground rules for putting a building on a rectangle of land. */
export function checkFootprint(
  state: GameState,
  kind: BuildingKind,
  r: Rect,
  opts: { ignoreCost?: boolean } = {},
): PlaceCheck {
  const def = BUILDINGS[kind];
  const w = state.world;
  const { x, y, w: fw, h: fh } = r;
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

/** Harbours are placed by clicking a shore tile; the pier and the body on piles are worked out. */
function canPlaceHarbour(
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
    return { ok: false, reason: "Click the shore to place a harbour" };
  if (!settledIslands(state).has(w.island[k]!))
    return { ok: false, reason: "Ferry villagers to this island by ship first" };
  if (!walkable(state, x, y)) return { ok: false, reason: "Clear the shore first" };
  for (const dir of PIER_DIRS) {
    const pier = pierRect(x, y, dir, PIER_TIERS[0].length, PIER_TIERS[0].width);
    if (!pierWater(state, pier, dir)) continue;
    for (const side of [0, 1] as const) {
      const body = bodyBeside(pier, dir, side);
      if (!openWater(state, body)) continue;
      if (!opts.ignoreCost && !canAfford(state.stock, BUILDINGS.harbour.cost))
        return { ok: false, reason: "Not enough resources" };
      return { ok: true, site: { body, pier, dir } };
    }
  }
  return { ok: false, reason: "Needs open water along the coast for a pier and a platform" };
}

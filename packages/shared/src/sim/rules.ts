import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { DIR_VECTORS, Terrain, type Dir } from "../world/types";
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
 * The pier of a harbour whose water-side land tile is (ax, ay): `length` tiles out to sea in
 * direction `dir`, `width` tiles across, lined up with the middle of the harbour's body (two wide
 * starts at the anchor, wider ones reach one tile back along the shore).
 */
export function pierRect(ax: number, ay: number, dir: Dir, length: number, width: number): Rect {
  const back = width >= 3 ? 1 : 0;
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

/**
 * The harbour's body: 3 tiles along the shore, 2 deep, on the land side of the anchor. `side` slides
 * it along the shore (-1 or +1) so that one edge of the pier stays beside open shore: that is how
 * people walk from the land onto the pier.
 */
export function harbourBody(ax: number, ay: number, dir: Dir, side: -1 | 1 = -1): Rect {
  const across = side < 0 ? -2 : 0;
  switch (dir) {
    case "+x":
      return { x: ax - 1, y: ay + across, w: 2, h: 3 };
    case "-x":
      return { x: ax, y: ay + across, w: 2, h: 3 };
    case "+y":
      return { x: ax + across, y: ay - 1, w: 3, h: 2 };
    default:
      return { x: ax + across, y: ay, w: 3, h: 2 };
  }
}

/** Whether people can walk onto the pier from free shore (not through the harbour's body). */
export function pierAccess(state: GameState, pier: Rect, body: Rect): boolean {
  const w = state.world;
  const inside = (r: Rect, x: number, y: number) =>
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  for (let y = pier.y - 1; y <= pier.y + pier.h; y++)
    for (let x = pier.x - 1; x <= pier.x + pier.w; x++) {
      if (inside(pier, x, y) || inside(body, x, y)) continue;
      // Only tiles that share an edge with the pier count.
      const edge = x >= pier.x && x < pier.x + pier.w ? true : y >= pier.y && y < pier.y + pier.h;
      if (!edge || !inBounds(w, x, y)) continue;
      if (isLandTerrain(w.terrain[tileIndex(w, x, y)]!) && walkable(state, x, y)) return true;
    }
  return false;
}

/** Open, explored water for a pier and the berth just past its end (`ignore`: the pier's own id). */
export function pierWater(
  state: GameState,
  pier: Rect,
  dir: Dir,
  ignore?: number,
  explored = true,
): boolean {
  const w = state.world;
  const spawn = dockSpawn({ ...pier, dir });
  const tiles: { x: number; y: number }[] = [{ x: Math.floor(spawn.x), y: Math.floor(spawn.y) }];
  for (let y = pier.y; y < pier.y + pier.h; y++)
    for (let x = pier.x; x < pier.x + pier.w; x++) tiles.push({ x, y });
  for (const t of tiles) {
    if (!inBounds(w, t.x, t.y)) return false;
    const k = tileIndex(w, t.x, t.y);
    if (explored && !state.explored[k]) return false;
    if (isLandTerrain(w.terrain[k]!)) return false;
    const occ = state.occupancy[k]!;
    if (occ !== 0 && occ !== ignore) return false;
    if (occ === 0 && !sailable(state, t.x, t.y)) return false;
  }
  return true;
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
  const w = state.world;
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

/** Harbours are placed by clicking a shore tile; the body and the pier are worked out around it. */
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
  let why = "Needs open water and flat land on the coast";
  for (const dir of PIER_DIRS) {
    const pier = pierRect(x, y, dir, PIER_TIERS[0].length, PIER_TIERS[0].width);
    if (!pierWater(state, pier, dir)) continue;
    for (const side of [-1, 1] as const) {
      const body = harbourBody(x, y, dir, side);
      if (!pierAccess(state, pier, body)) {
        why = "The pier needs open shore beside it to walk onto";
        continue;
      }
      const check = checkFootprint(state, "harbour", body, opts);
      if (check.ok) return { ok: true, site: { body, pier, dir } };
      why = check.reason;
    }
  }
  return { ok: false, reason: why };
}

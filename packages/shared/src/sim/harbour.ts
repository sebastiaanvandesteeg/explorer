// Harbours: a body on the coast (the harbourmaster's room, the ship queue) and a pier that runs out
// over the water and grows with the harbour upgrades. The pier is a walkable `dock` entity owned by
// the harbour; ships launch from, and dock at, the water just past its end.
import { isLandTerrain, tileIndex } from "../world/grid";
import { PIER_TIERS } from "./catalogue";
import { dockSpawn } from "./ferry";
import { pierAccess, pierRect, pierWater, type HarbourSite, type Rect } from "./rules";
import {
  addEntity,
  markDirty,
  removeEntity,
  newBuilding,
  occupy,
  pierTier,
  type BuildingEntity,
  type GameState,
} from "./state";
import type { Dir } from "../world/types";

export const isHarbourKind = (kind: string): boolean => kind === "harbour";

/** The pier of a harbour (or the dock itself for an old save's stand-alone dock). */
export function pierOf(state: GameState, b: BuildingEntity): BuildingEntity | null {
  if (b.kind === "dock") return b;
  if (b.kind !== "harbour" || b.pier === undefined) return null;
  const p = state.entities.get(b.pier);
  return p?.type === "building" ? p : null;
}

/** The harbour or stand-alone dock that a pier belongs to. */
export function ownerOf(state: GameState, pier: BuildingEntity): BuildingEntity {
  if (pier.harbour === undefined) return pier;
  const h = state.entities.get(pier.harbour);
  return h?.type === "building" ? h : pier;
}

/** Whether a building is a working berth: a finished harbour, or an old save's finished dock. */
export function isBerth(state: GameState, b: BuildingEntity): boolean {
  if (!b.complete) return false;
  if (b.kind === "harbour") return pierOf(state, b) !== null;
  if (b.kind === "dock") return b.harbour === undefined || ownerOf(state, b).complete;
  return false;
}

/** Where ships launch from and dock at: just past the end of the harbour's pier. */
export function berthOf(state: GameState, b: BuildingEntity): { x: number; y: number } {
  const pier = pierOf(state, b) ?? b;
  return dockSpawn(pier);
}

/** Whether a building stands on the home island. */
export function isHome(state: GameState, b: BuildingEntity): boolean {
  const w = state.world;
  return w.island[tileIndex(w, b.x, b.y)] === w.start.islandId;
}

/** Every working berth: what the dock checks used to loop over. */
export function berths(state: GameState): BuildingEntity[] {
  const out: BuildingEntity[] = [];
  for (const e of state.entities.values())
    if (
      e.type === "building" &&
      (e.kind === "harbour" || (e.kind === "dock" && e.harbour === undefined)) &&
      isBerth(state, e)
    )
      out.push(e);
  return out;
}

/** Put a new harbour and its pier on the map. The pier is finished when the harbour is. */
export function placeHarbour(
  state: GameState,
  site: HarbourSite,
  complete: boolean,
): BuildingEntity {
  // The pier is walkable at once; only the harbour itself is built by villagers.
  const pier = newBuilding(state, "dock", site.pier.x, site.pier.y, true, site.dir);
  pier.w = site.pier.w;
  pier.h = site.pier.h;
  const body = newBuilding(state, "harbour", site.body.x, site.body.y, complete);
  body.w = site.body.w;
  body.h = site.body.h;
  body.dir = site.dir;
  body.pier = pier.id;
  pier.harbour = body.id;
  addEntity(state, pier);
  addEntity(state, body);
  return body;
}

/** The water-side shore tile a pier is lined up with (which growing the pier does not change). */
function anchorOfPier(pier: BuildingEntity, dir: Dir): { x: number; y: number } {
  const acrossY = pier.h >= 3 ? pier.y + 1 : pier.y;
  const acrossX = pier.w >= 3 ? pier.x + 1 : pier.x;
  switch (dir) {
    case "+x":
      return { x: pier.x - 1, y: acrossY };
    case "-x":
      return { x: pier.x + pier.w, y: acrossY };
    case "+y":
      return { x: acrossX, y: pier.y - 1 };
    default:
      return { x: acrossX, y: pier.y + pier.h };
  }
}

/** The pier tier's size, reduced step by step until open water allows it. */
function fitPier(state: GameState, pier: BuildingEntity, tier: number): Rect | null {
  const dir = pier.dir ?? "+x";
  const a = anchorOfPier(pier, dir);
  const want = PIER_TIERS[tier]!;
  for (let length = want.length; length >= PIER_TIERS[0].length; length--)
    for (let width = want.width; width >= PIER_TIERS[0].width; width--) {
      const r = pierRect(a.x, a.y, dir, length, width);
      if (pierWater(state, r, dir, pier.id, false)) return r;
    }
  return null;
}

/**
 * Grow every harbour's pier to the size its upgrades allow, as far as open water permits. Called
 * when an upgrade is bought and whenever a harbour goes up.
 */
export function growPiers(state: GameState): void {
  const tier = pierTier(state);
  for (const e of [...state.entities.values()]) {
    if (e.type !== "building" || e.kind !== "harbour") continue;
    const pier = pierOf(state, e);
    if (!pier || pier === e) continue;
    const r = fitPier(state, pier, tier);
    if (!r || (r.w * r.h <= pier.w * pier.h && r.x === pier.x && r.y === pier.y)) continue;
    if (r.w * r.h < pier.w * pier.h) continue;
    occupy(state, pier, false);
    pier.x = r.x;
    pier.y = r.y;
    pier.w = r.w;
    pier.h = r.h;
    occupy(state, pier, true);
    markDirty(state, pier.id);
  }
}

/** A free body on the shore behind a pier (two deep, three along the shore), or null. */
function bodyBehind(state: GameState, pier: Rect, dir: Dir): Rect | null {
  const tries: Rect[] = [];
  const depth = 2;
  for (const shift of [0, -1, 1]) {
    switch (dir) {
      case "+x":
        tries.push({ x: pier.x - depth, y: pier.y + shift, w: depth, h: 3 });
        break;
      case "-x":
        tries.push({ x: pier.x + pier.w, y: pier.y + shift, w: depth, h: 3 });
        break;
      case "+y":
        tries.push({ x: pier.x + shift, y: pier.y - depth, w: 3, h: depth });
        break;
      default:
        tries.push({ x: pier.x + shift, y: pier.y + pier.h, w: 3, h: depth });
    }
  }
  const { world } = state;
  for (const body of tries) {
    let ok = true;
    for (let y = body.y; y < body.y + body.h && ok; y++)
      for (let x = body.x; x < body.x + body.w && ok; x++) {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) ok = false;
        else {
          const k = y * world.width + x;
          const occupant = state.entities.get(state.occupancy[k]!);
          if (!isLandTerrain(world.terrain[k]!) || (occupant && occupant.type !== "node"))
            ok = false;
        }
      }
    if (ok && pierAccess(state, pier, body)) return body;
  }
  return null;
}

function clearNodes(state: GameState, body: Rect): void {
  const { world } = state;
  for (let y = body.y; y < body.y + body.h; y++)
    for (let x = body.x; x < body.x + body.w; x++) {
      const id = state.occupancy[y * world.width + x]!;
      if (id) removeEntity(state, id);
    }
}

/**
 * The home island's harbour, built when a world starts: its body on land beside the start pier.
 * Returns null when no body fits (the start pier then stays a stand-alone dock).
 */
export function startHarbour(state: GameState): BuildingEntity | null {
  const s = state.world.start;
  const pier = { x: s.dock.x, y: s.dock.y, w: s.dock.w, h: s.dock.h };
  const body = bodyBehind(state, pier, s.dock.dir);
  if (!body) return null;
  clearNodes(state, body);
  return placeHarbour(state, { body, pier, dir: s.dock.dir }, true);
}

/**
 * Old saves have stand-alone docks. Give each a harbour on the shore behind it (the pier it keeps),
 * so the harbourmaster's room, the upgrades and the ship queue have somewhere to live. A dock with
 * no room behind it stays as it was and keeps working without the room.
 */
export function migrateDocks(state: GameState): void {
  for (const e of [...state.entities.values()]) {
    if (e.type !== "building" || e.kind !== "dock" || e.harbour !== undefined) continue;
    const dir = e.dir ?? "+x";
    const body = bodyBehind(state, e, dir);
    if (!body) continue;
    clearNodes(state, body);
    const harbour = newBuilding(state, "harbour", body.x, body.y, e.complete);
    harbour.w = body.w;
    harbour.h = body.h;
    harbour.dir = dir;
    harbour.pier = e.id;
    harbour.queue = e.queue;
    e.queue = [];
    e.harbour = harbour.id;
    addEntity(state, harbour);
    for (const s of state.entities.values())
      if (s.type === "ship" && s.route === e.id) s.route = harbour.id;
  }
}

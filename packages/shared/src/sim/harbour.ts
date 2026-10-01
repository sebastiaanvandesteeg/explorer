// Harbours: a body on the coast (the harbourmaster's room, the ship queue) and a pier that runs out
// over the water and grows with the harbour upgrades. The pier is a walkable `dock` entity owned by
// the harbour; ships launch from, and dock at, the water just past its end.
import { isLandTerrain, tileIndex } from "../world/grid";
import { BERTH_SPACING, PIER_TIERS } from "./catalogue";
import { dockSpawn } from "./ferry";
import { landPath, sailable } from "./navigation";
import {
  bodyBeside,
  openWater,
  pierLocal,
  pierRect,
  pierWater,
  type HarbourSite,
  type Rect,
} from "./rules";
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

/** A place along a pier where a ship ties up: its centre and the way its bow points. */
export interface Berth {
  x: number;
  y: number;
  angle: number;
}

const DIR_ANGLE = { "+x": 0, "+y": Math.PI / 2, "-x": Math.PI, "-y": -Math.PI / 2 } as const;

/**
 * Every place a ship can moor at a harbour: along both sides of the pier, one every
 * `BERTH_SPACING` tiles, starting past the harbour's platform on its side. Only slots whose water
 * is open count, so a rock or a coast beside the pier takes its slots away.
 */
export function berthSlots(state: GameState, b: BuildingEntity): Berth[] {
  const pier = pierOf(state, b);
  if (!pier) return [];
  const dir = pier.dir ?? "+x";
  const alongX = dir === "+x" || dir === "-x";
  const length = alongX ? pier.w : pier.h;
  const width = alongX ? pier.h : pier.w;
  // Where the harbour's platform sits beside the pier, if it stands in the water.
  const body = b.kind === "harbour" && b.pier !== undefined ? b : null;
  const start = [0, 0];
  if (body) {
    const lo = pierLocal(pier, dir, body.x, body.y);
    const hi = pierLocal(pier, dir, body.x + body.w - 1, body.y + body.h - 1);
    const tile = pierLocal(pier, dir, body.x, body.y);
    const inWater = !isLandTerrain(state.world.terrain[tileIndex(state.world, body.x, body.y)]!);
    const side = Math.min(lo.across, hi.across) < 0 ? 0 : 1;
    if (inWater && (tile.across < 0 || tile.across >= width))
      start[side] = Math.max(lo.along, hi.along) + 1;
  }
  const out: Berth[] = [];
  const angle = DIR_ANGLE[dir];
  for (let i = 0; ; i++) {
    let any = false;
    for (const side of [0, 1] as const) {
      const from = start[side]!;
      const along = from + BERTH_SPACING * i + BERTH_SPACING / 2;
      if (along + BERTH_SPACING / 2 > length) continue;
      any = true;
      const across = side === 0 ? -0.62 : width + 0.62;
      let x: number;
      let y: number;
      switch (dir) {
        case "+x":
          x = pier.x + along;
          y = pier.y + across;
          break;
        case "-x":
          x = pier.x + pier.w - along;
          y = pier.y + across;
          break;
        case "+y":
          x = pier.x + across;
          y = pier.y + along;
          break;
        default:
          x = pier.x + across;
          y = pier.y + pier.h - along;
      }
      if (sailable(state, Math.floor(x), Math.floor(y))) out.push({ x, y, angle });
    }
    if (!any) break;
  }
  return out;
}

/** The nearest slot with no ship in it (a ship of `except`, usually the asker, does not count). */
export function freeBerth(
  state: GameState,
  b: BuildingEntity,
  opts: { near?: { x: number; y: number }; except?: number } = {},
): Berth | null {
  const taken = (s: Berth): boolean => {
    for (const e of state.entities.values())
      if (e.type === "ship" && e.id !== opts.except && Math.hypot(e.x - s.x, e.y - s.y) < 1.7)
        return true;
    return false;
  };
  let best: Berth | null = null;
  let bestD = Infinity;
  const near = opts.near ?? dockSpawn(pierOf(state, b) ?? b);
  for (const s of berthSlots(state, b)) {
    if (taken(s)) continue;
    const d = Math.hypot(s.x - near.x, s.y - near.y);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Where a ship should head to dock: its nearest free slot, or the pier's tip if the pier is full. */
export function berthOf(
  state: GameState,
  b: BuildingEntity,
  near?: { x: number; y: number },
  except?: number,
): { x: number; y: number } {
  const slot = freeBerth(state, b, {
    ...(near ? { near } : {}),
    ...(except !== undefined ? { except } : {}),
  });
  return slot ?? berthSlots(state, b)[0] ?? dockSpawn(pierOf(state, b) ?? b);
}

/** Whether a position is within `radius` of a mooring at any working harbour. */
export function nearBerth(
  state: GameState,
  pos: { x: number; y: number },
  radius: number,
): boolean {
  for (const e of berths(state))
    for (const s of berthSlots(state, e))
      if (Math.hypot(pos.x - s.x, pos.y - s.y) <= radius) return true;
  return false;
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

/**
 * Grow every harbour's pier to the length its upgrades allow (5, 10 or 15 tiles), when open water
 * allows; a blocked extension is tried again later. Called when an upgrade is bought, when a
 * harbour goes up, and now and then.
 */
export function growPiers(state: GameState): void {
  const want = PIER_TIERS[pierTier(state)]!.length;
  for (const e of [...state.entities.values()]) {
    if (e.type !== "building" || e.kind !== "harbour") continue;
    const pier = pierOf(state, e);
    if (!pier || pier === e) continue;
    const dir = pier.dir ?? "+x";
    const alongX = dir === "+x" || dir === "-x";
    const length = alongX ? pier.w : pier.h;
    if (length >= want) continue;
    let r: Rect;
    switch (dir) {
      case "+x":
        r = { x: pier.x, y: pier.y, w: want, h: pier.h };
        break;
      case "-x":
        r = { x: pier.x + pier.w - want, y: pier.y, w: want, h: pier.h };
        break;
      case "+y":
        r = { x: pier.x, y: pier.y, w: pier.w, h: want };
        break;
      default:
        r = { x: pier.x, y: pier.y + pier.h - want, w: pier.w, h: want };
    }
    if (!pierWater(state, r, dir, pier.id, false)) continue;
    occupy(state, pier, false);
    pier.x = r.x;
    pier.y = r.y;
    pier.w = r.w;
    pier.h = r.h;
    occupy(state, pier, true);
    markDirty(state, pier.id);
  }
}

/** A water platform for the harbour beside an existing pier, on whichever side is free. */
function bodyOnWater(state: GameState, pier: Rect, dir: Dir, ignore: number): Rect | null {
  for (const side of [0, 1] as const) {
    const body = bodyBeside(pier, dir, side);
    if (openWater(state, body, { ignore, explored: false })) return body;
  }
  return null;
}

/**
 * Turn a stand-alone pier (a new world's start pier, or an old save's dock) into a harbour: a
 * platform on piles beside it, and a pier lengthened to what the world's upgrades allow. Returns
 * null when no platform fits (the pier then stays a bare dock).
 */
function harbourFor(
  state: GameState,
  dock: BuildingEntity | Rect,
  dir: Dir,
): BuildingEntity | null {
  const id = "id" in dock ? dock.id : 0;
  const base: Rect = { x: dock.x, y: dock.y, w: dock.w, h: dock.h };
  // Widen a two-wide start pier to three, one row to either side, if the water allows.
  const alongX = dir === "+x" || dir === "-x";
  const across = alongX ? base.h : base.w;
  const candidates: Rect[] = [];
  const grow = (shift: number): Rect =>
    alongX
      ? { x: base.x, y: base.y + shift, w: base.w, h: 3 }
      : { x: base.x + shift, y: base.y, w: 3, h: base.h };
  for (const shift of across >= 3 ? [0] : [-1, 0]) candidates.push(grow(shift));
  for (const pier of candidates) {
    if (!openWater(state, pier, { ignore: id, explored: false })) continue;
    const body = bodyOnWater(state, pier, dir, id);
    if (!body) continue;
    return fromRects(state, dock, pier, body, dir);
  }
  return null;
}

function fromRects(
  state: GameState,
  dock: BuildingEntity | Rect,
  pier: Rect,
  body: Rect,
  dir: Dir,
): BuildingEntity {
  if ("id" in dock) {
    // An old dock keeps its id, so the ships on its route and the save's references stay valid.
    occupy(state, dock, false);
    dock.x = pier.x;
    dock.y = pier.y;
    dock.w = pier.w;
    dock.h = pier.h;
    occupy(state, dock, true);
    const harbour = newBuilding(state, "harbour", body.x, body.y, dock.complete);
    harbour.w = body.w;
    harbour.h = body.h;
    harbour.dir = dir;
    harbour.pier = dock.id;
    harbour.queue = dock.queue;
    dock.queue = [];
    dock.harbour = harbour.id;
    addEntity(state, harbour);
    for (const s of state.entities.values())
      if (s.type === "ship" && s.route === dock.id) s.route = harbour.id;
    markDirty(state, dock.id);
    return harbour;
  }
  return placeHarbour(state, { body, pier, dir }, true);
}

/** The shore tile in line with a pier's middle, where its root meets the land. */
export function rootOf(pier: Rect, dir: Dir): { x: number; y: number } {
  const midY = pier.y + Math.floor((pier.h - 1) / 2);
  const midX = pier.x + Math.floor((pier.w - 1) / 2);
  switch (dir) {
    case "+x":
      return { x: pier.x - 1, y: midY };
    case "-x":
      return { x: pier.x + pier.w, y: midY };
    case "+y":
      return { x: midX, y: pier.y - 1 };
    default:
      return { x: midX, y: pier.y + pier.h };
  }
}

/** The nearest spot on the home island's shore where a harbour fits (a pier and a platform in water). */
function findStartSite(state: GameState, near: { x: number; y: number }): HarbourSite | null {
  const w = state.world;
  const island = w.start.islandId;
  let best: { site: HarbourSite; d: number } | null = null;
  const R = 22;
  for (let y = near.y - R; y <= near.y + R; y++)
    for (let x = near.x - R; x <= near.x + R; x++) {
      if (x < 1 || y < 1 || x >= w.width - 1 || y >= w.height - 1) continue;
      const k = tileIndex(w, x, y);
      if (!isLandTerrain(w.terrain[k]!) || w.island[k] !== island) continue;
      const d = Math.hypot(x - near.x, y - near.y);
      if (best && d >= best.d) continue;
      for (const dir of ["+x", "+y", "-x", "-y"] as const) {
        const pier = pierRect(x, y, dir, PIER_TIERS[0].length, PIER_TIERS[0].width);
        if (!pierWater(state, pier, dir, undefined, false)) continue;
        for (const side of [0, 1] as const) {
          const body = bodyBeside(pier, dir, side);
          if (!openWater(state, body, { explored: false })) continue;
          // People must be able to walk from the town to the pier's root (no cliff in between).
          const spawn = w.start.spawn[0];
          const root = { x, y };
          if (spawn && !landPath(state, spawn, [root])) continue;
          best = { site: { body, pier, dir }, d };
          break;
        }
        if (best?.d === d) break;
      }
    }
  return best?.site ?? null;
}

/**
 * The home island's harbour, built when a world starts: the start pier with a platform on piles
 * beside it, or (where the start pier's coast is too ragged) at the nearest shore that fits.
 * Returns null when nothing fits (the start pier then stays a stand-alone dock).
 */
export function startHarbour(state: GameState): BuildingEntity | null {
  const s = state.world.start;
  const h =
    harbourFor(state, { x: s.dock.x, y: s.dock.y, w: s.dock.w, h: s.dock.h }, s.dock.dir) ??
    (() => {
      const site = findStartSite(state, s.dock.landing);
      return site ? placeHarbour(state, site, true) : null;
    })();
  if (h) growPiers(state);
  return h;
}

/**
 * Old saves have stand-alone docks. Give each a harbour on the water beside it (the pier it keeps
 * is lengthened to the current tier), so the harbourmaster's room, the upgrades and the ship queue
 * have somewhere to live. A dock with no room beside it stays as it was and works without the room.
 */
export function migrateDocks(state: GameState): void {
  for (const e of [...state.entities.values()]) {
    if (e.type !== "building" || e.kind !== "dock" || e.harbour !== undefined) continue;
    if (harbourFor(state, e, e.dir ?? "+x")) growPiers(state);
  }
}

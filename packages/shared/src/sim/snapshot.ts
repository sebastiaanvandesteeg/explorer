// Serialisation: full snapshots (join + persistence) and incremental patches (every tick).
import type { TribeId } from "../tribes";
import type { WorldMap } from "../world/types";
import { isDifficulty, type Difficulty } from "./difficulty";
import { SHIP_HP, type Stock, type UpgradeId } from "./catalogue";
import {
  emptyState,
  addSites,
  emptyStock,
  rebuildOccupancy,
  stockOf,
  type Entity,
  type GameEvent,
  type GameState,
  type PirateEntity,
  type ShipEntity,
  type VillagerEntity,
} from "./state";

/**
 * Entities as sent over the wire: no private planning state (paths, retry timers). Countdown
 * fields (node `timer`, villager `workTimer`) tick on the server without being re-sent, so on
 * clients they are only accurate as of the entity's last change.
 */
export type WireEntity =
  | Exclude<Entity, VillagerEntity | ShipEntity | PirateEntity>
  | Omit<VillagerEntity, "path" | "retryAt">
  | Omit<ShipEntity, "path">
  | Omit<PirateEntity, "path">;

export interface Patch {
  tick: number;
  time: number;
  entities: WireEntity[];
  removed: number[];
  stock?: Stock;
  /** Changed outpost stockpiles, by island id. */
  outposts?: Record<number, Stock>;
  /** Every upgrade owned so far, sent when one is bought. */
  upgrades?: UpgradeId[];
  revealed?: number[];
  events?: GameEvent[];
}

export interface Snapshot {
  version: 1;
  seed: string;
  /** Older saves predate tribes; they load as Islanders. */
  tribe?: TribeId;
  /** Older saves predate difficulty; they load as Normal. */
  difficulty?: Difficulty;
  tick: number;
  time: number;
  nextId: number;
  stock: Stock;
  /** Game time of the next pirate raid. */
  nextRaid?: number;
  nextStorm?: number;
  /** Goods waiting on other islands, by island id. Older saves have none. */
  outposts?: Record<number, Stock>;
  upgrades?: UpgradeId[];
  entities: WireEntity[];
  /** Run-length encoded explored map: alternating run lengths, starting with unexplored. */
  explored: string;
  discovered: number[];
}

/** Deep copy of plain JSON-like data (entities never hold Maps, Dates or cycles). */
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out as T;
  }
  return value;
}

export function toWire(e: Entity): WireEntity {
  if (e.type === "villager") {
    const { path: _path, retryAt: _retry, ...rest } = e;
    return clone(rest);
  }
  if (e.type === "ship" || e.type === "pirate") {
    const { path: _path, ...rest } = e;
    return clone(rest);
  }
  return clone(e);
}

export function fromWire(w: WireEntity): Entity {
  const e = clone(w) as Entity;
  if (e.type === "villager") {
    e.path = [];
    e.retryAt = 0;
    e.aboard ??= null;
  } else if (e.type === "ship") {
    e.path = [];
    e.passengers ??= [];
    e.unload ??= false;
    e.kind ??= "scout";
    e.route ??= null;
    e.leg ??= null;
    e.cargo ??= {};
    e.waitUntil ??= 0;
    e.hp ??= SHIP_HP[e.kind];
    e.cooldown ??= 0;
    e.hunt ??= false;
    e.salvage ??= null;
    e.dive ??= null;
  } else if (e.type === "pirate") {
    e.path = [];
  }
  return e;
}

export function encodeRuns(bits: Uint8Array): string {
  const runs: number[] = [];
  let current = 0;
  let run = 0;
  for (const b of bits) {
    const v = b ? 1 : 0;
    if (v === current) run++;
    else {
      runs.push(run);
      current = v;
      run = 1;
    }
  }
  runs.push(run);
  return runs.join(",");
}

export function decodeRuns(s: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let i = 0;
  let v = 0;
  for (const part of s.split(",")) {
    const n = Number(part);
    if (v) out.fill(1, i, Math.min(length, i + n));
    i += n;
    v ^= 1;
  }
  return out;
}

export function toSnapshot(state: GameState): Snapshot {
  return {
    version: 1,
    seed: state.world.seed,
    tribe: state.world.tribe,
    difficulty: state.difficulty,
    tick: state.tick,
    time: state.time,
    nextId: state.nextId,
    stock: { ...state.stock },
    outposts: Object.fromEntries([...state.outposts].map(([id, st]) => [id, { ...st }])),
    upgrades: [...state.upgrades],
    nextRaid: state.nextRaid,
    nextStorm: state.nextStorm,
    entities: [...state.entities.values()].map(toWire),
    explored: encodeRuns(state.explored),
    discovered: [...state.discovered],
  };
}

/**
 * Rebuild a game state from a snapshot. With `resume`, villagers that were mid-walk go idle so
 * the server replans their routes (paths are never serialised).
 */
export function fromSnapshot(world: WorldMap, snap: Snapshot, resume = false): GameState {
  const state = emptyState(world, isDifficulty(snap.difficulty) ? snap.difficulty : "normal");
  state.tick = snap.tick;
  state.time = snap.time;
  state.nextId = snap.nextId;
  state.stock = { ...emptyStock(), ...snap.stock };
  for (const [id, st] of Object.entries(snap.outposts ?? {}))
    state.outposts.set(Number(id), { ...emptyStock(), ...st });
  state.upgrades = new Set(snap.upgrades ?? []);
  if (snap.nextRaid !== undefined) state.nextRaid = snap.nextRaid;
  if (snap.nextStorm !== undefined) state.nextStorm = snap.nextStorm;
  state.explored = decodeRuns(snap.explored, world.width * world.height);
  state.discovered = new Set(snap.discovered);
  for (const w of snap.entities) {
    const e = fromWire(w);
    if (resume && e.type === "villager" && (e.action === "walk" || e.action === "deliver")) {
      e.action = "idle";
    }
    state.entities.set(e.id, e);
  }
  rebuildOccupancy(state);
  // Saves from before sunken sites existed get them now.
  if (![...state.entities.values()].some((e) => e.type === "site")) addSites(state);
  state.dirty.clear();
  state.stockDirty = false;
  return state;
}

/** Collect everything that changed since the last patch and reset the change trackers. */
export function takePatch(state: GameState): Patch {
  const patch: Patch = {
    tick: state.tick,
    time: state.time,
    entities: [],
    removed: [...state.removed],
  };
  for (const id of state.dirty) {
    const e = state.entities.get(id);
    if (e) patch.entities.push(toWire(e));
  }
  if (state.stockDirty) patch.stock = { ...state.stock };
  if (state.upgradesDirty) {
    patch.upgrades = [...state.upgrades];
    state.upgradesDirty = false;
  }
  if (state.outpostsDirty.size > 0) {
    patch.outposts = {};
    for (const id of state.outpostsDirty) patch.outposts[id] = { ...stockOf(state, id) };
  }
  if (state.revealed.length > 0) patch.revealed = state.revealed;
  if (state.events.length > 0) patch.events = state.events;
  state.dirty.clear();
  state.removed.clear();
  state.revealed = [];
  state.events = [];
  state.stockDirty = false;
  state.outpostsDirty.clear();
  return patch;
}

export function patchIsEmpty(p: Patch): boolean {
  return (
    p.entities.length === 0 &&
    p.removed.length === 0 &&
    !p.stock &&
    !p.outposts &&
    !p.upgrades &&
    !p.revealed &&
    !p.events
  );
}

/** Client side: fold a server patch into a mirror state. */
export function applyPatch(state: GameState, patch: Patch): void {
  state.tick = patch.tick;
  state.time = patch.time;
  for (const id of patch.removed) {
    const e = state.entities.get(id);
    if (!e) continue;
    state.entities.delete(id);
    if (e.type === "building" || e.type === "node") rebuildTiles(state, e);
  }
  for (const w of patch.entities) {
    const prev = state.entities.get(w.id);
    const e = fromWire(w);
    state.entities.set(e.id, e);
    if (e.type === "building" || e.type === "node") {
      if (prev && (prev.type === "building" || prev.type === "node")) rebuildTiles(state, prev);
      rebuildTiles(state, e);
    }
  }
  if (patch.stock) state.stock = { ...emptyStock(), ...patch.stock };
  if (patch.upgrades) state.upgrades = new Set(patch.upgrades);
  for (const [id, st] of Object.entries(patch.outposts ?? {}))
    state.outposts.set(Number(id), { ...emptyStock(), ...st });
  if (patch.revealed) {
    for (const k of patch.revealed) state.explored[k] = 1;
    for (const k of patch.revealed) {
      const island = state.world.island[k]!;
      if (island >= 0) state.discovered.add(island);
    }
  }
}

/** Recompute occupancy for the tiles an entity covers (handles overlap on replace/remove). */
function rebuildTiles(state: GameState, e: Entity): void {
  const w = state.world;
  const tiles: number[] = [];
  if (e.type === "building") {
    for (let y = e.y; y < e.y + e.h; y++)
      for (let x = e.x; x < e.x + e.w; x++) tiles.push(y * w.width + x);
  } else if (e.type === "node") {
    tiles.push(e.y * w.width + e.x);
  }
  for (const k of tiles) {
    if (state.occupancy[k] === e.id && !state.entities.has(e.id)) state.occupancy[k] = 0;
  }
  const live = state.entities.get(e.id);
  if (live && (live.type === "building" || live.type === "node")) {
    for (const k of tiles) state.occupancy[k] = live.id;
  }
}

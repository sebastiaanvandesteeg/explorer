// Player characters (adventure worlds): one per player slot, moved only by their own player.
import { inBounds } from "../world/grid";
import { CHARACTER } from "./catalogue";
import { STARTER_PACK } from "./items";
import { defaultLookFor, sanitizeLook, type CharacterLook } from "./looks";
import { landPath } from "./navigation";
import { tilesAround } from "./rules";
import {
  addEntity,
  lookAround,
  markDirty,
  walkable,
  type CharacterEntity,
  type GameState,
} from "./state";
import { tileOf } from "./walk";

/** Change how a player's character looks (they picked again when joining). */
export function setLook(state: GameState, playerId: string, look: CharacterLook): void {
  const c = characterOf(state, playerId);
  if (!c) return;
  const next = sanitizeLook(look);
  if (JSON.stringify(next) === JSON.stringify(c.look)) return;
  c.look = next;
  markDirty(state, c.id);
}

export function characterOf(state: GameState, playerId: string): CharacterEntity | undefined {
  for (const e of state.entities.values())
    if (e.type === "character" && e.playerId === playerId) return e;
  return undefined;
}

export function characters(state: GameState): CharacterEntity[] {
  const out: CharacterEntity[] = [];
  for (const e of state.entities.values()) if (e.type === "character") out.push(e);
  return out;
}

/**
 * The player's character, made on the shore beside the town hall the first time they join and
 * found where it stood every time after. Each newcomer gets a free spot of their own.
 */
export function ensureCharacter(
  state: GameState,
  playerId: string,
  look?: CharacterLook,
): CharacterEntity {
  const existing = characterOf(state, playerId);
  if (existing) return existing;
  const taken = characters(state);
  const hall = state.world.start.townHall;
  const free = tilesAround(state, hall.x, hall.y, hall.w, hall.h)
    .filter((t) => !taken.some((c) => Math.floor(c.x) === t.x && Math.floor(c.y) === t.y))
    .sort((a, b) => b.y + b.x - (a.y + a.x));
  const spot = free[0] ?? state.world.start.spawn[0] ?? { x: hall.x, y: hall.y + hall.h };
  const id = state.nextId++;
  const c = addEntity(state, {
    id,
    type: "character",
    playerId,
    look: look ? sanitizeLook(look) : defaultLookFor(id),
    x: spot.x + 0.5,
    y: spot.y + 0.5,
    tunic: taken.length % 3,
    facing: 1,
    action: "idle",
    path: [],
    carrying: null,
    tool: null,
    aboard: null,
    dest: null,
    pack: STARTER_PACK.map((i) => ({ ...i })),
    fetch: null,
    inside: null,
    room: { x: 0, y: 0 },
    rpath: [],
    enter: null,
    steer: null,
    steerUntil: 0,
  } satisfies CharacterEntity);
  lookAround(state, c.x, c.y, CHARACTER.reveal);
  return c;
}

export type MoveResult = { ok: true } | { ok: false; reason: string };

/**
 * Send a player's character walking. Clicking something solid (a tree, a building) walks to the
 * ground beside it.
 */
export function moveCharacter(
  state: GameState,
  playerId: string | null,
  target: { x: number; y: number },
): MoveResult {
  const c = playerId === null ? undefined : characterOf(state, playerId);
  if (!c) return { ok: false, reason: "You have no character here" };
  if (c.inside !== null) return { ok: false, reason: "Leave the building first" };
  c.fetch = null;
  c.enter = null;
  return walkCharacter(state, c, target);
}

/** How long one steering command keeps a character going, in seconds (clients renew it). */
export const STEER_HOLD = 1.2;

/** Stop a character that is being steered where it stands. */
export function stopSteering(state: GameState, c: CharacterEntity): void {
  if (!c.steer) return;
  c.steer = null;
  c.steerUntil = 0;
  if (c.path.length === 0) c.action = "idle";
  markDirty(state, c.id);
}

/**
 * Steer a character in a direction on the map (free movement, like holding the arrow keys), or
 * stop it with a zero direction. It keeps going until stopped or until the command lapses.
 */
export function steerCharacter(
  state: GameState,
  playerId: string | null,
  dir: { x: number; y: number },
): MoveResult {
  const c = playerId === null ? undefined : characterOf(state, playerId);
  if (!c) return { ok: false, reason: "You have no character here" };
  if (c.inside !== null) return { ok: false, reason: "Leave the building first" };
  if (c.aboard !== null) return { ok: false, reason: "You are at sea" };
  const len = Math.hypot(dir.x, dir.y);
  if (!(len > 1e-6)) {
    stopSteering(state, c);
    return { ok: true };
  }
  c.steer = { x: dir.x / len, y: dir.y / len };
  c.steerUntil = state.time + STEER_HOLD;
  // Steering replaces any walk, errand or pick-up in progress.
  c.path = [];
  c.dest = null;
  c.fetch = null;
  c.enter = null;
  markDirty(state, c.id);
  return { ok: true };
}

/** Walk a character to a tile, or to the ground beside it if it is solid. */
export function walkCharacter(
  state: GameState,
  c: CharacterEntity,
  target: { x: number; y: number },
): MoveResult {
  if (c.aboard !== null) return { ok: false, reason: "You are at sea" };
  c.steer = null;
  const tx = Math.floor(target.x);
  const ty = Math.floor(target.y);
  if (!inBounds(state.world, tx, ty)) return { ok: false, reason: "Outside the map" };
  const goals = walkable(state, tx, ty) ? [{ x: tx, y: ty }] : tilesAround(state, tx, ty);
  if (goals.length === 0) return { ok: false, reason: "Can't walk there" };
  const here = tileOf(c);
  if (goals.some((g) => g.x === here.x && g.y === here.y)) {
    c.path = [];
    c.action = "idle";
    c.dest = null;
    markDirty(state, c.id);
    return { ok: true };
  }
  const path = landPath(state, here, goals);
  if (!path || path.length === 0) return { ok: false, reason: "There's no way there on foot" };
  c.path = path;
  c.dest = { ...path[path.length - 1]! };
  c.action = "walk";
  markDirty(state, c.id);
  return { ok: true };
}

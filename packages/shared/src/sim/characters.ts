// Player characters (adventure worlds): one per player slot, moved only by their own player.
import { inBounds } from "../world/grid";
import { CHARACTER } from "./catalogue";
import { STARTER_PACK } from "./items";
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
export function ensureCharacter(state: GameState, playerId: string): CharacterEntity {
  const existing = characterOf(state, playerId);
  if (existing) return existing;
  const taken = characters(state);
  const hall = state.world.start.townHall;
  const free = tilesAround(state, hall.x, hall.y, hall.w, hall.h)
    .filter((t) => !taken.some((c) => Math.floor(c.x) === t.x && Math.floor(c.y) === t.y))
    .sort((a, b) => b.y + b.x - (a.y + a.x));
  const spot = free[0] ?? state.world.start.spawn[0] ?? { x: hall.x, y: hall.y + hall.h };
  const c = addEntity(state, {
    id: state.nextId++,
    type: "character",
    playerId,
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
  c.fetch = null;
  return walkCharacter(state, c, target);
}

/** Walk a character to a tile, or to the ground beside it if it is solid. */
export function walkCharacter(
  state: GameState,
  c: CharacterEntity,
  target: { x: number; y: number },
): MoveResult {
  if (c.aboard !== null) return { ok: false, reason: "You are at sea" };
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

// Boarding and sailing: a player walks up to a ship and climbs aboard; the first to board is the
// captain and steers with the keys, everyone after is a passenger. When the captain leaves, the
// next rider takes the wheel.
import { shipSpeed, type ShipKind } from "./catalogue";
import { moveShip } from "./collision";
import { STEER_HOLD, characterOf } from "./characters";
import { landPath } from "./navigation";
import {
  lookAround,
  markDirty,
  sailSpeedFactor,
  shipReveal,
  walkable,
  type CharacterEntity,
  type GameState,
  type ShipEntity,
} from "./state";
import { riderLimit } from "./state";
import { tileOf } from "./walk";
import type { Tile } from "../world/pathfind";

/** How big a ship is for bumping into coasts, in tiles. */
export const SHIP_RADIUS: Record<ShipKind, number> = { scout: 0.5, cargo: 0.62, patrol: 0.56 };
/** How quickly a ship swings round, in radians a second. */
const TURN_RATE: Record<ShipKind, number> = { scout: 2.2, cargo: 1.5, patrol: 2.0 };
/** How close to a ship a player must be to climb aboard or step off. */
export const BOARD_REACH = 3.4;

type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });

export function shipById(state: GameState, id: number | null): ShipEntity | null {
  const e = id === null ? undefined : state.entities.get(id);
  return e?.type === "ship" ? e : null;
}

/** The player steering a ship: whoever boarded first and is still aboard. */
export function captainOf(state: GameState, ship: ShipEntity): CharacterEntity | null {
  const c = ship.riders.length > 0 ? state.entities.get(ship.riders[0]!) : undefined;
  return c?.type === "character" ? c : null;
}

/** Where riders stand on the deck: the helm for the captain, then along the rail. */
export function deckSlot(
  ship: { angle: number; kind: ShipKind },
  index: number,
): { x: number; y: number } {
  // Offsets along the ship (u, towards the bow) and across it (v), in tiles.
  const slots: [number, number][] = [
    [-0.75, 0],
    [0.1, 0.22],
    [0.1, -0.22],
    [0.5, 0.18],
    [0.5, -0.18],
    [-0.35, 0.25],
    [-0.35, -0.25],
    [0.85, 0],
  ];
  const [u, v] = slots[index % slots.length]!;
  const scale = ship.kind === "cargo" ? 1.1 : 1;
  const c = Math.cos(ship.angle);
  const s = Math.sin(ship.angle);
  return { x: (u * c - v * s) * scale, y: (u * s + v * c) * scale };
}

/** Keep the riders standing on the deck wherever the ship has got to. */
export function syncRiders(state: GameState, ship: ShipEntity): void {
  ship.riders.forEach((id, i) => {
    const c = state.entities.get(id);
    if (c?.type !== "character") return;
    const slot = deckSlot(ship, i);
    c.x = ship.x + slot.x;
    c.y = ship.y + slot.y;
    // The captain faces the way the ship goes; passengers look ahead too.
    c.facing = (((Math.round(ship.angle / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
    c.action = "idle";
    markDirty(state, c.id);
  });
}

function stopDuty(ship: ShipEntity): void {
  ship.route = null;
  ship.leg = null;
  ship.hunt = false;
  ship.salvage = null;
  ship.dive = null;
  ship.path = [];
  ship.dest = null;
  ship.unload = false;
}

export function boardShip(state: GameState, playerId: string | null, shipId: number): Result {
  const c = playerId === null ? undefined : characterOf(state, playerId);
  if (!c) return fail("You have no character here");
  if (c.inside !== null) return fail("Leave the building first");
  if (c.aboard !== null) return fail("You are already aboard");
  const ship = shipById(state, shipId);
  if (!ship) return fail("No such ship");
  if (ship.riders.length >= riderLimit(state, ship.kind)) return fail("The ship is full");
  c.fetch = null;
  c.enter = null;
  c.steer = null;
  if (Math.hypot(c.x - ship.x, c.y - ship.y) <= BOARD_REACH) {
    embarkCharacter(state, c, ship);
    return { ok: true };
  }
  // Walk to the dry ground (shore or pier) nearest the ship, then climb aboard.
  const goals: Tile[] = [];
  const cx = Math.floor(ship.x);
  const cy = Math.floor(ship.y);
  const r = Math.ceil(BOARD_REACH);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if (
        walkable(state, x, y) &&
        Math.hypot(x + 0.5 - ship.x, y + 0.5 - ship.y) <= BOARD_REACH - 0.3
      )
        goals.push({ x, y });
  if (goals.length === 0) return fail("Sail the ship up to the shore or a pier first");
  const path = landPath(state, tileOf(c), goals);
  if (!path) return fail("There's no way there on foot");
  c.path = path;
  c.dest = path.length > 0 ? { ...path[path.length - 1]! } : null;
  c.action = path.length > 0 ? "walk" : "idle";
  c.board = ship.id;
  markDirty(state, c.id);
  return { ok: true };
}

export function embarkCharacter(state: GameState, c: CharacterEntity, ship: ShipEntity): void {
  c.board = null;
  c.aboard = ship.id;
  c.path = [];
  c.dest = null;
  c.steer = null;
  c.action = "idle";
  ship.riders.push(c.id);
  lookAround(state, ship.x, ship.y, shipReveal(state, ship));
  syncRiders(state, ship);
  markDirty(state, ship.id);
  markDirty(state, c.id);
}

/** Called each tick for a character heading for a ship. */
export function checkBoarded(state: GameState, c: CharacterEntity): void {
  if (c.board === null) return;
  const ship = shipById(state, c.board);
  if (!ship || ship.riders.length >= riderLimit(state, ship.kind)) {
    c.board = null;
    markDirty(state, c.id);
    return;
  }
  if (Math.hypot(c.x - ship.x, c.y - ship.y) <= BOARD_REACH && c.path.length === 0)
    embarkCharacter(state, c, ship);
  else if (c.action !== "walk") {
    c.board = null;
    markDirty(state, c.id);
  }
}

/** Take a rider off a ship (they stay where the caller puts them). */
export function removeRider(state: GameState, ship: ShipEntity, id: number): void {
  const i = ship.riders.indexOf(id);
  if (i < 0) return;
  const wasCaptain = i === 0;
  ship.riders.splice(i, 1);
  // A new captain has to ask for the wheel: the old captain's steering ends with them.
  if (wasCaptain) {
    ship.steer = null;
    ship.steerUntil = 0;
  }
  syncRiders(state, ship);
  markDirty(state, ship.id);
}

export function leaveShip(state: GameState, playerId: string | null): Result {
  const c = playerId === null ? undefined : characterOf(state, playerId);
  if (!c) return fail("You have no character here");
  if (c.aboard === null) return fail("You are not on a ship");
  const ship = shipById(state, c.aboard);
  if (!ship) {
    c.aboard = null;
    markDirty(state, c.id);
    return { ok: true };
  }
  let best: { x: number; y: number; d: number } | null = null;
  const r = Math.ceil(BOARD_REACH) + 1;
  for (let y = Math.floor(ship.y) - r; y <= Math.floor(ship.y) + r; y++)
    for (let x = Math.floor(ship.x) - r; x <= Math.floor(ship.x) + r; x++) {
      if (!walkable(state, x, y)) continue;
      const d = Math.hypot(x + 0.5 - ship.x, y + 0.5 - ship.y);
      if (d <= BOARD_REACH + 0.6 && (!best || d < best.d)) best = { x, y, d };
    }
  if (!best) return fail("Too far from the shore to step off");
  removeRider(state, ship, c.id);
  c.aboard = null;
  c.x = best.x + 0.5;
  c.y = best.y + 0.5;
  c.action = "idle";
  markDirty(state, c.id);
  lookAround(state, c.x, c.y, 6);
  return { ok: true };
}

export function steerShip(
  state: GameState,
  playerId: string | null,
  dir: { x: number; y: number },
): Result {
  const c = playerId === null ? undefined : characterOf(state, playerId);
  if (!c || c.aboard === null) return fail("You are not on a ship");
  const ship = shipById(state, c.aboard);
  if (!ship) return fail("No such ship");
  if (ship.riders[0] !== c.id) return fail("Only the captain can steer");
  const len = Math.hypot(dir.x, dir.y);
  if (!(len > 1e-6)) {
    ship.steer = null;
    ship.steerUntil = 0;
    markDirty(state, ship.id);
    return { ok: true };
  }
  stopDuty(ship);
  ship.steer = { x: dir.x / len, y: dir.y / len };
  ship.steerUntil = state.time + STEER_HOLD;
  markDirty(state, ship.id);
  return { ok: true };
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One tick of a ship under a captain's hands: swing the bow towards the wanted heading, sail
 * with the wind of a turn taken off the speed, and slide along any coast in the way. Returns true
 * when the ship was steered this tick (so the tile path logic stands aside).
 */
export function steerStep(state: GameState, ship: ShipEntity, dt: number): boolean {
  if (!ship.steer) return false;
  if (state.time > ship.steerUntil || !captainOf(state, ship)) {
    ship.steer = null;
    ship.steerUntil = 0;
    markDirty(state, ship.id);
    return false;
  }
  const want = Math.atan2(ship.steer.y, ship.steer.x);
  const diff = wrap(want - ship.angle);
  const turn = TURN_RATE[ship.kind] * dt;
  ship.angle = wrap(ship.angle + Math.max(-turn, Math.min(turn, diff)));
  ship.heading = (Math.round(ship.angle / (Math.PI / 4)) + 8) % 8;
  const speed =
    shipSpeed(state.world.tribe, ship.kind) *
    sailSpeedFactor(state) *
    (0.3 + 0.7 * Math.max(0, Math.cos(diff)));
  const step = speed * dt;
  const to = moveShip(
    state,
    ship.x,
    ship.y,
    Math.cos(ship.angle) * step,
    Math.sin(ship.angle) * step,
    SHIP_RADIUS[ship.kind],
  );
  ship.x = to.x;
  ship.y = to.y;
  lookAround(state, ship.x, ship.y, shipReveal(state, ship));
  markDirty(state, ship.id);
  return true;
}

/** A ship goes down: everyone aboard is back on shore at the town hall, pack and all. */
export function dropRiders(state: GameState, ship: ShipEntity): void {
  const hall = state.world.start.townHall;
  for (const id of ship.riders) {
    const c = state.entities.get(id);
    if (c?.type !== "character") continue;
    c.aboard = null;
    c.x = hall.x + hall.w / 2;
    c.y = hall.y + hall.h + 0.5;
    c.action = "idle";
    markDirty(state, c.id);
  }
  ship.riders = [];
}

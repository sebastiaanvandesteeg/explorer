// Ferrying villagers between islands: boarding from the shore or a pier, and landing.
import { NEIGHBOURS_8 } from "../world/grid";
import type { Dir } from "../world/types";
import type { Tile } from "../world/pathfind";
import { SHIP, VILLAGER } from "./catalogue";
import {
  islandAt,
  markDirty,
  reveal,
  walkable,
  type GameState,
  type ShipEntity,
  type VillagerEntity,
} from "./state";

/** Walkable land (or pier) tiles right next to where the ship floats: where people step aboard. */
export function shoreBeside(state: GameState, ship: ShipEntity): Tile[] {
  const sx = Math.floor(ship.x);
  const sy = Math.floor(ship.y);
  const out: Tile[] = [];
  for (const [dx, dy] of NEIGHBOURS_8)
    if (walkable(state, sx + dx, sy + dy)) out.push({ x: sx + dx, y: sy + dy });
  return out;
}

/** Where a dock launches ships and receives them: just past the end of the pier. */
export function dockSpawn(b: { x: number; y: number; w: number; h: number; dir?: Dir }): {
  x: number;
  y: number;
} {
  switch (b.dir) {
    case "-x":
      return { x: b.x - 0.5, y: b.y + 1 };
    case "+y":
      return { x: b.x + 1, y: b.y + b.h + 0.5 };
    case "-y":
      return { x: b.x + 1, y: b.y - 0.5 };
    default:
      return { x: b.x + b.w + 0.5, y: b.y + 1 };
  }
}

export function shipMoving(ship: ShipEntity): boolean {
  return ship.path.length > 0;
}

export function hasRoom(ship: ShipEntity): boolean {
  return ship.kind !== "cargo" && ship.passengers.length < SHIP.capacity;
}

/** A villager standing beside the ship climbs aboard. */
export function embark(state: GameState, v: VillagerEntity, ship: ShipEntity): void {
  v.aboard = ship.id;
  v.task = null;
  v.path = [];
  v.action = "idle";
  v.tool = null;
  v.x = ship.x;
  v.y = ship.y;
  ship.passengers.push(v.id);
  markDirty(state, v.id);
  markDirty(state, ship.id);
}

/**
 * Put every passenger ashore on free tiles near the ship. Returns how many landed (0 when no
 * shore is within reach).
 */
export function disembark(state: GameState, ship: ShipEntity): number {
  const start = shoreBeside(state, ship);
  if (start.length === 0 || ship.passengers.length === 0) return 0;
  // Spread out from the landing spot so passengers don't stack on one tile.
  const spots: Tile[] = [];
  const seen = new Set(start.map((t) => `${t.x},${t.y}`));
  const queue = [...start];
  for (let head = 0; head < queue.length && spots.length < ship.passengers.length; head++) {
    const t = queue[head]!;
    spots.push(t);
    for (const [dx, dy] of NEIGHBOURS_8) {
      const n = { x: t.x + dx, y: t.y + dy };
      const key = `${n.x},${n.y}`;
      if (seen.has(key) || !walkable(state, n.x, n.y) || head > 12) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  const landed = ship.passengers.splice(0);
  landed.forEach((id, i) => {
    const v = state.entities.get(id);
    if (v?.type !== "villager") return;
    const t = spots[i % spots.length]!;
    v.aboard = null;
    v.x = t.x + 0.5;
    v.y = t.y + 0.5;
    v.action = "idle";
    v.task = null;
    v.path = [];
    v.retryAt = state.time + 0.5;
    reveal(state, v.x, v.y, VILLAGER.reveal);
    markDirty(state, v.id);
  });
  const first = spots[0]!;
  state.events.push({
    type: "landed",
    count: landed.length,
    islandId: islandAt(state, first.x, first.y),
    x: first.x,
    y: first.y,
  });
  markDirty(state, ship.id);
  return landed.length;
}

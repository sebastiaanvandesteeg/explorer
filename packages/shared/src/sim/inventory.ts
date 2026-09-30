// What players do with items: drop them on land, pick them up, find them lying about. Items never
// touch the sea: a drop that would land in water is refused.
import { createRng } from "../rng";
import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { ITEMS, BIOME_TREASURE, addToPack, packRoom, takeFromPack, type ItemKind } from "./items";
import {
  addEntity,
  markDirty,
  removeEntity,
  type CharacterEntity,
  type GameState,
  type ItemEntity,
} from "./state";
import { characterOf } from "./characters";

/** How far, in tiles, a character can reach to pick something up or throw something down. */
export const PICKUP_REACH = 1.6;
export const DROP_REACH = 3;

type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });

/** Dry land a thing can lie on: not the sea, not a pier over it. */
export function isSolidGround(state: GameState, x: number, y: number): boolean {
  return (
    inBounds(state.world, x, y) && isLandTerrain(state.world.terrain[tileIndex(state.world, x, y)]!)
  );
}

export function itemsOn(state: GameState, x: number, y: number): ItemEntity[] {
  const out: ItemEntity[] = [];
  for (const e of state.entities.values())
    if (e.type === "item" && e.x === x && e.y === y) out.push(e);
  return out;
}

/**
 * Lay items on the ground at or near a tile. Land only: tiles in the sea are skipped, and so are
 * tiles taken by a building or plant. Items of one kind join up with a pile already there. Returns
 * what could not be placed (nothing, unless there is no ground in reach).
 */
export function dropItems(
  state: GameState,
  kind: ItemKind,
  amount: number,
  x: number,
  y: number,
): number {
  const max = ITEMS[kind].stack;
  let left = amount;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++)
      candidates.push({ x: x + dx, y: y + dy, d: dx * dx + dy * dy });
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const t of candidates) {
    if (left <= 0) break;
    if (!isSolidGround(state, t.x, t.y)) continue;
    if (state.occupancy[tileIndex(state.world, t.x, t.y)]) continue;
    const here = itemsOn(state, t.x, t.y);
    const pile = here.find((i) => i.kind === kind && i.amount < max);
    if (pile) {
      const put = Math.min(max - pile.amount, left);
      pile.amount += put;
      left -= put;
      markDirty(state, pile.id);
    } else if (here.length === 0) {
      const put = Math.min(max, left);
      addEntity(state, {
        id: state.nextId++,
        type: "item",
        kind,
        amount: put,
        x: t.x,
        y: t.y,
      } satisfies ItemEntity);
      left -= put;
    }
  }
  return left;
}

/** Give a character items; whatever does not fit goes on the ground at their feet. */
export function grantItem(
  state: GameState,
  c: CharacterEntity,
  kind: ItemKind,
  amount: number,
): void {
  const left = addToPack(c.pack, kind, amount);
  markDirty(state, c.id);
  if (left > 0) dropItems(state, kind, left, Math.floor(c.x), Math.floor(c.y));
}

/** Throw items down on the ground from a slot of the actor's pack, at their feet or nearby. */
export function dropFromPack(
  state: GameState,
  actor: string | null,
  cmd: { slot: number; amount?: number; x?: number; y?: number },
): Result {
  const c = actor === null ? undefined : characterOf(state, actor);
  if (!c) return fail("You have no character here");
  if (c.aboard !== null) return fail("You can't drop things out at sea");
  if (c.inside !== null) return fail("Drop things outside");
  const here = { x: Math.floor(c.x), y: Math.floor(c.y) };
  const at = cmd.x === undefined || cmd.y === undefined ? here : { x: cmd.x, y: cmd.y };
  if (!isSolidGround(state, at.x, at.y)) return fail("You can't drop that in the sea");
  if (Math.hypot(at.x + 0.5 - c.x, at.y + 0.5 - c.y) > DROP_REACH)
    return fail("Too far away to put that there");
  const stack = c.pack[cmd.slot];
  if (!stack) return fail("Nothing in that slot");
  const want = Math.min(cmd.amount ?? stack.amount, stack.amount);
  if (!(want >= 1)) return fail("Nothing to drop");
  const kind = stack.kind;
  // Check there is room on the ground first, so nothing is lost on the way.
  const probe = dropItems(state, kind, want, at.x, at.y);
  const placed = want - probe;
  if (placed <= 0) return fail("There's no room to put that down here");
  takeFromPack(c.pack, cmd.slot, placed);
  markDirty(state, c.id);
  state.events.push({ type: "item", playerId: c.playerId, what: "dropped", kind, amount: placed });
  return { ok: true };
}

function take(state: GameState, c: CharacterEntity, item: ItemEntity): void {
  const room = packRoom(c.pack, item.kind);
  if (room <= 0) {
    state.events.push({
      type: "item",
      playerId: c.playerId,
      what: "full",
      kind: item.kind,
      amount: item.amount,
    });
    return;
  }
  const n = Math.min(room, item.amount);
  addToPack(c.pack, item.kind, n);
  markDirty(state, c.id);
  item.amount -= n;
  if (item.amount <= 0) removeEntity(state, item.id);
  else markDirty(state, item.id);
  state.events.push({
    type: "item",
    playerId: c.playerId,
    what: "picked",
    kind: item.kind,
    amount: n,
  });
}

export const isNear = (c: CharacterEntity, item: ItemEntity): boolean =>
  Math.hypot(item.x + 0.5 - c.x, item.y + 0.5 - c.y) <= PICKUP_REACH;

/** Called every tick for a character heading for an item: pick it up once they are close enough. */
export function collectFetched(state: GameState, c: CharacterEntity): void {
  if (c.fetch === null) return;
  const item = state.entities.get(c.fetch);
  if (item?.type !== "item") {
    c.fetch = null;
    markDirty(state, c.id);
    return;
  }
  if (!isNear(c, item)) {
    if (c.action !== "walk") {
      c.fetch = null;
      markDirty(state, c.id);
    }
    return;
  }
  c.fetch = null;
  c.path = [];
  c.dest = null;
  c.action = "idle";
  take(state, c, item);
}

/** Pick up an item: at once when it is within reach, otherwise by walking over to it first. */
export function pickUp(
  state: GameState,
  actor: string | null,
  cmd: { itemId: number },
  walkTo: (c: CharacterEntity, x: number, y: number) => Result,
): Result {
  const c = actor === null ? undefined : characterOf(state, actor);
  if (!c) return fail("You have no character here");
  if (c.aboard !== null) return fail("You are at sea");
  if (c.inside !== null) return fail("Leave the building first");
  const item = state.entities.get(cmd.itemId);
  if (item?.type !== "item") return fail("That is gone");
  if (packRoom(c.pack, item.kind) <= 0) return fail("Your pack is full");
  if (isNear(c, item)) {
    take(state, c, item);
    return { ok: true };
  }
  const walk = walkTo(c, item.x, item.y);
  if (!walk.ok) return walk;
  c.fetch = item.id;
  markDirty(state, c.id);
  return { ok: true };
}

/**
 * Lay out things to find on the islands of an adventure world: a few on each island, more on big
 * ones, everyday things and one treasure the biome is known for. Deterministic in the seed.
 */
export function scatterLoot(state: GameState): void {
  const w = state.world;
  const EVERYDAY: ItemKind[] = ["timber", "stone", "ore", "rope", "bread", "sea_glass"];
  for (const island of w.islands) {
    if (island.id === w.start.islandId) continue;
    const rng = createRng(`${w.seed}:loot:${island.id}`);
    const count = 1 + Math.min(3, Math.floor(island.tiles / 250));
    for (let n = 0; n < count; n++) {
      const treasure = n === 0;
      const kind = treasure ? BIOME_TREASURE[island.biome] : rng.pick(EVERYDAY);
      const amount = treasure ? 1 : rng.int(1, 3);
      for (let tries = 0; tries < 80; tries++) {
        const a = rng.float(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * island.radius;
        const x = Math.round(island.cx + Math.cos(a) * r);
        const y = Math.round(island.cy + Math.sin(a) * r);
        if (!isSolidGround(state, x, y) || w.island[tileIndex(w, x, y)] !== island.id) continue;
        if (state.occupancy[tileIndex(w, x, y)] || itemsOn(state, x, y).length > 0) continue;
        addEntity(state, {
          id: state.nextId++,
          type: "item",
          kind,
          amount,
          x,
          y,
        } satisfies ItemEntity);
        break;
      }
    }
  }
}

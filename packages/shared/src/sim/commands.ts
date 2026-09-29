import { inBounds, tileIndex } from "../world/grid";
import {
  BUILDINGS,
  canAfford,
  MARKET_BUYABLE,
  MARKET_LOT,
  MARKET_PRICES,
  refund,
  SHIP,
  shipCost,
  spend,
  VILLAGER,
  type BuildingKind,
  type Resource,
} from "./catalogue";
import { disembark, hasRoom, shipMoving, shoreBeside } from "./ferry";
import { seaPath, sailable } from "./navigation";
import { canPlaceBuilding, nearestWater } from "./rules";
import {
  addEntity,
  markDirty,
  newBuilding,
  population,
  populationCap,
  removeEntity,
  walkable,
  type GameState,
  type ShipEntity,
  type VillagerEntity,
} from "./state";

export type AssignTarget =
  { node: number } | { building: number } | { ship: number } | { x: number; y: number };

export type Command =
  | { kind: "place-building"; building: BuildingKind; x: number; y: number }
  | { kind: "remove-building"; buildingId: number }
  | { kind: "mark"; nodeIds: number[]; marked: boolean }
  | { kind: "train-villager"; buildingId: number }
  | { kind: "build-ship"; buildingId: number }
  | { kind: "move-ship"; shipId: number; x: number; y: number; unload?: boolean }
  | { kind: "assign"; villagerId: number; target: AssignTarget }
  | { kind: "call-aboard"; shipId: number }
  | { kind: "unload"; shipId: number }
  | { kind: "trade"; resource: Resource; action: "sell" | "buy" };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

/** Drop whatever a villager was doing, releasing claims on nodes and buildings. */
export function releaseTask(state: GameState, v: VillagerEntity): void {
  const t = v.task;
  if (t?.kind === "harvest") {
    const node = state.entities.get(t.nodeId);
    if (node?.type === "node" && node.claimedBy === v.id) {
      node.claimedBy = null;
      markDirty(state, node.id);
    }
  }
  const staffOf = t?.kind === "staff" ? t.buildingId : t?.kind === "harvest" ? t.auto : undefined;
  if (staffOf !== undefined) {
    const b = state.entities.get(staffOf);
    if (b?.type === "building" && b.workerId === v.id) {
      b.workerId = null;
      markDirty(state, b.id);
    }
  }
  v.task = null;
  v.path = [];
  v.action = "idle";
  v.workTimer = 0;
  v.tool = null;
  markDirty(state, v.id);
}

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  switch (cmd.kind) {
    case "place-building": {
      if (!(cmd.building in BUILDINGS)) return fail("Unknown building");
      const check = canPlaceBuilding(state, cmd.building, cmd.x, cmd.y);
      if (!check.ok) return check;
      const def = BUILDINGS[cmd.building];
      spend(state.stock, def.cost);
      state.stockDirty = true;
      // Stumps and saplings under the footprint are cleared.
      for (let y = cmd.y; y < cmd.y + def.size[1]; y++)
        for (let x = cmd.x; x < cmd.x + def.size[0]; x++) {
          const id = state.occupancy[tileIndex(state.world, x, y)]!;
          if (id) removeEntity(state, id);
        }
      addEntity(state, newBuilding(state, cmd.building, cmd.x, cmd.y, false));
      return OK;
    }
    case "remove-building": {
      const b = state.entities.get(cmd.buildingId);
      if (b?.type !== "building") return fail("No such building");
      if (!BUILDINGS[b.kind].buildable) return fail("That can't be removed");
      refund(state.stock, BUILDINGS[b.kind].cost, b.complete ? 0.5 : 1);
      state.stockDirty = true;
      for (const e of state.entities.values()) {
        if (e.type !== "villager" || !e.task) continue;
        const t = e.task;
        const involved =
          t.kind === "build" || t.kind === "staff"
            ? t.buildingId === b.id
            : t.kind === "harvest" && t.auto === b.id;
        if (involved) releaseTask(state, e);
      }
      removeEntity(state, b.id);
      return OK;
    }
    case "mark": {
      let changed = 0;
      for (const id of cmd.nodeIds.slice(0, 500)) {
        const n = state.entities.get(id);
        if (n?.type !== "node" || n.stage !== "grown" || n.marked === cmd.marked) continue;
        n.marked = cmd.marked;
        markDirty(state, n.id);
        changed++;
      }
      return changed > 0 ? OK : fail("Nothing to mark");
    }
    case "train-villager": {
      const b = state.entities.get(cmd.buildingId);
      if (b?.type !== "building" || b.kind !== "town_hall" || !b.complete)
        return fail("Needs a town hall");
      const queued = b.queue.filter((q) => q.what === "villager").length;
      if (population(state) + queued >= populationCap(state))
        return fail("Build more houses first");
      if (!canAfford(state.stock, VILLAGER.trainCost)) return fail("Not enough food");
      spend(state.stock, VILLAGER.trainCost);
      state.stockDirty = true;
      b.queue.push({ what: "villager", remaining: VILLAGER.trainSeconds });
      markDirty(state, b.id);
      return OK;
    }
    case "build-ship": {
      const b = state.entities.get(cmd.buildingId);
      if (b?.type !== "building" || b.kind !== "dock" || !b.complete) return fail("Needs a dock");
      let ships = 0;
      for (const e of state.entities.values()) if (e.type === "ship") ships++;
      if (ships + b.queue.length >= SHIP.max) return fail(`At most ${SHIP.max} ships`);
      const cost = shipCost(state.world.tribe);
      if (!canAfford(state.stock, cost)) return fail("Not enough wood");
      spend(state.stock, cost);
      state.stockDirty = true;
      b.queue.push({ what: "ship", remaining: SHIP.buildSeconds });
      markDirty(state, b.id);
      return OK;
    }
    case "move-ship": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      const w = state.world;
      const tx = Math.floor(cmd.x);
      const ty = Math.floor(cmd.y);
      if (!inBounds(w, tx, ty)) return fail("Outside the map");
      // Clicking an island means "sail to its shore": find the closest open water.
      const target = sailable(state, tx, ty) ? { x: tx, y: ty } : nearestWater(state, tx, ty, 24);
      if (!target || !sailable(state, target.x, target.y)) return fail("Can't sail there");
      const path = seaPath(state, { x: Math.floor(ship.x), y: Math.floor(ship.y) }, target);
      if (!path) return fail("No route by sea");
      ship.unload = !!cmd.unload && ship.passengers.length > 0;
      if (path.length === 0 && ship.unload) {
        ship.unload = false;
        return disembark(state, ship) > 0 ? OK : fail("No room to land here");
      }
      ship.path = path;
      ship.dest = target;
      markDirty(state, ship.id);
      return OK;
    }
    case "call-aboard": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      return callAboard(state, ship);
    }
    case "unload": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      if (ship.passengers.length === 0) return fail("Nobody on board");
      if (shipMoving(ship)) return fail("Wait until the ship stops");
      return disembark(state, ship) > 0 ? OK : fail("Sail next to the shore to land");
    }
    case "trade": {
      if (
        ![...state.entities.values()].some(
          (e) => e.type === "building" && e.kind === "market" && e.complete,
        )
      )
        return fail("Build a market first");
      const price = MARKET_PRICES[cmd.resource];
      if (price === undefined) return fail("The market doesn't trade that");
      if (cmd.action === "sell") {
        if (state.stock[cmd.resource] < MARKET_LOT)
          return fail(`You need ${MARKET_LOT} ${cmd.resource} to sell`);
        state.stock[cmd.resource] -= MARKET_LOT;
        state.stock.gold += price;
      } else {
        if (!MARKET_BUYABLE.includes(cmd.resource)) return fail("The market doesn't sell that");
        if (state.stock.gold < price * 2) return fail("Not enough gold");
        state.stock.gold -= price * 2;
        state.stock[cmd.resource] += MARKET_LOT;
      }
      state.stockDirty = true;
      return OK;
    }
    case "assign": {
      const v = state.entities.get(cmd.villagerId);
      if (v?.type !== "villager") return fail("No such villager");
      if (v.aboard !== null) return fail("That villager is at sea");
      const t = cmd.target;
      if ("ship" in t) {
        const ship = state.entities.get(t.ship);
        if (ship?.type !== "ship") return fail("No such ship");
        if (!hasRoom(ship)) return fail("The ship is full");
        if (shoreBeside(state, ship).length === 0)
          return fail("Sail the ship next to the shore first");
        releaseTask(state, v);
        v.task = { kind: "board", shipId: ship.id };
        return OK;
      }
      if ("node" in t) {
        const n = state.entities.get(t.node);
        if (n?.type !== "node" || n.stage !== "grown") return fail("Nothing to gather there");
        if (n.claimedBy !== null && n.claimedBy !== v.id) {
          const other = state.entities.get(n.claimedBy);
          if (other?.type === "villager") releaseTask(state, other);
        }
        releaseTask(state, v);
        n.marked = true;
        n.claimedBy = v.id;
        markDirty(state, n.id);
        v.task = { kind: "harvest", nodeId: n.id };
        return OK;
      }
      if ("building" in t) {
        const b = state.entities.get(t.building);
        if (b?.type !== "building") return fail("No such building");
        const def = BUILDINGS[b.kind];
        releaseTask(state, v);
        if (!b.complete) {
          v.task = { kind: "build", buildingId: b.id };
          return OK;
        }
        if (def.worker) {
          if (b.workerId !== null) {
            const prev = state.entities.get(b.workerId);
            if (prev?.type === "villager") releaseTask(state, prev);
          }
          b.workerId = v.id;
          markDirty(state, b.id);
          v.task = { kind: "staff", buildingId: b.id };
          return OK;
        }
        return fail("Nothing to do there");
      }
      const tx = Math.floor(t.x);
      const ty = Math.floor(t.y);
      const w = state.world;
      if (!inBounds(w, tx, ty) || !walkable(state, tx, ty)) return fail("Can't walk there");
      releaseTask(state, v);
      v.task = { kind: "move", x: tx, y: ty };
      return OK;
    }
  }
}

/** Send the nearest villager on the ship's shore to climb aboard (idle ones first). */
function callAboard(state: GameState, ship: ShipEntity): CommandResult {
  if (!hasRoom(ship)) return fail("The ship is full");
  const shore = shoreBeside(state, ship);
  if (shore.length === 0) return fail("Sail the ship next to the shore first");
  const island = state.world.island[tileIndex(state.world, shore[0]!.x, shore[0]!.y)];
  const boarding = new Set<number>();
  for (const e of state.entities.values()) {
    if (e.type === "villager" && e.task?.kind === "board" && e.task.shipId === ship.id)
      boarding.add(e.id);
  }
  if (ship.passengers.length + boarding.size >= SHIP.capacity)
    return fail("Enough villagers are on their way");
  let best: { v: VillagerEntity; score: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "villager" || e.aboard !== null || boarding.has(e.id)) continue;
    const k = tileIndex(state.world, Math.floor(e.x), Math.floor(e.y));
    if (state.world.island[k] !== island) continue;
    const busy = e.task && e.task.kind !== "move" ? 50 : 0;
    const score = Math.hypot(e.x - ship.x, e.y - ship.y) + busy;
    if (!best || score < best.score) best = { v: e, score };
  }
  if (!best) return fail("No villagers on this shore");
  releaseTask(state, best.v);
  best.v.task = { kind: "board", shipId: ship.id };
  return OK;
}

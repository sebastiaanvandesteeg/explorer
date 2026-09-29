import { inBounds, tileIndex } from "../world/grid";
import {
  BUILDINGS,
  CARGO,
  diveSeconds,
  PATROL,
  RESOURCES,
  SALVAGE_SECONDS,
  canAfford,
  cargoCost,
  MARKET_BUYABLE,
  MARKET_LOT,
  MARKET_PRICES,
  refund,
  sellPrice,
  SHIP,
  shipCost,
  spend,
  VILLAGER,
  type BuildingKind,
  type Resource,
  type UpgradeId,
  UPGRADES,
} from "./catalogue";
import { moveCharacter } from "./characters";
import { disembark, hasRoom, landingBlock, shipMoving, shoreBeside } from "./ferry";
import { seaPath, sailable } from "./navigation";
import { greatWorkStages } from "./greatwork";
import { canPlaceBuilding, nearestWater } from "./rules";
import {
  addEntity,
  islandAt,
  markDirty,
  newBuilding,
  population,
  populationCap,
  removeEntity,
  revealIslands,
  walkable,
  type GameState,
  type ShipEntity,
  type VillagerEntity,
} from "./state";

export type AssignTarget =
  | { node: number }
  | { building: number }
  | { ship: number }
  | { wreck: number }
  | { x: number; y: number };

export type Command =
  | { kind: "place-building"; building: BuildingKind; x: number; y: number }
  | { kind: "remove-building"; buildingId: number }
  | { kind: "mark"; nodeIds: number[]; marked: boolean }
  | { kind: "train-villager"; buildingId: number }
  | { kind: "build-ship"; buildingId: number; ship?: "scout" | "cargo" | "patrol" }
  | { kind: "salvage"; shipId: number; wreckId: number }
  | { kind: "dive"; shipId: number; siteId: number }
  | { kind: "set-route"; shipId: number; dockId: number | null }
  | { kind: "move-ship"; shipId: number; x: number; y: number; unload?: boolean }
  | { kind: "assign"; villagerId: number; target: AssignTarget }
  | { kind: "call-aboard"; shipId: number }
  | { kind: "unload"; shipId: number }
  | { kind: "buy-upgrade"; upgrade: UpgradeId }
  | { kind: "fund-great-work"; buildingId: number }
  | { kind: "trade"; resource: Resource; action: "sell" | "buy" }
  | { kind: "move-character"; x: number; y: number };

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

/** Steering a ship by hand ends whatever it was doing on its own. */
function stopDuty(ship: ShipEntity): void {
  ship.route = null;
  ship.leg = null;
  ship.hunt = false;
  ship.salvage = null;
  ship.dive = null;
}

/**
 * Apply a command from a player. `actor` is the player slot it came from (null for the
 * simulation's own callers, such as tests): commands about a player's own character act on the
 * actor's character and nobody else's. The rest are shared by the whole team.
 */
export function applyCommand(
  state: GameState,
  cmd: Command,
  actor: string | null = null,
): CommandResult {
  switch (cmd.kind) {
    case "move-character":
      return moveCharacter(state, actor, cmd);
    case "place-building": {
      if (!(cmd.building in BUILDINGS)) return fail("Unknown building");
      const check = canPlaceBuilding(state, cmd.building, cmd.x, cmd.y);
      if (!check.ok) return check;
      const def = BUILDINGS[cmd.building];
      spend(state.stock, def.cost);
      state.stockDirty = true;
      if (check.site) {
        // A dock: the pier runs out over the water from the shore tile that was clicked.
        const { x, y, dir } = check.site;
        addEntity(state, newBuilding(state, "dock", x, y, false, dir));
        return OK;
      }
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
      if (b.kind === "great_work" && (b.stage ?? 0) >= 1)
        return fail("The Great Work can't be torn down");
      const startDock = state.world.start.dock;
      if (b.kind === "dock" && b.x === startDock.x && b.y === startDock.y)
        return fail("The home dock can't be removed");
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
      if (b.kind === "dock") {
        // Ships that collected from this dock, or waited in its queue, lose their route.
        for (const e of state.entities.values()) {
          if (e.type === "ship" && e.route === b.id) {
            e.route = null;
            e.leg = null;
            markDirty(state, e.id);
          }
        }
        for (const q of b.queue) {
          if (q.what === "villager") continue;
          const tribe = state.world.tribe;
          refund(state.stock, q.what === "cargo" ? cargoCost(tribe) : shipCost(tribe));
        }
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
      const kind = cmd.ship ?? "scout";
      const queued = kind === "scout" ? "ship" : kind;
      let count = 0;
      for (const e of state.entities.values()) {
        if (e.type === "ship" && e.kind === kind) count++;
        else if (e.type === "building") count += e.queue.filter((q) => q.what === queued).length;
      }
      const max = kind === "cargo" ? CARGO.max : kind === "patrol" ? PATROL.max : SHIP.max;
      if (count >= max) return fail(`At most ${max} ${kind} ships`);
      const tribe = state.world.tribe;
      const cost =
        kind === "cargo" ? cargoCost(tribe) : kind === "patrol" ? PATROL.cost : shipCost(tribe);
      if (!canAfford(state.stock, cost)) return fail("Not enough resources");
      spend(state.stock, cost);
      state.stockDirty = true;
      b.queue.push({
        what: queued,
        remaining:
          kind === "cargo"
            ? CARGO.buildSeconds
            : kind === "patrol"
              ? PATROL.buildSeconds
              : SHIP.buildSeconds,
      });
      markDirty(state, b.id);
      return OK;
    }
    case "salvage": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      const wreck = state.entities.get(cmd.wreckId);
      if (wreck?.type !== "wreck" || wreck.kind !== "shipwreck") return fail("Nothing to salvage");
      if (ship.kind === "cargo")
        return fail("Cargo ships can't salvage: use a scout or patrol boat");
      const path = seaPath(
        state,
        { x: Math.floor(ship.x), y: Math.floor(ship.y) },
        { x: wreck.x, y: wreck.y },
      );
      if (!path) return fail("No route by sea");
      stopDuty(ship);
      ship.path = path;
      ship.dest = { x: wreck.x, y: wreck.y };
      ship.salvage = { wreckId: wreck.id, remaining: SALVAGE_SECONDS };
      markDirty(state, ship.id);
      return OK;
    }
    case "dive": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      const site = state.entities.get(cmd.siteId);
      if (site?.type !== "site" || !site.found) return fail("Nothing to dive at");
      if (RESOURCES.every((r) => (site.loot[r] ?? 0) === 0)) return fail("Nothing left down there");
      if (ship.kind !== "scout") return fail("Only scout ships carry divers");
      if (ship.passengers.length === 0) return fail("Take villagers aboard: they are the divers");
      const path = seaPath(
        state,
        { x: Math.floor(ship.x), y: Math.floor(ship.y) },
        { x: site.x, y: site.y },
      );
      if (!path) return fail("No route by sea");
      stopDuty(ship);
      ship.unload = false;
      ship.path = path;
      ship.dest = { x: site.x, y: site.y };
      ship.dive = { siteId: site.id, remaining: diveSeconds(state.world.tribe) };
      markDirty(state, ship.id);
      return OK;
    }
    case "set-route": {
      const ship = state.entities.get(cmd.shipId);
      if (ship?.type !== "ship") return fail("No such ship");
      if (ship.kind !== "cargo") return fail("Only cargo ships sail trade routes");
      if (cmd.dockId === null) {
        ship.route = null;
        ship.leg = null;
        markDirty(state, ship.id);
        return OK;
      }
      const dock = state.entities.get(cmd.dockId);
      if (dock?.type !== "building" || dock.kind !== "dock" || !dock.complete)
        return fail("Pick a finished dock");
      if (islandAt(state, dock.x, dock.y) === state.world.start.islandId)
        return fail("Pick a dock on another island: cargo is carried home");
      const home = [...state.entities.values()].some(
        (e) =>
          e.type === "building" &&
          e.kind === "dock" &&
          e.complete &&
          islandAt(state, e.x, e.y) === state.world.start.islandId,
      );
      if (!home) return fail("You need a dock at home to unload at");
      ship.route = dock.id;
      ship.leg = ship.leg ?? null;
      ship.path = [];
      ship.dest = null;
      ship.unload = false;
      markDirty(state, ship.id);
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
      // Steering a ship by hand ends its trade route, hunt, salvage or dive.
      stopDuty(ship);
      if (cmd.unload && ship.passengers.length > 0) {
        const island = w.island[tileIndex(w, tx, ty)]!;
        const blocked = island >= 0 && landingBlock(state, island);
        if (blocked) return fail(blocked);
      }
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
      const here = shoreBeside(state, ship)[0];
      const blocked = here && landingBlock(state, islandAt(state, here.x, here.y));
      if (blocked) return fail(blocked);
      return disembark(state, ship) > 0 ? OK : fail("Sail next to the shore to land");
    }
    case "fund-great-work": {
      const b = state.entities.get(cmd.buildingId);
      if (b?.type !== "building" || b.kind !== "great_work") return fail("No Great Work there");
      const stages = greatWorkStages(state.world);
      const stage = b.stage ?? 0;
      if (stage >= stages.length) return fail("The Great Work is complete");
      if (!b.complete)
        return fail(
          stage === 0 ? "The foundations are still being laid" : "The builders are still at work",
        );
      const cost = stages[stage]!.cost;
      if (!canAfford(state.stock, cost)) return fail("Not enough for the next stage");
      spend(state.stock, cost);
      state.stockDirty = true;
      b.complete = false;
      b.progress = 0;
      markDirty(state, b.id);
      return OK;
    }
    case "buy-upgrade": {
      const def = UPGRADES[cmd.upgrade];
      if (!def) return fail("Unknown upgrade");
      if (
        ![...state.entities.values()].some(
          (e) => e.type === "building" && e.kind === def.at && e.complete,
        )
      )
        return fail(def.at === "dock" ? "Needs a dock" : "Build a magic house first");
      if (state.upgrades.has(def.id)) return fail("Already learned");
      if (!canAfford(state.stock, def.cost)) return fail("Not enough resources");
      spend(state.stock, def.cost);
      state.stockDirty = true;
      state.upgrades.add(def.id);
      state.upgradesDirty = true;
      if (def.id === "seers_chart") revealIslands(state);
      state.events.push({ type: "upgrade", upgrade: def.id });
      return OK;
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
        state.stock.gold += sellPrice(cmd.resource, state.world.tribe);
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
        if (ship.kind !== "scout") return fail("Only scout ships carry villagers");
        if (!hasRoom(ship)) return fail("The ship is full");
        if (shoreBeside(state, ship).length === 0)
          return fail("Sail the ship next to the shore first");
        releaseTask(state, v);
        v.task = { kind: "board", shipId: ship.id };
        return OK;
      }
      if ("wreck" in t) {
        const w = state.entities.get(t.wreck);
        if (w?.type !== "wreck" || w.kind !== "skeleton")
          return fail("Ships salvage shipwrecks; villagers pick over bones ashore");
        releaseTask(state, v);
        v.task = { kind: "loot", wreckId: w.id };
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
  if (ship.kind !== "scout") return fail("Only scout ships carry villagers");
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

import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import {
  BUILDINGS,
  canAfford,
  refund,
  SHIP,
  spend,
  VILLAGER,
  type BuildingKind,
} from "./catalogue";
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
  type VillagerEntity,
} from "./state";

export type AssignTarget = { node: number } | { building: number } | { x: number; y: number };

export type Command =
  | { kind: "place-building"; building: BuildingKind; x: number; y: number }
  | { kind: "remove-building"; buildingId: number }
  | { kind: "mark"; nodeIds: number[]; marked: boolean }
  | { kind: "train-villager"; buildingId: number }
  | { kind: "build-ship"; buildingId: number }
  | { kind: "move-ship"; shipId: number; x: number; y: number }
  | { kind: "assign"; villagerId: number; target: AssignTarget };

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
      if (!canAfford(state.stock, SHIP.cost)) return fail("Not enough wood");
      spend(state.stock, SHIP.cost);
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
      ship.path = path;
      ship.dest = target;
      markDirty(state, ship.id);
      return OK;
    }
    case "assign": {
      const v = state.entities.get(cmd.villagerId);
      if (v?.type !== "villager") return fail("No such villager");
      const t = cmd.target;
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
      if (
        !inBounds(w, tx, ty) ||
        !isLandTerrain(w.terrain[tileIndex(w, tx, ty)]!) ||
        !walkable(state, tx, ty)
      ) {
        return fail("Can't walk there");
      }
      releaseTask(state, v);
      v.task = { kind: "move", x: tx, y: ty };
      return OK;
    }
  }
}

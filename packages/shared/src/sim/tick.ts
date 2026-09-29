// One fixed simulation step: production queues, farms, regrowth, villager jobs and ships.
import { hash2d } from "../rng";
import { tileIndex } from "../world/grid";
import type { Tile } from "../world/pathfind";
import {
  BUILDING_REVEAL,
  BUILDINGS,
  CHURCH,
  FARM,
  farmRate,
  GATHER_JOBS,
  harvestSeconds,
  NODES,
  REGROW,
  SHIP,
  shipSpeed,
  SMITH,
  TICK_SECONDS,
  VILLAGER,
  type WorkerJob,
} from "./catalogue";
import { releaseTask } from "./commands";
import { disembark, embark, hasRoom, shipMoving, shoreBeside } from "./ferry";
import { landPath, sailable } from "./navigation";
import { buildingAround, isAdjacentTo, tilesAround } from "./rules";
import {
  addEntity,
  isPathTile,
  markDirty,
  newVillager,
  population,
  populationCap,
  removeEntity,
  reveal,
  walkable,
  type BuildingEntity,
  type GameState,
  type NodeEntity,
  type ShipEntity,
  type Task,
  type VillagerEntity,
} from "./state";

export function tick(state: GameState, dt = TICK_SECONDS): void {
  state.time += dt;
  state.tick++;
  const all = [...state.entities.values()];
  for (const e of all) {
    if (e.type === "building") updateBuilding(state, e, dt);
    else if (e.type === "node" && e.stage !== "grown") updateNode(state, e, dt);
  }
  for (const e of all) {
    if (!state.entities.has(e.id)) continue;
    if (e.type === "villager") updateVillager(state, e, dt);
    else if (e.type === "ship") updateShip(state, e, dt);
  }
}

// ---------------------------------------------------------------------------------------------
// Buildings and nodes

function updateBuilding(state: GameState, b: BuildingEntity, dt: number): void {
  if (!b.complete) return;
  const job = b.queue[0];
  if (job) {
    job.remaining = Math.max(0, job.remaining - dt);
    markDirty(state, b.id);
    if (job.remaining === 0) {
      if (job.what === "villager" && population(state) < populationCap(state)) {
        const spot = buildingAround(state, b).sort((p, q) => q.y + q.x - (p.y + p.x))[0];
        if (spot) {
          const v = addEntity(state, newVillager(state, spot.x, spot.y));
          reveal(state, v.x, v.y, VILLAGER.reveal);
          state.events.push({ type: "villager", x: spot.x, y: spot.y });
          b.queue.shift();
        }
      } else if (job.what === "ship") {
        const at = shipSpawn(b);
        if (sailable(state, Math.floor(at.x), Math.floor(at.y))) {
          const ship: ShipEntity = {
            id: state.nextId++,
            type: "ship",
            x: at.x,
            y: at.y,
            heading: { "+x": 0, "+y": 2, "-x": 4, "-y": 6 }[b.dir ?? "+x"],
            path: [],
            dest: null,
            passengers: [],
            unload: false,
          };
          addEntity(state, ship);
          reveal(state, ship.x, ship.y, SHIP.reveal);
          state.events.push({ type: "ship", x: ship.x, y: ship.y });
          b.queue.shift();
        }
      }
    }
  }
  if (b.workerId === null) return;
  const v = state.entities.get(b.workerId);
  const tending = v?.type === "villager" && v.action === "work" && v.task?.kind === "staff";
  if (!tending) return;
  if (b.kind === "farm") {
    const stageBefore = farmStage(b);
    b.growth += dt * farmRate(state.world.tribe);
    if (b.growth >= FARM.cycle) {
      b.growth = 0;
      state.stock.food += FARM.yield;
      state.stockDirty = true;
    }
    if (farmStage(b) !== stageBefore) markDirty(state, b.id);
  } else if (b.kind === "blacksmith") {
    // The forge only burns while there is ore to work.
    if (state.stock.ore < SMITH.ore) return;
    b.growth += dt;
    if (b.growth >= SMITH.seconds) {
      b.growth = 0;
      state.stock.ore -= SMITH.ore;
      state.stock.tools += SMITH.tools;
      state.stockDirty = true;
      markDirty(state, b.id);
    }
  } else if (b.kind === "church") {
    b.growth += dt;
    if (b.growth >= CHURCH.seconds) {
      b.growth = 0;
      state.stock.faith += CHURCH.faith;
      state.stockDirty = true;
    }
  }
}

/** Workplaces where the worker stays put, as opposed to gathering around the building. */
export function stationaryJob(job: WorkerJob | undefined): boolean {
  return job === "farm" || job === "smith" || job === "priest";
}

export function farmStage(b: BuildingEntity): 0 | 1 | 2 {
  return Math.min(2, Math.floor((b.growth / FARM.cycle) * 3)) as 0 | 1 | 2;
}

/** Where a dock launches ships: just past the end of the pier. */
export function shipSpawn(b: BuildingEntity): { x: number; y: number } {
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

function updateNode(state: GameState, n: NodeEntity, dt: number): void {
  n.timer -= dt;
  if (n.timer > 0) return;
  if (n.stage === "stump") {
    n.stage = "sapling";
    n.timer = REGROW.saplingToTree;
  } else {
    n.stage = "grown";
    n.amount = NODES[n.kind].amount;
    n.timer = 0;
  }
  markDirty(state, n.id);
}

function depleteNode(state: GameState, n: NodeEntity): void {
  const how = NODES[n.kind].depletes;
  if (how === "gone") {
    removeEntity(state, n.id);
    return;
  }
  n.stage = how;
  n.timer = how === "stump" ? REGROW.stumpToSapling : REGROW.bareToRipe;
  n.marked = false;
  n.claimedBy = null;
  markDirty(state, n.id);
}

function completeBuilding(state: GameState, b: BuildingEntity): void {
  b.complete = true;
  b.progress = 1;
  markDirty(state, b.id);
  reveal(state, b.x + b.w / 2, b.y + b.h / 2, BUILDING_REVEAL);
  state.events.push({ type: "built", kind: b.kind, x: b.x, y: b.y });
}

// ---------------------------------------------------------------------------------------------
// Villagers

const tileOf = (v: { x: number; y: number }): Tile => ({ x: Math.floor(v.x), y: Math.floor(v.y) });

function taskValid(state: GameState, v: VillagerEntity, t: Task): boolean {
  switch (t.kind) {
    case "harvest": {
      const n = state.entities.get(t.nodeId);
      return (
        n?.type === "node" &&
        n.stage === "grown" &&
        n.amount > 0 &&
        (n.marked || t.auto !== undefined)
      );
    }
    case "build": {
      const b = state.entities.get(t.buildingId);
      return b?.type === "building" && !b.complete;
    }
    case "staff": {
      const b = state.entities.get(t.buildingId);
      return b?.type === "building" && b.complete && b.workerId === v.id;
    }
    case "move":
      return true;
    case "board": {
      const ship = state.entities.get(t.shipId);
      return ship?.type === "ship" && hasRoom(ship) && !shipMoving(ship);
    }
  }
}

function updateVillager(state: GameState, v: VillagerEntity, dt: number): void {
  if (v.aboard !== null) return;
  if (v.task && !taskValid(state, v, v.task)) {
    const auto = v.task.kind === "harvest" ? v.task.auto : undefined;
    if (v.task.kind === "harvest") {
      const n = state.entities.get(v.task.nodeId);
      if (n?.type === "node" && n.claimedBy === v.id) {
        n.claimedBy = null;
        markDirty(state, n.id);
      }
    }
    const carrying = v.carrying;
    const staffed = auto !== undefined && state.entities.get(auto);
    if (staffed && staffed.type === "building" && staffed.workerId === v.id) {
      v.task = { kind: "staff", buildingId: auto! };
      v.action = "idle";
      v.path = [];
    } else {
      releaseTask(state, v);
    }
    v.carrying = carrying;
  }

  // Full hands, or holding something the current job doesn't produce: go and drop it off.
  if (v.carrying && v.action !== "deliver") {
    const t = v.task;
    const node = t?.kind === "harvest" ? state.entities.get(t.nodeId) : undefined;
    const sameGoods = node?.type === "node" && NODES[node.kind].resource === v.carrying.resource;
    if (v.carrying.amount >= VILLAGER.carry || !sameGoods) {
      if (!startDelivery(state, v)) {
        v.action = "idle";
        v.retryAt = state.time + 2;
      }
    }
  }

  switch (v.action) {
    case "walk":
    case "deliver": {
      if (!stepAlong(state, v, dt)) return;
      if (v.action === "deliver") finishDelivery(state, v);
      else arrive(state, v);
      return;
    }
    case "work":
      work(state, v, dt);
      return;
    case "idle":
      if (state.time < v.retryAt) return;
      if (!v.task) {
        findJob(state, v);
        if (!v.task) {
          wander(state, v);
          return;
        }
      }
      planRoute(state, v);
      return;
  }
}

function setFacing(v: VillagerEntity, dx: number, dy: number): void {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
  if (Math.abs(dx) >= Math.abs(dy)) v.facing = dx > 0 ? 0 : 2;
  else v.facing = dy > 0 ? 1 : 3;
}

/** Advance along the path. Returns true on arrival; replans (idle) if the way is blocked. */
function stepAlong(state: GameState, v: VillagerEntity, dt: number): boolean {
  const here = tileOf(v);
  let budget =
    VILLAGER.speed * dt * (isPathTile(state, here.x, here.y) ? VILLAGER.pathSpeedBonus : 1);
  while (budget > 1e-6 && v.path.length > 0) {
    const next = v.path[0]!;
    if (!walkable(state, next.x, next.y)) {
      v.path = [];
      v.action = "idle";
      markDirty(state, v.id);
      return false;
    }
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dx = tx - v.x;
    const dy = ty - v.y;
    const dist = Math.hypot(dx, dy);
    setFacing(v, dx, dy);
    if (dist <= budget) {
      v.x = tx;
      v.y = ty;
      budget -= dist;
      v.path.shift();
      reveal(state, v.x, v.y, VILLAGER.reveal);
    } else {
      v.x += (dx / dist) * budget;
      v.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  markDirty(state, v.id);
  return v.path.length === 0;
}

function faceTowards(v: VillagerEntity, x: number, y: number): void {
  setFacing(v, x - v.x, y - v.y);
}

function arrive(state: GameState, v: VillagerEntity): void {
  const t = v.task;
  v.action = "idle";
  if (!t) return;
  const here = tileOf(v);
  if (t.kind === "move") {
    v.task = null;
    markDirty(state, v.id);
    return;
  }
  if (t.kind === "board") {
    const ship = state.entities.get(t.shipId);
    const beside =
      ship?.type === "ship" &&
      shoreBeside(state, ship).some((p) => p.x === here.x && p.y === here.y);
    if (ship?.type === "ship" && beside && hasRoom(ship)) embark(state, v, ship);
    return;
  }
  if (t.kind === "harvest") {
    const n = state.entities.get(t.nodeId) as NodeEntity;
    if (!isAdjacentTo(here.x, here.y, n.x, n.y)) return;
    v.action = "work";
    v.tool = NODES[n.kind].tool;
    faceTowards(v, n.x + 0.5, n.y + 0.5);
  } else {
    const b = state.entities.get(t.buildingId) as BuildingEntity;
    if (!isAdjacentTo(here.x, here.y, b.x, b.y, b.w, b.h)) return;
    const job = BUILDINGS[b.kind].worker?.job;
    if (t.kind === "staff" && !stationaryJob(job)) {
      // Nothing in range yet: wait by the camp and look again shortly.
      v.retryAt = state.time + 3;
      markDirty(state, v.id);
      return;
    }
    v.action = "work";
    v.tool = t.kind === "build" || job === "smith" ? "hammer" : job === "farm" ? "hoe" : null;
    faceTowards(v, b.x + b.w / 2, b.y + b.h / 2);
  }
  v.workTimer = 0;
  markDirty(state, v.id);
}

function work(state: GameState, v: VillagerEntity, dt: number): void {
  const t = v.task;
  if (!t) {
    v.action = "idle";
    return;
  }
  if (t.kind === "harvest") {
    const n = state.entities.get(t.nodeId) as NodeEntity;
    const def = NODES[n.kind];
    const seconds = harvestSeconds(n.kind, state.world.tribe);
    v.workTimer += dt;
    if (v.workTimer < seconds) return;
    v.workTimer -= seconds;
    n.amount -= 1;
    v.carrying = { resource: def.resource, amount: (v.carrying?.amount ?? 0) + 1 };
    markDirty(state, v.id);
    markDirty(state, n.id);
    if (n.amount <= 0) depleteNode(state, n);
    return;
  }
  if (t.kind === "build") {
    const b = state.entities.get(t.buildingId) as BuildingEntity;
    b.progress = Math.min(1, b.progress + dt / Math.max(0.5, BUILDINGS[b.kind].work));
    markDirty(state, b.id);
    if (b.progress >= 1) {
      completeBuilding(state, b);
      releaseTask(state, v);
    }
    return;
  }
  // Staffing a farm, forge or church: the building produces while the worker is here.
}

function nearestDropOff(state: GameState, v: VillagerEntity): BuildingEntity[] {
  const list: { b: BuildingEntity; d: number }[] = [];
  for (const e of state.entities.values()) {
    if (e.type !== "building" || !e.complete || !BUILDINGS[e.kind].dropOff) continue;
    if (!sameIsland(state, v, e.x, e.y)) continue;
    list.push({ b: e, d: Math.hypot(e.x + e.w / 2 - v.x, e.y + e.h / 2 - v.y) });
  }
  return list.sort((a, b) => a.d - b.d).map((x) => x.b);
}

function startDelivery(state: GameState, v: VillagerEntity): boolean {
  const here = tileOf(v);
  for (const b of nearestDropOff(state, v).slice(0, 3)) {
    if (isAdjacentTo(here.x, here.y, b.x, b.y, b.w, b.h)) {
      v.path = [];
      v.action = "deliver";
      return true;
    }
    const path = landPath(state, here, buildingAround(state, b));
    if (path) {
      v.path = path;
      v.action = "deliver";
      markDirty(state, v.id);
      return true;
    }
  }
  return false;
}

function finishDelivery(state: GameState, v: VillagerEntity): void {
  if (v.carrying) {
    state.stock[v.carrying.resource] += v.carrying.amount;
    state.stockDirty = true;
    v.carrying = null;
  }
  v.action = "idle";
  markDirty(state, v.id);
}

function builders(state: GameState, b: BuildingEntity): number {
  let n = 0;
  for (const e of state.entities.values())
    if (e.type === "villager" && e.task?.kind === "build" && e.task.buildingId === b.id) n++;
  return n;
}

function sameIsland(state: GameState, v: VillagerEntity, x: number, y: number): boolean {
  const w = state.world;
  const here = tileOf(v);
  return w.island[tileIndex(w, here.x, here.y)] === w.island[tileIndex(w, x, y)];
}

/** Idle villagers pick up work: construction first, then staffing, then marked resources. */
function findJob(state: GameState, v: VillagerEntity): void {
  let best: { task: Task; prio: number; d: number } | null = null;
  const consider = (task: Task, prio: number, x: number, y: number) => {
    const d = Math.hypot(x - v.x, y - v.y);
    if (!best || prio < best.prio || (prio === best.prio && d < best.d)) best = { task, prio, d };
  };
  for (const e of state.entities.values()) {
    if (e.type === "building") {
      if (!sameIsland(state, v, e.x, e.y)) continue;
      if (!e.complete && builders(state, e) < VILLAGER.maxBuildersPerSite) {
        consider({ kind: "build", buildingId: e.id }, 0, e.x + e.w / 2, e.y + e.h / 2);
      } else if (e.complete && BUILDINGS[e.kind].worker && e.workerId === null) {
        consider({ kind: "staff", buildingId: e.id }, 1, e.x + e.w / 2, e.y + e.h / 2);
      }
    } else if (e.type === "node" && e.marked && e.stage === "grown" && e.claimedBy === null) {
      if ((state.unreachable.get(e.id) ?? 0) > state.time) continue;
      if (!sameIsland(state, v, e.x, e.y)) continue;
      consider({ kind: "harvest", nodeId: e.id }, 2, e.x + 0.5, e.y + 0.5);
    }
  }
  const chosen = best as { task: Task } | null;
  if (!chosen) return;
  const task = chosen.task;
  if (task.kind === "harvest") (state.entities.get(task.nodeId) as NodeEntity).claimedBy = v.id;
  if (task.kind === "staff") {
    const b = state.entities.get(task.buildingId) as BuildingEntity;
    b.workerId = v.id;
    markDirty(state, b.id);
  }
  v.task = task;
  markDirty(state, v.id);
}

/** A worker at a camp, quarry or mine picks the nearest suitable node within its radius. */
function autoHarvestTarget(state: GameState, b: BuildingEntity): NodeEntity | null {
  const def = BUILDINGS[b.kind].worker;
  const wanted = def ? GATHER_JOBS[def.job] : undefined;
  if (!def || !wanted) return null;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let best: NodeEntity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.type !== "node" || e.stage !== "grown" || e.claimedBy !== null) continue;
    if (!wanted.includes(NODES[e.kind].resource)) continue;
    if ((state.unreachable.get(e.id) ?? 0) > state.time) continue;
    const d = Math.hypot(e.x + 0.5 - cx, e.y + 0.5 - cy);
    if (d <= def.radius && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function planRoute(state: GameState, v: VillagerEntity): void {
  const t = v.task!;
  const here = tileOf(v);
  let goals: Tile[];
  if (t.kind === "staff") {
    const b = state.entities.get(t.buildingId) as BuildingEntity;
    const target = autoHarvestTarget(state, b);
    if (target) {
      target.claimedBy = v.id;
      markDirty(state, target.id);
      v.task = { kind: "harvest", nodeId: target.id, auto: b.id };
      goals = tilesAround(state, target.x, target.y);
    } else {
      if (
        !stationaryJob(BUILDINGS[b.kind].worker?.job) &&
        isAdjacentTo(here.x, here.y, b.x, b.y, b.w, b.h)
      ) {
        v.retryAt = state.time + 3;
        return;
      }
      goals = buildingAround(state, b);
    }
  } else if (t.kind === "harvest") {
    const n = state.entities.get(t.nodeId) as NodeEntity;
    goals = tilesAround(state, n.x, n.y);
  } else if (t.kind === "build") {
    const b = state.entities.get(t.buildingId) as BuildingEntity;
    goals = buildingAround(state, b);
  } else if (t.kind === "board") {
    goals = shoreBeside(state, state.entities.get(t.shipId) as ShipEntity);
  } else {
    goals = [{ x: t.x, y: t.y }];
  }
  if (goals.some((g) => g.x === here.x && g.y === here.y)) {
    v.path = [];
    arrive(state, v);
    return;
  }
  const path = goals.length > 0 ? landPath(state, here, goals) : null;
  if (!path) {
    const current = v.task;
    if (current?.kind === "harvest") state.unreachable.set(current.nodeId, state.time + 30);
    const auto = current?.kind === "harvest" ? current.auto : undefined;
    releaseTask(state, v);
    if (auto !== undefined) {
      const b = state.entities.get(auto);
      if (b?.type === "building" && b.workerId === null) {
        b.workerId = v.id;
        v.task = { kind: "staff", buildingId: auto };
      }
    }
    v.retryAt = state.time + 1.5;
    return;
  }
  v.path = path;
  v.action = "walk";
  markDirty(state, v.id);
}

/** Idle villagers amble around a little so the settlement feels alive. */
function wander(state: GameState, v: VillagerEntity): void {
  const r = hash2d(v.id, state.tick, 0x51ed);
  v.retryAt = state.time + 2 + r * 4;
  if (r < 0.5) return;
  const here = tileOf(v);
  const dx = Math.floor(hash2d(v.id, state.tick, 0x51ee) * 5) - 2;
  const dy = Math.floor(hash2d(v.id, state.tick, 0x51ef) * 5) - 2;
  const tx = here.x + dx;
  const ty = here.y + dy;
  if ((dx === 0 && dy === 0) || !walkable(state, tx, ty)) return;
  const path = landPath(state, here, [{ x: tx, y: ty }]);
  if (!path || path.length > 5) return;
  v.task = { kind: "move", x: tx, y: ty };
  v.path = path;
  v.action = "walk";
  markDirty(state, v.id);
}

// ---------------------------------------------------------------------------------------------
// Ships

function updateShip(state: GameState, s: ShipEntity, dt: number): void {
  if (s.path.length === 0) return;
  let budget = shipSpeed(state.world.tribe) * dt;
  while (budget > 1e-6 && s.path.length > 0) {
    const next = s.path[0]!;
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dx = tx - s.x;
    const dy = ty - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) s.heading = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    if (dist <= budget) {
      s.x = tx;
      s.y = ty;
      budget -= dist;
      s.path.shift();
      reveal(state, s.x, s.y, SHIP.reveal);
    } else {
      s.x += (dx / dist) * budget;
      s.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  if (s.path.length === 0) {
    s.dest = null;
    if (s.unload) {
      s.unload = false;
      disembark(state, s);
    }
  }
  markDirty(state, s.id);
}

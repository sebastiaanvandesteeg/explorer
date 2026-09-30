// One fixed simulation step: production queues, farms, regrowth, villager jobs and ships.
import { hash2d } from "../rng";
import { tileIndex } from "../world/grid";
import type { Tile } from "../world/pathfind";
import {
  BUILDING_REVEAL,
  BUILDINGS,
  CARGO,
  CHARACTER,
  LIGHTHOUSE,
  CHURCH,
  FARM,
  farmRate,
  GATHER_JOBS,
  harvestSeconds,
  NODES,
  REGROW,
  SALVAGE_SECONDS,
  SHIP,
  shipSpeed,
  SMITH,
  smithSeconds,
  TICK_SECONDS,
  VILLAGER,
  type WorkerJob,
} from "./catalogue";
import { releaseTask } from "./commands";
import { collectFetched } from "./inventory";
import { faceTowards, stepAlong, tileOf } from "./walk";
import { greatWorkStages } from "./greatwork";
import { assignBuilders, pickJob, rebalance, takeJob } from "./jobs";
import { collectWreck, updateThreats } from "./pirates";
import { stormOnRoute, updateWeather } from "./weather";
import { disembark, dockSpawn, embark, hasRoom, shipMoving, shoreBeside } from "./ferry";
import { landPath, sailable, seaPath } from "./navigation";
import { buildingAround, isAdjacentTo, tilesAround } from "./rules";
import {
  addEntity,
  addGoods,
  islandAt,
  lookAround,
  markDirty,
  newShip,
  newVillager,
  population,
  populationCap,
  removeEntity,
  reveal,
  sailSpeedFactor,
  shipReveal,
  cargoCapacity,
  stockOf,
  tally,
  touchStock,
  walkable,
  type BuildingEntity,
  type CharacterEntity,
  type GameState,
  type NodeEntity,
  type ShipEntity,
  type Task,
  type VillagerEntity,
  type WreckEntity,
} from "./state";

export function tick(state: GameState, dt = TICK_SECONDS): void {
  state.time += dt;
  state.tick++;
  const all = [...state.entities.values()];
  for (const e of all) {
    if (e.type === "building") updateBuilding(state, e, dt);
    else if (e.type === "node" && e.stage !== "grown") updateNode(state, e, dt);
  }
  if (state.mode === "adventure") {
    // Nobody commands the villagers here: they raise what needs raising and share out the jobs.
    assignBuilders(state);
    rebalance(state);
  }
  for (const e of all) {
    if (!state.entities.has(e.id)) continue;
    if (e.type === "villager") updateVillager(state, e, dt);
    else if (e.type === "character") updateCharacter(state, e, dt);
    else if (e.type === "ship") updateShip(state, e, dt);
  }
  updateThreats(state, dt);
  updateWeather(state, dt);
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
          lookAround(state, v.x, v.y, VILLAGER.reveal);
          state.events.push({ type: "villager", x: spot.x, y: spot.y });
          b.queue.shift();
        }
      } else if (job.what !== "villager") {
        const at = shipSpawn(b);
        if (sailable(state, Math.floor(at.x), Math.floor(at.y))) {
          const ship = newShip(
            state,
            job.what === "cargo" ? "cargo" : job.what === "patrol" ? "patrol" : "scout",
            at.x,
            at.y,
            { "+x": 0, "+y": 2, "-x": 4, "-y": 6 }[b.dir ?? "+x"],
          );
          addEntity(state, ship);
          lookAround(state, ship.x, ship.y, shipReveal(state));
          state.events.push({ type: "ship", kind: ship.kind, x: ship.x, y: ship.y });
          b.queue.shift();
        }
      }
    }
  }
  if (b.workerId === null) return;
  const v = state.entities.get(b.workerId);
  const tending = v?.type === "villager" && v.action === "work" && v.task?.kind === "staff";
  if (!tending) return;
  const island = islandAt(state, b.x, b.y);
  const stock = stockOf(state, island);
  if (b.kind === "farm") {
    const stageBefore = farmStage(b);
    b.growth += dt * farmRate(state.world.tribe);
    if (b.growth >= FARM.cycle) {
      b.growth = 0;
      stock.food += FARM.yield;
      touchStock(state, island);
    }
    if (farmStage(b) !== stageBefore) markDirty(state, b.id);
  } else if (b.kind === "blacksmith") {
    // The forge only burns while there is ore to work.
    if (stock.ore < SMITH.ore) return;
    b.growth += dt;
    if (b.growth >= smithSeconds(state.world.tribe)) {
      b.growth = 0;
      stock.ore -= SMITH.ore;
      stock.tools += SMITH.tools;
      touchStock(state, island);
      markDirty(state, b.id);
    }
  } else if (b.kind === "church") {
    b.growth += dt;
    if (b.growth >= CHURCH.seconds) {
      b.growth = 0;
      stock.faith += CHURCH.faith;
      touchStock(state, island);
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
export const shipSpawn = dockSpawn;

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

/** Builder-seconds the current construction of a building needs. */
export function workFor(state: GameState, b: BuildingEntity): number {
  if (b.kind !== "great_work") return BUILDINGS[b.kind].work;
  return greatWorkStages(state.world)[b.stage ?? 0]?.work ?? BUILDINGS[b.kind].work;
}

export function completeBuilding(state: GameState, b: BuildingEntity): void {
  b.complete = true;
  b.progress = 1;
  markDirty(state, b.id);
  reveal(
    state,
    b.x + b.w / 2,
    b.y + b.h / 2,
    b.kind === "lighthouse" ? LIGHTHOUSE.reveal : BUILDING_REVEAL,
  );
  if (b.kind !== "great_work") {
    state.events.push({ type: "built", kind: b.kind, x: b.x, y: b.y });
    return;
  }
  b.stage = (b.stage ?? 0) + 1;
  const final = b.stage >= greatWorkStages(state.world).length;
  state.events.push({ type: "wonder", stage: b.stage, final });
  if (final) {
    state.stats.wonderAt = state.time;
    state.statsDirty = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Characters

/** A player's character only walks where its player sent it. */
function updateCharacter(state: GameState, c: CharacterEntity, dt: number): void {
  collectFetched(state, c);
  if (c.action !== "walk") {
    if (c.dest) {
      c.dest = null;
      markDirty(state, c.id);
    }
    return;
  }
  if (!stepAlong(state, c, dt, CHARACTER.speed, CHARACTER.reveal)) {
    collectFetched(state, c);
    return;
  }
  c.action = "idle";
  c.dest = null;
  collectFetched(state, c);
}

// ---------------------------------------------------------------------------------------------
// Villagers

function taskValid(state: GameState, v: VillagerEntity, t: Task): boolean {
  switch (t.kind) {
    case "harvest": {
      const n = state.entities.get(t.nodeId);
      return (
        n?.type === "node" &&
        n.stage === "grown" &&
        n.amount > 0 &&
        (n.marked || t.auto !== undefined || (state.mode === "adventure" && n.claimedBy === v.id))
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
    case "loot": {
      const w = state.entities.get(t.wreckId);
      return w?.type === "wreck" && w.kind === "skeleton";
    }
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
  if (t.kind === "loot") {
    const w = state.entities.get(t.wreckId) as WreckEntity;
    const on = here.x === w.x && here.y === w.y;
    if (!on && !isAdjacentTo(here.x, here.y, w.x, w.y)) return;
    v.action = "work";
    v.tool = null;
    v.workTimer = 0;
    faceTowards(v, w.x + 0.5, w.y + 0.5);
    markDirty(state, v.id);
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
  if (t.kind === "loot") {
    const w = state.entities.get(t.wreckId) as WreckEntity;
    v.workTimer += dt;
    if (v.workTimer >= SALVAGE_SECONDS) {
      collectWreck(state, w);
      releaseTask(state, v);
    }
    return;
  }
  if (t.kind === "build") {
    const b = state.entities.get(t.buildingId) as BuildingEntity;
    b.progress = Math.min(1, b.progress + dt / Math.max(0.5, workFor(state, b)));
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
    // Goods go into the pile of the island the villager stands on.
    const here = tileOf(v);
    addGoods(state, islandAt(state, here.x, here.y), v.carrying.resource, v.carrying.amount);
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
  if (state.mode === "adventure") return findJobByBalance(state, v);
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

/**
 * Adventure worlds: a building site that still wants builders comes first; after that, whichever
 * job the settlement has the fewest workers on for its needs.
 */
function findJobByBalance(state: GameState, v: VillagerEntity): void {
  let site: { b: BuildingEntity; d: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "building" || e.complete || !sameIsland(state, v, e.x, e.y)) continue;
    if (builders(state, e) >= VILLAGER.maxBuildersPerSite) continue;
    const d = Math.hypot(e.x + e.w / 2 - v.x, e.y + e.h / 2 - v.y);
    if (!site || d < site.d) site = { b: e, d };
  }
  if (site) {
    v.task = { kind: "build", buildingId: site.b.id };
    markDirty(state, v.id);
    return;
  }
  const offer = pickJob(state, v);
  if (offer) takeJob(state, v, offer);
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
  } else if (t.kind === "loot") {
    const w = state.entities.get(t.wreckId) as WreckEntity;
    goals = [{ x: w.x, y: w.y }, ...tilesAround(state, w.x, w.y)];
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
  if (s.path.length === 0) {
    if (s.kind === "cargo" && s.route !== null) runRoute(state, s);
    return;
  }
  let budget = shipSpeed(state.world.tribe, s.kind) * sailSpeedFactor(state) * dt;
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
      lookAround(state, s.x, s.y, shipReveal(state));
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

// ---------------------------------------------------------------------------------------------
// Trade routes

const dockAt = (state: GameState, id: number | null): BuildingEntity | null => {
  const b = id === null ? undefined : state.entities.get(id);
  return b?.type === "building" && b.kind === "dock" && b.complete ? b : null;
};

/** The completed dock on the home island nearest to another dock: where cargo goes ashore. */
export function homeDockFor(state: GameState, from: BuildingEntity): BuildingEntity | null {
  const home = state.world.start.islandId;
  let best: BuildingEntity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.type !== "building" || e.kind !== "dock" || !e.complete) continue;
    if (islandAt(state, e.x, e.y) !== home) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

export function cargoLoad(s: ShipEntity): number {
  let n = 0;
  for (const v of Object.values(s.cargo)) n += v ?? 0;
  return n;
}

/**
 * A cargo ship shuttles between the dock it collects from (on another island) and a dock on the
 * home island: it waits for goods, loads what the outpost has stored, sails home and unloads.
 */
function runRoute(state: GameState, s: ShipEntity): void {
  if (state.time < s.waitUntil) return;
  const pickup = dockAt(state, s.route);
  const home = pickup ? homeDockFor(state, pickup) : null;
  if (!pickup) {
    s.route = null;
    s.leg = null;
    markDirty(state, s.id);
    return;
  }
  const rest = (seconds: number) => {
    s.waitUntil = state.time + seconds;
    markDirty(state, s.id);
  };
  if (!home) return rest(5);
  if (s.leg === null) s.leg = cargoLoad(s) > 0 ? "drop" : "pickup";
  const dock = s.leg === "pickup" ? pickup : home;
  const spot = dockSpawn(dock);
  const tile = { x: Math.floor(spot.x), y: Math.floor(spot.y) };
  if (Math.hypot(s.x - spot.x, s.y - spot.y) > 1.5) {
    // Wait in port while a storm sits on the way.
    if (stormOnRoute(state, s, spot)) return rest(4);
    const path = sailable(state, tile.x, tile.y)
      ? seaPath(state, { x: Math.floor(s.x), y: Math.floor(s.y) }, tile)
      : null;
    if (!path) return rest(5);
    s.path = path;
    s.dest = tile;
    markDirty(state, s.id);
    return;
  }
  const island = islandAt(state, pickup.x, pickup.y);
  if (s.leg === "pickup") {
    const pile = stockOf(state, island);
    let room = cargoCapacity(state) - cargoLoad(s);
    const available = Object.values(pile).reduce((a, b) => a + b, 0);
    if (available < Math.min(CARGO.minLoad, room)) return rest(2);
    for (const r of Object.keys(pile) as (keyof typeof pile)[]) {
      const take = Math.min(pile[r], room);
      if (take <= 0) continue;
      pile[r] -= take;
      s.cargo[r] = (s.cargo[r] ?? 0) + take;
      room -= take;
    }
    touchStock(state, island);
    s.leg = "drop";
    return rest(1);
  }
  let delivered = 0;
  for (const r of Object.keys(s.cargo) as (keyof typeof s.cargo)[]) {
    const n = s.cargo[r] ?? 0;
    if (n <= 0) continue;
    addGoods(state, islandAt(state, home.x, home.y), r, n);
    delivered += n;
  }
  s.cargo = {};
  s.leg = "pickup";
  if (delivered > 0) {
    tally(state, "hauled", delivered);
    state.events.push({ type: "cargo", amount: delivered, x: spot.x, y: spot.y });
  }
  rest(1);
}

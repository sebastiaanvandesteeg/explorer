import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import type { BiomeId } from "../world/biomes";
import { Terrain, type Dir, type NodeKind, type WorldMap } from "../world/types";
import {
  BUILDINGS,
  NODES,
  START_STOCK,
  START_VILLAGERS,
  type BuildingKind,
  type Resource,
  type Stock,
  type Tool,
} from "./catalogue";

export interface BuildingEntity {
  id: number;
  type: "building";
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Construction progress 0..1. */
  progress: number;
  complete: boolean;
  dir?: Dir;
  /** Production queue (town hall trains villagers, docks build ships). */
  queue: { what: "villager" | "ship"; remaining: number }[];
  /** Villager staffing a workplace (camps, quarry, mine, farm, blacksmith, church). */
  workerId: number | null;
  /** Production timer in seconds (farm growth, forging, prayer). */
  growth: number;
}

export type NodeStage = "grown" | "stump" | "sapling" | "bare";

export interface NodeEntity {
  id: number;
  type: "node";
  kind: NodeKind;
  x: number;
  y: number;
  variant: number;
  amount: number;
  stage: NodeStage;
  /** Seconds until the next regrowth stage. */
  timer: number;
  marked: boolean;
  claimedBy: number | null;
}

export type Task =
  | { kind: "harvest"; nodeId: number; auto?: number }
  | { kind: "build"; buildingId: number }
  | { kind: "staff"; buildingId: number }
  | { kind: "move"; x: number; y: number }
  | { kind: "board"; shipId: number };

export type VillagerAction = "idle" | "walk" | "deliver" | "work";

export interface VillagerEntity {
  id: number;
  type: "villager";
  /** Continuous world position (tile centre = integer + 0.5). */
  x: number;
  y: number;
  tunic: number;
  facing: 0 | 1 | 2 | 3;
  action: VillagerAction;
  task: Task | null;
  path: { x: number; y: number }[];
  carrying: { resource: Resource; amount: number } | null;
  workTimer: number;
  tool: Tool | null;
  /** Earliest time this villager looks for work again after failing to find any. */
  retryAt: number;
  /** Ship carrying this villager, or null when on land. */
  aboard: number | null;
}

export interface ShipEntity {
  id: number;
  type: "ship";
  x: number;
  y: number;
  heading: number;
  path: { x: number; y: number }[];
  dest: { x: number; y: number } | null;
  /** Villagers on board. */
  passengers: number[];
  /** Put the passengers ashore when the ship arrives. */
  unload: boolean;
}

export type Entity = BuildingEntity | NodeEntity | VillagerEntity | ShipEntity;

export type GameEvent =
  | { type: "built"; kind: BuildingKind; x: number; y: number }
  | { type: "villager"; x: number; y: number }
  | { type: "ship"; x: number; y: number }
  | { type: "discovered"; islandId: number; biome: BiomeId; x: number; y: number }
  | { type: "landed"; count: number; islandId: number; x: number; y: number };

export interface GameState {
  world: WorldMap;
  time: number;
  tick: number;
  nextId: number;
  stock: Stock;
  entities: Map<number, Entity>;
  /** 1 when a tile has been seen by anyone in the co-op team. */
  explored: Uint8Array;
  discovered: Set<number>;
  /** Id of the building or resource node on a tile (0 = none). Derived; never serialised. */
  occupancy: Int32Array;
  /** Nodes whose path search failed, and until when to skip them. Derived. */
  unreachable: Map<number, number>;
  // Change tracking for network patches.
  dirty: Set<number>;
  removed: Set<number>;
  revealed: number[];
  stockDirty: boolean;
  events: GameEvent[];
}

export function markDirty(state: GameState, id: number): void {
  state.dirty.add(id);
}

export function addEntity<E extends Entity>(state: GameState, e: E): E {
  state.entities.set(e.id, e);
  occupy(state, e, true);
  state.dirty.add(e.id);
  state.removed.delete(e.id);
  return e;
}

export function removeEntity(state: GameState, id: number): void {
  const e = state.entities.get(id);
  if (!e) return;
  occupy(state, e, false);
  state.entities.delete(id);
  state.dirty.delete(id);
  state.removed.add(id);
}

/** Buildings occupy their footprint; nodes their tile. Villagers and ships never do. */
export function occupy(state: GameState, e: Entity, on: boolean): void {
  const w = state.world;
  if (e.type === "building") {
    for (let y = e.y; y < e.y + e.h; y++)
      for (let x = e.x; x < e.x + e.w; x++) {
        if (!inBounds(w, x, y)) continue;
        const k = tileIndex(w, x, y);
        if (on) state.occupancy[k] = e.id;
        else if (state.occupancy[k] === e.id) state.occupancy[k] = 0;
      }
  } else if (e.type === "node") {
    const k = tileIndex(w, e.x, e.y);
    if (on) state.occupancy[k] = e.id;
    else if (state.occupancy[k] === e.id) state.occupancy[k] = 0;
  }
}

export function rebuildOccupancy(state: GameState): void {
  state.occupancy.fill(0);
  for (const e of state.entities.values()) occupy(state, e, true);
}

export function emptyState(world: WorldMap): GameState {
  const n = world.width * world.height;
  return {
    world,
    time: 0,
    tick: 0,
    nextId: 1,
    stock: { ...START_STOCK },
    entities: new Map(),
    explored: new Uint8Array(n),
    discovered: new Set(),
    occupancy: new Int32Array(n),
    unreachable: new Map(),
    dirty: new Set(),
    removed: new Set(),
    revealed: [],
    stockDirty: true,
    events: [],
  };
}

export function newBuilding(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
  complete: boolean,
  dir?: Dir,
): BuildingEntity {
  const [w, h] = BUILDINGS[kind].size;
  const alongX = dir === "+x" || dir === "-x";
  return {
    id: state.nextId++,
    type: "building",
    kind,
    x,
    y,
    w: kind === "dock" && alongX ? h : w,
    h: kind === "dock" && alongX ? w : h,
    progress: complete ? 1 : 0,
    complete,
    ...(dir ? { dir } : {}),
    queue: [],
    workerId: null,
    growth: 0,
  };
}

export function newVillager(state: GameState, x: number, y: number): VillagerEntity {
  const id = state.nextId++;
  return {
    id,
    type: "villager",
    x: x + 0.5,
    y: y + 0.5,
    tunic: id % 3,
    facing: 1,
    action: "idle",
    task: null,
    path: [],
    carrying: null,
    workTimer: 0,
    tool: null,
    retryAt: 0,
    aboard: null,
  };
}

export function createInitialState(world: WorldMap): GameState {
  const state = emptyState(world);
  const s = world.start;
  addEntity(state, newBuilding(state, "town_hall", s.townHall.x, s.townHall.y, true));
  addEntity(state, newBuilding(state, "dock", s.dock.x, s.dock.y, true, s.dock.dir));
  for (const n of world.nodes) {
    addEntity(state, {
      id: state.nextId++,
      type: "node",
      kind: n.kind,
      x: n.x,
      y: n.y,
      variant: n.variant,
      amount: NODES[n.kind].amount,
      stage: "grown",
      timer: 0,
      marked: false,
      claimedBy: null,
    } satisfies NodeEntity);
  }
  for (let i = 0; i < START_VILLAGERS; i++) {
    const t = s.spawn[i % s.spawn.length]!;
    addEntity(state, newVillager(state, t.x, t.y));
  }
  // The home island and the water around it start explored.
  for (let k = 0; k < state.explored.length; k++) {
    if (world.island[k] === s.islandId && world.shore[k]! <= 4) state.explored[k] = 1;
  }
  state.discovered.add(s.islandId);
  // New joiners get full snapshots, so the creation itself isn't a change to broadcast.
  state.revealed = [];
  state.dirty.clear();
  state.stockDirty = false;
  return state;
}

/** Reveal a circle of tiles; newly explored tiles are queued for the next patch. */
export function reveal(state: GameState, cx: number, cy: number, r: number): void {
  const w = state.world;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(w.height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const k = tileIndex(w, x, y);
      if (state.explored[k]) continue;
      state.explored[k] = 1;
      state.revealed.push(k);
      const island = w.island[k]!;
      if (island >= 0 && isLandTerrain(w.terrain[k]!) && !state.discovered.has(island)) {
        state.discovered.add(island);
        const info = w.islands[island]!;
        state.events.push({ type: "discovered", islandId: island, biome: info.biome, x, y });
      }
    }
  }
}

/** Is a tile free for villagers to stand on? Piers count, even though they're over water. */
export function walkable(state: GameState, x: number, y: number): boolean {
  const w = state.world;
  if (!inBounds(w, x, y)) return false;
  const k = tileIndex(w, x, y);
  const id = state.occupancy[k]!;
  const e = id === 0 ? undefined : state.entities.get(id);
  if (e?.type === "building") return !!BUILDINGS[e.kind].walkable && e.complete;
  if (!isLandTerrain(w.terrain[k]!)) return false;
  if (e?.type === "node") return e.stage === "stump" || e.stage === "sapling";
  return true;
}

/** Island a villager (or anything) stands on, following piers back to their island. */
export function islandAt(state: GameState, x: number, y: number): number {
  const w = state.world;
  return inBounds(w, x, y) ? w.island[tileIndex(w, x, y)]! : -1;
}

/** Islands where the team has a foothold: a villager ashore or a building. */
export function settledIslands(state: GameState): Set<number> {
  const out = new Set<number>([state.world.start.islandId]);
  for (const e of state.entities.values()) {
    if (e.type === "villager" && e.aboard === null)
      out.add(islandAt(state, Math.floor(e.x), Math.floor(e.y)));
    else if (e.type === "building") out.add(islandAt(state, e.x, e.y));
  }
  out.delete(-1);
  return out;
}

export function isPathTile(state: GameState, x: number, y: number): boolean {
  const w = state.world;
  const k = tileIndex(w, x, y);
  if (w.terrain[k] === Terrain.Dirt) return true;
  const e = state.entities.get(state.occupancy[k]!);
  return e?.type === "building" && e.kind === "path" && e.complete;
}

export function populationCap(state: GameState): number {
  let cap = 0;
  for (const e of state.entities.values()) {
    if (e.type === "building" && e.complete) cap += BUILDINGS[e.kind].popCap ?? 0;
  }
  return cap;
}

export function population(state: GameState): number {
  let n = 0;
  for (const e of state.entities.values()) if (e.type === "villager") n++;
  return n;
}

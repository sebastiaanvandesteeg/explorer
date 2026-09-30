import { TRIBE_DEFS } from "../tribes";
import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import { hash2d } from "../rng";
import { DIFFICULTY_DEFS, type Difficulty } from "./difficulty";
import { scatterLoot } from "./inventory";
import type { ItemKind, ItemStack } from "./items";
import { sightFactor } from "./light";
import type { BiomeId } from "../world/biomes";
import { Terrain, type Dir, type NodeKind, type SiteKind, type WorldMap } from "../world/types";
import {
  BUILDINGS,
  CARGO,
  NODES,
  PIRATE,
  RESOURCES,
  SHIP,
  SHIP_HP,
  START_STOCK,
  START_VILLAGERS,
  WEATHER,
  type BuildingKind,
  type Resource,
  type ShipKind,
  type Stock,
  type Tool,
  type UpgradeId,
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
  queue: { what: "villager" | "ship" | "cargo" | "patrol"; remaining: number }[];
  /** Villager staffing a workplace (camps, quarry, mine, farm, blacksmith, church). */
  workerId: number | null;
  /** The Great Work: how many of its stages are finished. */
  stage?: number;
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
  | { kind: "board"; shipId: number }
  | { kind: "loot"; wreckId: number };

export type VillagerAction = "idle" | "walk" | "deliver" | "work";

/** What villagers and player characters share: a person who walks about on land. */
export interface Walker {
  id: number;
  /** Continuous world position (tile centre = integer + 0.5). */
  x: number;
  y: number;
  tunic: number;
  facing: 0 | 1 | 2 | 3;
  action: VillagerAction;
  path: { x: number; y: number }[];
  carrying: { resource: Resource; amount: number } | null;
  tool: Tool | null;
  /** Ship carrying this person, or null when on land. */
  aboard: number | null;
}

export interface VillagerEntity extends Walker {
  type: "villager";
  task: Task | null;
  workTimer: number;
  /** Earliest time this villager looks for work again after failing to find any. */
  retryAt: number;
}

/**
 * A player's own character, in adventure worlds. One per player slot: it keeps its place when the
 * player leaves and is there again when they come back. Nothing orders it about but its player.
 */
export interface CharacterEntity extends Walker {
  type: "character";
  /** The player slot that controls this character (see `PlayerInfo.id`). */
  playerId: string;
  /** What this player carries: their own, never shared with the team's stock. */
  pack: ItemStack[];
  /** An item on the ground this character is walking over to pick up. */
  fetch: number | null;
  /** Where the current walk ends, or null when standing still. */
  dest: { x: number; y: number } | null;
  /** The building this character is inside (its room is drawn instead of the island), or null. */
  inside: number | null;
  /** Where they stand in that room, in room tiles. */
  room: { x: number; y: number };
  /** Room walk in progress (planning state, not sent over the wire). */
  rpath: { x: number; y: number }[];
  /** A building this character is walking over to go into. */
  enter: number | null;
}

/** Something lying on the ground, on land, for anyone to pick up. */
export interface ItemEntity {
  id: number;
  type: "item";
  kind: ItemKind;
  amount: number;
  /** The tile it lies on. */
  x: number;
  y: number;
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
  /** Scouts explore and ferry villagers; cargo ships haul goods along a trade route. */
  kind: ShipKind;
  /** Cargo ships: the dock (on another island) this ship collects goods from, or null. */
  route: number | null;
  /** Cargo ships: which end of the route the ship is heading for. */
  leg: "pickup" | "drop" | null;
  /** Goods on board (cargo ships). */
  cargo: Partial<Stock>;
  /** Cargo ships wait at a dock until this time before trying again. */
  waitUntil: number;
  hp: number;
  /** Seconds until the guns can fire again. */
  cooldown: number;
  /** Patrol boats: chasing a pirate on their own rather than following an order. */
  hunt: boolean;
  /** Salvaging a shipwreck: the wreck and the seconds of work left. */
  salvage: { wreckId: number; remaining: number } | null;
  /** Divers over a sunken site: the site and the seconds left in the water. */
  dive: { siteId: number; remaining: number } | null;
}

export type PiratePhase = "hunt" | "raid" | "flee";

/** A raiding ship: it hunts your fleet or beaches at a settlement to rob its stockpile. */
export interface PirateEntity {
  id: number;
  type: "pirate";
  x: number;
  y: number;
  heading: number;
  hp: number;
  path: { x: number; y: number }[];
  phase: PiratePhase;
  /** The ship being hunted, or the building being raided. */
  target: number | null;
  /** Seconds left in the current phase (looting) or until the next replan. */
  timer: number;
  cooldown: number;
  /** Goods stolen so far. */
  loot: Partial<Stock>;
  /** Where it came from and where it flees to. */
  home: { x: number; y: number };
}

/** What a sunk ship or defeated pirate leaves behind: a shipwreck at sea or bones ashore. */
export interface WreckEntity {
  id: number;
  type: "wreck";
  kind: "shipwreck" | "skeleton";
  x: number;
  y: number;
  variant: number;
  loot: Partial<Stock>;
}

/** How the expedition is going, for the chronicle shown when the Great Work is complete. */
export interface Stats {
  /** Pirate ships sunk, our ships lost, and raids that reached a settlement. */
  pirates: number;
  shipsLost: number;
  raids: number;
  /** Goods cargo ships have brought home. */
  hauled: number;
  /** Wrecks looted and sunken sites dived. */
  salvaged: number;
  storms: number;
  /** Game time the Great Work was finished, or null. */
  wonderAt: number | null;
}

export const emptyStats = (): Stats => ({
  pirates: 0,
  shipsLost: 0,
  raids: 0,
  hauled: 0,
  salvaged: 0,
  storms: 0,
  wonderAt: null,
});

/** A storm front: it drifts across the sea and hurts ships outside harbour. */
export interface StormEntity {
  id: number;
  type: "storm";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Seconds since it formed, and how long it lasts. */
  age: number;
  life: number;
}

/** Sunken ruins and fortresses: unseen until a ship sails over them. */
export interface SiteEntity {
  id: number;
  type: "site";
  kind: SiteKind;
  x: number;
  y: number;
  variant: number;
  found: boolean;
  /** Treasure still on the sea floor. */
  loot: Partial<Stock>;
}

export type Entity =
  | BuildingEntity
  | NodeEntity
  | VillagerEntity
  | CharacterEntity
  | ItemEntity
  | ShipEntity
  | PirateEntity
  | WreckEntity
  | SiteEntity
  | StormEntity;

export type GameEvent =
  | { type: "built"; kind: BuildingKind; x: number; y: number }
  | { type: "villager"; x: number; y: number }
  | { type: "ship"; kind?: ShipKind; x: number; y: number }
  | { type: "discovered"; islandId: number; biome: BiomeId; x: number; y: number }
  | { type: "landed"; count: number; islandId: number; x: number; y: number }
  | { type: "cargo"; amount: number; x: number; y: number }
  | { type: "upgrade"; upgrade: UpgradeId }
  | { type: "pirates"; count: number; x: number; y: number }
  | { type: "robbed"; islandId: number; x: number; y: number }
  | { type: "sunk"; kind: ShipKind | "pirate"; x: number; y: number }
  | {
      type: "shot";
      kind: "cannon" | "bolt";
      from: { x: number; y: number };
      to: { x: number; y: number };
    }
  | { type: "storm"; x: number; y: number }
  | { type: "wonder"; stage: number; final: boolean }
  | { type: "found"; site: SiteKind; x: number; y: number }
  | {
      type: "item";
      playerId: string;
      what: "picked" | "dropped" | "full";
      kind: ItemKind;
      amount: number;
    }
  | { type: "salvaged"; what: string; goods: Partial<Stock>; x: number; y: number };

export interface GameState {
  world: WorldMap;
  /** How hostile the world is; fixed when it is created. */
  difficulty: Difficulty;
  time: number;
  tick: number;
  nextId: number;
  /** Goods stored on the home island: what building, training and trading spend. */
  stock: Stock;
  /** Goods piled up on other islands' storehouses and docks until a cargo ship collects them. */
  outposts: Map<number, Stock>;
  /** Magical upgrades bought at the magic house. */
  upgrades: Set<UpgradeId>;
  upgradesDirty: boolean;
  /** Game time of the next pirate raid, and of the next lightning strike. */
  nextRaid: number;
  nextBolt: number;
  /** Game time the next storm forms. */
  nextStorm: number;
  stats: Stats;
  statsDirty: boolean;
  /** Outpost islands whose stockpile changed since the last patch. */
  outpostsDirty: Set<number>;
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

export function emptyState(world: WorldMap, difficulty: Difficulty = "normal"): GameState {
  const n = world.width * world.height;
  return {
    world,
    difficulty,
    time: 0,
    tick: 0,
    nextId: 1,
    stock: { ...START_STOCK },
    outposts: new Map(),
    outpostsDirty: new Set(),
    upgrades: new Set(TRIBE_DEFS[world.tribe].innate),
    upgradesDirty: false,
    nextRaid: DIFFICULTY_DEFS[difficulty].firstRaid,
    nextBolt: 0,
    nextStorm: WEATHER.first,
    stats: emptyStats(),
    statsDirty: false,
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
    ...(kind === "great_work" ? { stage: 0 } : {}),
  };
}

export const hasUpgrade = (state: GameState, id: UpgradeId): boolean => state.upgrades.has(id);

/** How far ships see around them, in tiles. */
export function shipReveal(state: GameState): number {
  return SHIP.reveal * (hasUpgrade(state, "far_sight") ? 1.6 : 1);
}

/** Hull points of a pirate ship in this world. */
export function pirateMaxHp(state: GameState): number {
  return Math.round(PIRATE.hp * DIFFICULTY_DEFS[state.difficulty].pirateHp);
}

export function shipMaxHp(state: GameState, kind: ShipKind): number {
  return Math.round(SHIP_HP[kind] * (hasUpgrade(state, "iron_hulls") ? 1.5 : 1));
}

export function sailSpeedFactor(state: GameState): number {
  return hasUpgrade(state, "swift_sails") ? 1.5 : 1;
}

export function cargoCapacity(state: GameState): number {
  return Math.round(CARGO.capacity * (hasUpgrade(state, "deep_holds") ? 1.5 : 1));
}

export function emptyStock(): Stock {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Stock;
}

/** The stockpile of an island: the shared treasury at home, a local pile everywhere else. */
export function stockOf(state: GameState, islandId: number): Stock {
  if (islandId === state.world.start.islandId || islandId < 0) return state.stock;
  let s = state.outposts.get(islandId);
  if (!s) {
    s = emptyStock();
    state.outposts.set(islandId, s);
  }
  return s;
}

/** Record that an island's stockpile changed so it goes out with the next patch. */
/** Count something for the chronicle. */
export function tally(state: GameState, key: Exclude<keyof Stats, "wonderAt">, n = 1): void {
  state.stats[key] += n;
  state.statsDirty = true;
}

export function touchStock(state: GameState, islandId: number): void {
  if (islandId === state.world.start.islandId || islandId < 0) state.stockDirty = true;
  else state.outpostsDirty.add(islandId);
}

export function addGoods(state: GameState, islandId: number, r: Resource, n: number): void {
  stockOf(state, islandId)[r] += n;
  touchStock(state, islandId);
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

export function newShip(
  state: GameState,
  kind: ShipKind,
  x: number,
  y: number,
  heading: number,
): ShipEntity {
  return {
    id: state.nextId++,
    type: "ship",
    x,
    y,
    heading,
    path: [],
    dest: null,
    passengers: [],
    unload: false,
    kind,
    route: null,
    leg: null,
    cargo: {},
    waitUntil: 0,
    hp: shipMaxHp(state, kind),
    cooldown: 0,
    hunt: false,
    salvage: null,
    dive: null,
  };
}

/** What lies on the sea floor: pre-rolled from the site's position so it is the same everywhere. */
export function siteLoot(kind: SiteKind, x: number, y: number): Partial<Stock> {
  const roll = (salt: number) => hash2d(x, y, salt);
  if (kind === "fortress") {
    return {
      gold: 90 + Math.floor(roll(1) * 60),
      crystal: 6 + Math.floor(roll(2) * 8),
      relic: 3 + Math.floor(roll(3) * 3),
      tools: 6 + Math.floor(roll(4) * 8),
    };
  }
  return {
    gold: 25 + Math.floor(roll(1) * 30),
    stone: 10 + Math.floor(roll(2) * 15),
    ...(roll(3) < 0.4 ? { relic: 1 } : {}),
  };
}

export function addSites(state: GameState): void {
  for (const site of state.world.sites) {
    addEntity(state, {
      id: state.nextId++,
      type: "site",
      kind: site.kind,
      x: site.x,
      y: site.y,
      variant: site.variant,
      found: false,
      loot: siteLoot(site.kind, site.x, site.y),
    } satisfies SiteEntity);
  }
}

export function createInitialState(
  world: WorldMap,
  opts: { difficulty?: Difficulty } = {},
): GameState {
  const state = emptyState(world, opts.difficulty);
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
  addSites(state);
  scatterLoot(state);
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

/** Look around from a spot: like `reveal`, but a villager or ship sees less of the sea at night. */
export function lookAround(state: GameState, x: number, y: number, r: number): void {
  reveal(state, x, y, r * sightFactor(state, x, y));
}

/** Mark the centre of every island as seen, so the whole archipelago shows on the map. */
export function revealIslands(state: GameState): void {
  const before = state.events.length;
  for (const island of state.world.islands) reveal(state, island.cx, island.cy, 3);
  // Charting the islands isn't the same as finding them: no fanfare for each one.
  state.events.length = before;
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

/** Islands where the team has a foothold: a villager or character ashore, or a building. */
export function settledIslands(state: GameState): Set<number> {
  const out = new Set<number>([state.world.start.islandId]);
  for (const e of state.entities.values()) {
    if ((e.type === "villager" || e.type === "character") && e.aboard === null)
      out.add(islandAt(state, Math.floor(e.x), Math.floor(e.y)));
    else if (e.type === "building") out.add(islandAt(state, e.x, e.y));
  }
  out.delete(-1);
  return out;
}

/**
 * Somewhere the team is: one point for each island it has buildings on (the first one built) and
 * one for every ship. Pirates and storms form around these, so they find you wherever you are.
 * `r` in [0, 1) picks one.
 */
export function presenceAt(state: GameState, r: number): { x: number; y: number } {
  const points: { x: number; y: number }[] = [];
  const islands = new Set<number>();
  for (const e of state.entities.values()) {
    if (e.type === "building") {
      const island = islandAt(state, e.x, e.y);
      if (islands.has(island)) continue;
      islands.add(island);
      points.push({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
    } else if (e.type === "ship") points.push({ x: e.x, y: e.y });
  }
  if (points.length === 0) {
    const hall = state.world.start.townHall;
    return { x: hall.x + 1.5, y: hall.y + 1.5 };
  }
  return points[Math.min(points.length - 1, Math.floor(r * points.length))]!;
}

/** A point `min`..`max` tiles from `at` in a direction picked by `angle` (0..1), kept on the map. */
export function ringPoint(
  world: { width: number; height: number },
  at: { x: number; y: number },
  min: number,
  max: number,
  angle: number,
  reach: number,
): { x: number; y: number } {
  const a = angle * Math.PI * 2;
  const d = min + reach * (max - min);
  return {
    x: Math.min(world.width - 4, Math.max(3, at.x + Math.cos(a) * d)),
    y: Math.min(world.height - 4, Math.max(3, at.y + Math.sin(a) * d)),
  };
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

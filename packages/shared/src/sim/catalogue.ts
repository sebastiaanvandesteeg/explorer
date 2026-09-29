import { TRIBE_DEFS, type TribeId } from "../tribes";
import type { NodeKind } from "../world/types";

export const RESOURCES = [
  "wood",
  "stone",
  "food",
  "ore",
  "tools",
  "gold",
  "faith",
  "crystal",
] as const;
export type Resource = (typeof RESOURCES)[number];
export type Stock = Record<Resource, number>;

export type BuildingKind =
  | "town_hall"
  | "dock"
  | "house"
  | "storehouse"
  | "farm"
  | "lumber_camp"
  | "quarry"
  | "mine"
  | "blacksmith"
  | "market"
  | "church"
  | "magic_house"
  | "path";

/** Gatherers roam a radius around their workplace; the others work at the building itself. */
export type WorkerJob = "lumber" | "quarry" | "mine" | "farm" | "smith" | "priest";
export const GATHER_JOBS: Partial<Record<WorkerJob, readonly Resource[]>> = {
  lumber: ["wood"],
  quarry: ["stone"],
  mine: ["ore", "gold", "crystal"],
};

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  description: string;
  size: [number, number];
  cost: Partial<Stock>;
  /** Builder-seconds of construction work. */
  work: number;
  /** Appears in the build menu. */
  buildable: boolean;
  popCap?: number;
  dropOff?: boolean;
  worker?: { job: WorkerJob; radius: number };
  /** Villagers walk over it (and faster on paths). */
  walkable?: boolean;
  hotkey?: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  town_hall: {
    kind: "town_hall",
    name: "Town Hall",
    description: "Heart of the settlement. Stores goods and trains villagers.",
    size: [3, 3],
    cost: {},
    work: 0,
    buildable: false,
    popCap: 5,
    dropOff: true,
  },
  dock: {
    kind: "dock",
    name: "Dock",
    description: "Builds scout ships. Villagers can walk out on the pier to board.",
    size: [2, 3],
    cost: {},
    work: 0,
    buildable: false,
    walkable: true,
  },
  house: {
    kind: "house",
    name: "House",
    description: "Room for four more villagers.",
    size: [2, 2],
    cost: { wood: 20, stone: 5 },
    work: 12,
    buildable: true,
    popCap: 4,
    hotkey: "1",
  },
  storehouse: {
    kind: "storehouse",
    name: "Storehouse",
    description: "A closer place to drop off goods. Build one first when settling a new island.",
    size: [2, 2],
    cost: { wood: 30 },
    work: 10,
    buildable: true,
    dropOff: true,
    hotkey: "2",
  },
  farm: {
    kind: "farm",
    name: "Farm",
    description: "One worker grows wheat for a steady supply of food.",
    size: [3, 3],
    cost: { wood: 20 },
    work: 14,
    buildable: true,
    worker: { job: "farm", radius: 0 },
    hotkey: "3",
  },
  lumber_camp: {
    kind: "lumber_camp",
    name: "Lumber Camp",
    description: "One worker fells nearby trees automatically.",
    size: [2, 2],
    cost: { wood: 25, stone: 5 },
    work: 12,
    buildable: true,
    dropOff: true,
    worker: { job: "lumber", radius: 8 },
    hotkey: "4",
  },
  quarry: {
    kind: "quarry",
    name: "Quarry",
    description: "One worker breaks nearby rocks for stone automatically.",
    size: [2, 2],
    cost: { wood: 30 },
    work: 12,
    buildable: true,
    dropOff: true,
    worker: { job: "quarry", radius: 8 },
    hotkey: "5",
  },
  mine: {
    kind: "mine",
    name: "Mine",
    description: "One worker digs ore, gold and crystals from nearby deposits.",
    size: [2, 2],
    cost: { wood: 30, stone: 15 },
    work: 14,
    buildable: true,
    dropOff: true,
    worker: { job: "mine", radius: 10 },
    hotkey: "6",
  },
  blacksmith: {
    kind: "blacksmith",
    name: "Blacksmith",
    description: "A smith forges 2 ore into 1 set of tools. Tools raise advanced buildings.",
    size: [2, 2],
    cost: { wood: 30, stone: 25 },
    work: 16,
    buildable: true,
    worker: { job: "smith", radius: 0 },
    hotkey: "7",
  },
  market: {
    kind: "market",
    name: "Market",
    description: "Trade goods for gold, and gold for goods.",
    size: [3, 2],
    cost: { wood: 40, stone: 20, tools: 5 },
    work: 18,
    buildable: true,
    hotkey: "8",
  },
  church: {
    kind: "church",
    name: "Church",
    description: "A priest gathers faith from the settlement.",
    size: [2, 3],
    cost: { wood: 50, stone: 40, tools: 10 },
    work: 24,
    buildable: true,
    worker: { job: "priest", radius: 0 },
    hotkey: "9",
  },
  magic_house: {
    kind: "magic_house",
    name: "Magic House",
    description: "Where magical upgrades for exploring the seas will be sold.",
    size: [2, 2],
    cost: { wood: 40, stone: 30, tools: 10, gold: 20 },
    work: 24,
    buildable: true,
    hotkey: "0",
  },
  path: {
    kind: "path",
    name: "Path",
    description: "Villagers walk faster on paths.",
    size: [1, 1],
    cost: { stone: 1 },
    work: 1,
    buildable: true,
    walkable: true,
    hotkey: "p",
  },
};

export type Tool = "axe" | "pick" | "hammer" | "hoe";

export interface NodeDef {
  resource: Resource;
  amount: number;
  secondsPerUnit: number;
  /** What happens when emptied: trees leave stumps, bushes go bare, rocks vanish. */
  depletes: "stump" | "bare" | "gone";
  tool: Tool | null;
  name: string;
}

const tree = (name: string, amount: number, secondsPerUnit: number): NodeDef => ({
  resource: "wood",
  amount,
  secondsPerUnit,
  depletes: "stump",
  tool: "axe",
  name,
});
const food = (name: string, amount: number, secondsPerUnit = 1): NodeDef => ({
  resource: "food",
  amount,
  secondsPerUnit,
  depletes: "bare",
  tool: null,
  name,
});
const rock = (
  name: string,
  resource: Resource,
  amount: number,
  secondsPerUnit: number,
): NodeDef => ({
  resource,
  amount,
  secondsPerUnit,
  depletes: "gone",
  tool: "pick",
  name,
});

export const NODES: Record<NodeKind, NodeDef> = {
  oak: tree("Oak tree", 10, 1.2),
  pine: tree("Pine tree", 8, 1.0),
  fruit: food("Fruit tree", 8),
  berry: food("Berry bush", 6),
  boulder: rock("Boulder", "stone", 12, 1.6),
  ore: rock("Iron ore", "ore", 16, 1.8),
  palm: tree("Palm tree", 8, 1.1),
  cactus: food("Cactus fruit", 6),
  sandstone: rock("Sandstone", "stone", 14, 1.5),
  gold_vein: rock("Gold vein", "gold", 10, 2.0),
  charred_tree: tree("Charred tree", 6, 0.9),
  ember_fruit: food("Ember fruit", 6, 1.2),
  obsidian: rock("Obsidian", "stone", 16, 1.8),
  hellstone: rock("Hellstone ore", "ore", 24, 1.8),
  snow_pine: tree("Snowy pine", 8, 1.0),
  frost_berry: food("Frost berries", 6),
  ice_rock: rock("Ice rock", "stone", 12, 1.4),
  jungle_tree: tree("Jungle tree", 14, 1.4),
  banana: food("Banana plant", 8),
  willow: tree("Swamp willow", 10, 1.2),
  swamp_shroom: food("Bog mushrooms", 6),
  bog_ore: rock("Bog iron", "ore", 14, 1.6),
  giant_mushroom: tree("Giant mushroom", 10, 1.1),
  glowshroom: food("Glowshrooms", 6),
  silver_tree: tree("Silverleaf tree", 8, 1.2),
  crystal: rock("Crystal cluster", "crystal", 8, 2.0),
  autumn_tree: tree("Amber tree", 10, 1.2),
  pumpkin: food("Pumpkin patch", 10, 1.2),
  blossom_tree: tree("Blossom tree", 10, 1.2),
  flower_bush: food("Honey blossoms", 6),
};

export const START_STOCK: Stock = {
  wood: 50,
  stone: 30,
  food: 40,
  ore: 0,
  tools: 0,
  gold: 0,
  faith: 0,
  crystal: 0,
};
export const START_VILLAGERS = 3;

export const VILLAGER = {
  speed: 2.2,
  pathSpeedBonus: 1.5,
  carry: 5,
  trainCost: { food: 20 } as Partial<Stock>,
  trainSeconds: 10,
  maxBuildersPerSite: 3,
  reveal: 5,
};

export const SHIP = {
  cost: { wood: 40 } as Partial<Stock>,
  buildSeconds: 20,
  speed: 4,
  reveal: 8,
  max: 3,
  capacity: 4,
};

export const REGROW = {
  stumpToSapling: 90,
  saplingToTree: 150,
  bareToRipe: 90,
};

export const FARM = {
  /** Seconds of tended growth per harvest; the field shows three stages along the way. */
  cycle: 30,
  yield: 6,
};

export const SMITH = { seconds: 8, ore: 2, tools: 1 };
export const CHURCH = { seconds: 5, faith: 1 };

/** Gold paid or asked per lot at the market. Buying costs twice the selling price. */
export const MARKET_LOT = 10;
export const MARKET_PRICES: Partial<Record<Resource, number>> = {
  wood: 4,
  stone: 5,
  food: 4,
  ore: 8,
  tools: 15,
  crystal: 25,
};
export const MARKET_BUYABLE: readonly Resource[] = ["wood", "stone", "food", "ore"];

export const BUILDING_REVEAL = 6;
export const MAX_PLAYERS = 8;
export const TICK_SECONDS = 0.1;

export function canAfford(stock: Stock, cost: Partial<Stock>): boolean {
  return Object.entries(cost).every(([r, n]) => stock[r as Resource] >= (n ?? 0));
}

export function spend(stock: Stock, cost: Partial<Stock>): void {
  for (const [r, n] of Object.entries(cost)) stock[r as Resource] -= n ?? 0;
}

export function refund(stock: Stock, cost: Partial<Stock>, fraction = 1): void {
  for (const [r, n] of Object.entries(cost))
    stock[r as Resource] += Math.floor((n ?? 0) * fraction);
}

// ---------------------------------------------------------------------------------------------
// Tribe bonuses

const BONUS = 1.3;

/** Seconds a villager of this tribe needs per unit gathered from a node. */
export function harvestSeconds(kind: NodeKind, tribe: TribeId): number {
  const def = NODES[kind];
  const bonus = TRIBE_DEFS[tribe].bonus;
  const boosted =
    (bonus === "woodcutting" && def.resource === "wood") ||
    (bonus === "mining" && def.resource !== "wood" && def.resource !== "food") ||
    (bonus === "harvest" && def.resource === "food");
  return def.secondsPerUnit / (boosted ? BONUS : 1);
}

export function farmRate(tribe: TribeId): number {
  return TRIBE_DEFS[tribe].bonus === "harvest" ? BONUS : 1;
}

export function shipCost(tribe: TribeId): Partial<Stock> {
  if (TRIBE_DEFS[tribe].bonus !== "sailing") return SHIP.cost;
  return Object.fromEntries(
    Object.entries(SHIP.cost).map(([r, n]) => [r, Math.round((n ?? 0) * 0.75)]),
  );
}

export function shipSpeed(tribe: TribeId): number {
  return SHIP.speed * (TRIBE_DEFS[tribe].bonus === "sailing" ? 1.25 : 1);
}

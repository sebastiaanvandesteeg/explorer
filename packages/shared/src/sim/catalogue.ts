import type { NodeKind } from "../world/types";

export type Resource = "wood" | "stone" | "food";
export const RESOURCES: readonly Resource[] = ["wood", "stone", "food"];
export type Stock = Record<Resource, number>;

export type BuildingKind =
  "town_hall" | "dock" | "house" | "storehouse" | "lumber_camp" | "quarry" | "farm" | "path";

export type WorkerJob = "lumber" | "quarry" | "farm";

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
  /** Villagers walk over it (and faster). */
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
    description: "Builds scout ships to explore the seas.",
    size: [2, 3],
    cost: {},
    work: 0,
    buildable: false,
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
    description: "A closer place to drop off goods.",
    size: [2, 2],
    cost: { wood: 30 },
    work: 10,
    buildable: true,
    dropOff: true,
    hotkey: "2",
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
    hotkey: "3",
  },
  quarry: {
    kind: "quarry",
    name: "Quarry",
    description: "One worker breaks nearby rocks automatically.",
    size: [2, 2],
    cost: { wood: 30 },
    work: 12,
    buildable: true,
    dropOff: true,
    worker: { job: "quarry", radius: 8 },
    hotkey: "4",
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
    hotkey: "5",
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
    hotkey: "6",
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
}

export const NODES: Record<NodeKind, NodeDef> = {
  oak: { resource: "wood", amount: 10, secondsPerUnit: 1.2, depletes: "stump", tool: "axe" },
  pine: { resource: "wood", amount: 8, secondsPerUnit: 1.0, depletes: "stump", tool: "axe" },
  fruit: { resource: "food", amount: 8, secondsPerUnit: 1.0, depletes: "bare", tool: null },
  berry: { resource: "food", amount: 6, secondsPerUnit: 1.0, depletes: "bare", tool: null },
  boulder: { resource: "stone", amount: 12, secondsPerUnit: 1.6, depletes: "gone", tool: "pick" },
  ore: { resource: "stone", amount: 25, secondsPerUnit: 1.8, depletes: "gone", tool: "pick" },
};

export const START_STOCK: Stock = { wood: 50, stone: 30, food: 40 };
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

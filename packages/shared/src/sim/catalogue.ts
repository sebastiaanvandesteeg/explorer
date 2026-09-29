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
  "relic",
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
  | "lighthouse"
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
    description:
      "Builds scout and cargo ships. Villagers can walk out on the pier to board. Docks on other islands are where cargo ships collect goods.",
    size: [2, 3],
    cost: { wood: 60, stone: 20 },
    work: 16,
    buildable: true,
    walkable: true,
    hotkey: "b",
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
    description:
      "Sells magical upgrades for the seas: faster ships, wider sight and wards for the far biomes.",
    size: [2, 2],
    cost: { wood: 40, stone: 30, tools: 10, gold: 20 },
    work: 24,
    buildable: true,
    hotkey: "0",
  },
  lighthouse: {
    kind: "lighthouse",
    name: "Lighthouse",
    description:
      "Its beam lights the sea at night for miles: raiders can be seen coming, ships keep their sight and patrol boats keep hunting in the dark.",
    size: [2, 2],
    cost: { wood: 60, stone: 60, tools: 10 },
    work: 22,
    buildable: true,
    hotkey: "l",
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
  relic: 0,
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

/** Cargo ships haul an island's stockpile home along a trade route between two docks. */
export const CARGO = {
  cost: { wood: 60, stone: 10 } as Partial<Stock>,
  buildSeconds: 30,
  /** Goods carried per trip. */
  capacity: 40,
  max: 4,
  /** Sails slower than a scout. */
  speedFactor: 0.8,
  /** A ship waits at the dock until at least this many goods are waiting (or it can fill up). */
  minLoad: 5,
};

export type ShipKind = "scout" | "cargo" | "patrol";

/** Hit points of a ship, before Iron Hulls. */
export const SHIP_HP: Record<ShipKind, number> = { scout: 30, cargo: 45, patrol: 70 };

/** Warships: they hunt pirates on their own whenever they are not sailing somewhere. */
export const PATROL = {
  cost: { wood: 80, tools: 10 } as Partial<Stock>,
  buildSeconds: 35,
  max: 3,
  speedFactor: 1.1,
  /** Pirates within this distance are chased down. */
  engage: 18,
};

/** Ship guns: patrol boats always have cannons, other ships once the Cannons upgrade is bought. */
export const GUNS: Record<ShipKind, { damage: number; range: number; cooldown: number } | null> = {
  patrol: { damage: 9, range: 6, cooldown: 2 },
  scout: { damage: 5, range: 5, cooldown: 2.5 },
  cargo: { damage: 3, range: 4, cooldown: 3 },
};

/** Pirate raids: ships that hunt your fleet, or beach at a settlement and rob its stockpile. */
export const PIRATE = {
  hp: 36,
  damage: 4,
  range: 4.5,
  cooldown: 2.5,
  speed: 3.2,
  /** Seconds spent looting a beached settlement, and the share of each pile taken per second. */
  raidSeconds: 8,
  stealShare: 0.04,
  /** A raider only spawns this far from the town hall. See DIFFICULTY_DEFS for the timings. */
  spawnDistance: 45,
};

/** The Stormcaller spell: lightning at pirates near your ships and buildings. */
export const STORMCALLER = { interval: 6, damage: 14, range: 16 };

/** What night does. Darkness at or above `dark` hides things outside the light; raids wait for `raid`. */
export const NIGHT = { dark: 0.5, raid: 0.3, sightLoss: 0.4 };

/** How far, in tiles, each thing keeps watch around itself: by day, and after dark. */
export const WATCH = {
  building: 14,
  ship: 10,
  litBuilding: 6,
  litShip: 4,
  /** The lighthouse's beam: day and night alike. */
  lighthouse: 24,
};

export const LIGHTHOUSE = { reveal: 16 };

/** Storms: they roll across the sea and batter any ship caught outside a harbour. */
export const WEATHER = {
  first: 240,
  interval: [200, 320] as const,
  radius: [7, 11] as const,
  life: [110, 170] as const,
  speed: 1.4,
  /** Hull points lost per second at full strength. */
  damage: 1.6,
  /** A ship this close to a finished dock is in harbour and safe. */
  harbour: 4,
  /** Seconds a storm takes to build up and to blow out. */
  ramp: 15,
};

export const DIVE = {
  seconds: 15,
  /** Share of a site's remaining treasure each diver brings up per dive. */
  share: 0.3,
  /** Sites are found by sailing this close. */
  discover: 3,
  reach: 2.2,
};

export const SALVAGE_SECONDS = 4;

export type UpgradeId =
  | "far_sight"
  | "swift_sails"
  | "deep_holds"
  | "seers_chart"
  | "ember_ward"
  | "prism_ward"
  | "storm_bolt"
  | "calm_waters"
  | "cannons"
  | "iron_hulls";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  cost: Partial<Stock>;
  /** Where it is sold: the magic house for spells, the dock for ship fittings. */
  at: "magic_house" | "dock";
}

/** Upgrades are learned once, for the whole team. */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  far_sight: {
    id: "far_sight",
    name: "Far Sight",
    description: "Ships reveal 60% more of the sea around them",
    cost: { faith: 25, gold: 20 },
    at: "magic_house",
  },
  swift_sails: {
    id: "swift_sails",
    name: "Swift Sails",
    description: "All ships sail 50% faster",
    cost: { faith: 40, gold: 30 },
    at: "magic_house",
  },
  ember_ward: {
    id: "ember_ward",
    name: "Ember Ward",
    description:
      "Protects villagers from the fires of the Infernal Isles, so they can settle there",
    cost: { faith: 50, gold: 40 },
    at: "magic_house",
  },
  prism_ward: {
    id: "prism_ward",
    name: "Prism Ward",
    description: "Attunes villagers to the Crystal Spires, so they can settle there",
    cost: { faith: 50, gold: 40 },
    at: "magic_house",
  },
  deep_holds: {
    id: "deep_holds",
    name: "Deep Holds",
    description: "Cargo ships carry 50% more goods",
    cost: { gold: 40, crystal: 5 },
    at: "magic_house",
  },
  seers_chart: {
    id: "seers_chart",
    name: "Seer's Chart",
    description: "Marks the position of every island on the map",
    cost: { faith: 60, crystal: 10 },
    at: "magic_house",
  },
  storm_bolt: {
    id: "storm_bolt",
    name: "Stormcaller",
    description: "Lightning strikes pirates that come near your settlements and ships",
    cost: { faith: 60, gold: 40, relic: 3 },
    at: "magic_house",
  },
  calm_waters: {
    id: "calm_waters",
    name: "Calm Waters",
    description: "Storms cannot hurt your ships",
    cost: { faith: 40, gold: 30 },
    at: "magic_house",
  },
  cannons: {
    id: "cannons",
    name: "Cannons",
    description: "Every ship gets guns and fires on pirates in range",
    cost: { wood: 60, tools: 10 },
    at: "dock",
  },
  iron_hulls: {
    id: "iron_hulls",
    name: "Iron Hulls",
    description: "Ships take 50% more damage before they sink",
    cost: { wood: 40, stone: 30, tools: 15 },
    at: "dock",
  },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Biomes that villagers can only settle once the matching ward has been bought. */
export const WARDED_BIOMES: Partial<Record<string, UpgradeId>> = {
  infernal: "ember_ward",
  crystal: "prism_ward",
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

export function shipSpeed(tribe: TribeId, kind: ShipKind = "scout"): number {
  const base = SHIP.speed * (TRIBE_DEFS[tribe].bonus === "sailing" ? 1.25 : 1);
  return kind === "cargo"
    ? base * CARGO.speedFactor
    : kind === "patrol"
      ? base * PATROL.speedFactor
      : base;
}

export function cargoCost(tribe: TribeId): Partial<Stock> {
  if (TRIBE_DEFS[tribe].bonus !== "sailing") return CARGO.cost;
  return Object.fromEntries(
    Object.entries(CARGO.cost).map(([r, n]) => [r, Math.round((n ?? 0) * 0.75)]),
  );
}

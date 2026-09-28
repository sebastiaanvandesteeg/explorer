// Biomes give every island its own terrain, plants, resources and (client side) atmosphere.
// Tiers control distance from home: gentle biomes nearby, hostile and magical ones far away.
import type { NodeKind } from "./types";

export const BIOMES = [
  "temperate",
  "desert",
  "infernal",
  "tundra",
  "jungle",
  "swamp",
  "fungal",
  "crystal",
  "autumn",
  "blossom",
] as const;
export type BiomeId = (typeof BIOMES)[number];

/** Index stored in the per-tile biome map; 255 means open ocean. */
export const NO_BIOME = 255;

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** How it's announced: "Discovered <article> <name>!" */
  article: string;
  tier: 0 | 1 | 2;
  /** Trees (weighted by repetition), food plants, the local stone and mineable deposits. */
  trees: NodeKind[];
  food: NodeKind[];
  stone: NodeKind;
  deposits: NodeKind[];
  /** Tree chance inside dense clusters, and chances on open ground. */
  cluster: number;
  scatter: { tree: number; food: number; stone: number; deposit: number };
  /** Share of an island's plateau that is bare stony ground. */
  rocky: number;
}

export const BIOME_DEFS: Record<BiomeId, BiomeDef> = {
  temperate: {
    id: "temperate",
    name: "Greenlands",
    article: "the",
    tier: 0,
    trees: ["oak", "oak", "pine"],
    food: ["berry", "fruit"],
    stone: "boulder",
    deposits: ["ore"],
    cluster: 0.42,
    scatter: { tree: 0.035, food: 0.025, stone: 0.012, deposit: 0.004 },
    rocky: 0.08,
  },
  desert: {
    id: "desert",
    name: "Sunscorch Dunes",
    article: "the",
    tier: 1,
    trees: ["palm"],
    food: ["cactus"],
    stone: "sandstone",
    deposits: ["gold_vein", "ore"],
    cluster: 0.22,
    scatter: { tree: 0.015, food: 0.03, stone: 0.025, deposit: 0.012 },
    rocky: 0.22,
  },
  infernal: {
    id: "infernal",
    name: "Infernal Isles",
    article: "the",
    tier: 2,
    trees: ["charred_tree"],
    food: ["ember_fruit"],
    stone: "obsidian",
    deposits: ["hellstone"],
    cluster: 0.2,
    scatter: { tree: 0.02, food: 0.008, stone: 0.03, deposit: 0.02 },
    rocky: 0.45,
  },
  tundra: {
    id: "tundra",
    name: "Frostreach",
    article: "",
    tier: 1,
    trees: ["snow_pine"],
    food: ["frost_berry"],
    stone: "ice_rock",
    deposits: ["ore"],
    cluster: 0.4,
    scatter: { tree: 0.03, food: 0.018, stone: 0.02, deposit: 0.006 },
    rocky: 0.18,
  },
  jungle: {
    id: "jungle",
    name: "Verdant Wilds",
    article: "the",
    tier: 0,
    trees: ["jungle_tree", "jungle_tree", "palm"],
    food: ["banana"],
    stone: "boulder",
    deposits: ["ore"],
    cluster: 0.6,
    scatter: { tree: 0.06, food: 0.03, stone: 0.008, deposit: 0.003 },
    rocky: 0.04,
  },
  swamp: {
    id: "swamp",
    name: "Murkmire",
    article: "",
    tier: 1,
    trees: ["willow"],
    food: ["swamp_shroom"],
    stone: "boulder",
    deposits: ["bog_ore"],
    cluster: 0.35,
    scatter: { tree: 0.03, food: 0.035, stone: 0.008, deposit: 0.012 },
    rocky: 0.06,
  },
  fungal: {
    id: "fungal",
    name: "Fungal Hollows",
    article: "the",
    tier: 1,
    trees: ["giant_mushroom"],
    food: ["glowshroom"],
    stone: "boulder",
    deposits: ["ore"],
    cluster: 0.38,
    scatter: { tree: 0.03, food: 0.04, stone: 0.01, deposit: 0.006 },
    rocky: 0.1,
  },
  crystal: {
    id: "crystal",
    name: "Crystal Spires",
    article: "the",
    tier: 2,
    trees: ["silver_tree"],
    food: ["berry"],
    stone: "boulder",
    deposits: ["crystal", "crystal", "ore"],
    cluster: 0.25,
    scatter: { tree: 0.02, food: 0.01, stone: 0.015, deposit: 0.03 },
    rocky: 0.35,
  },
  autumn: {
    id: "autumn",
    name: "Amberwood",
    article: "",
    tier: 0,
    trees: ["autumn_tree", "autumn_tree", "oak"],
    food: ["pumpkin", "fruit"],
    stone: "boulder",
    deposits: ["ore"],
    cluster: 0.45,
    scatter: { tree: 0.035, food: 0.03, stone: 0.012, deposit: 0.004 },
    rocky: 0.08,
  },
  blossom: {
    id: "blossom",
    name: "Petal Isles",
    article: "the",
    tier: 0,
    trees: ["blossom_tree", "blossom_tree", "oak"],
    food: ["flower_bush", "fruit"],
    stone: "boulder",
    deposits: ["ore"],
    cluster: 0.4,
    scatter: { tree: 0.03, food: 0.035, stone: 0.01, deposit: 0.004 },
    rocky: 0.06,
  },
};

export function biomeIndex(id: BiomeId): number {
  return BIOMES.indexOf(id);
}

export function biomeAt(index: number): BiomeId | null {
  return index === NO_BIOME ? null : (BIOMES[index] ?? null);
}

export function discoveryName(id: BiomeId): string {
  const d = BIOME_DEFS[id];
  return d.article ? `${d.article} ${d.name}` : d.name;
}

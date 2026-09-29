import type { TribeId } from "../tribes";
import type { BiomeId } from "./biomes";

export const Terrain = {
  Deep: 0,
  Shallow: 1,
  Sand: 2,
  Grass: 3,
  Rock: 4,
  Dirt: 5,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

/** Variation within a biome: how wooded, fertile or stony an island is. */
export type IslandFlavor = "home" | "wooded" | "fertile" | "rocky" | "islet";

export interface Island {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  biome: BiomeId;
  flavor: IslandFlavor;
  tiles: number;
}

export const NODE_KINDS = [
  // Greenlands
  "oak",
  "pine",
  "fruit",
  "berry",
  "boulder",
  "ore",
  // Sunscorch Dunes
  "palm",
  "cactus",
  "sandstone",
  "gold_vein",
  // Infernal Isles
  "charred_tree",
  "ember_fruit",
  "obsidian",
  "hellstone",
  // Frostreach
  "snow_pine",
  "frost_berry",
  "ice_rock",
  // Verdant Wilds
  "jungle_tree",
  "banana",
  // Murkmire
  "willow",
  "swamp_shroom",
  "bog_ore",
  // Fungal Hollows
  "giant_mushroom",
  "glowshroom",
  // Crystal Spires
  "silver_tree",
  "crystal",
  // Amberwood
  "autumn_tree",
  "pumpkin",
  // Petal Isles
  "blossom_tree",
  "flower_bush",
] as const;

/** Harvestable things placed by world generation. */
export type NodeKind = (typeof NODE_KINDS)[number];
/**
 * Purely visual decoration; never blocks villagers (sea rocks and arches do block ships). Clients
 * pick the sprite from the tile's biome: small ground cover (two variants) or a taller plant. A
 * sea arch stands on two water tiles: (x, y) and the one beside it along +x (variant 0) or +y.
 */
export type DecoKind = "small" | "tall" | "sea_rock" | "sea_arch";

export interface NodeSpawn {
  kind: NodeKind;
  x: number;
  y: number;
  variant: number;
}

export interface DecoSpawn {
  kind: DecoKind;
  x: number;
  y: number;
  variant: number;
}

export type Dir = "+x" | "-x" | "+y" | "-y";

export const DIR_VECTORS: Record<Dir, { x: number; y: number }> = {
  "+x": { x: 1, y: 0 },
  "-x": { x: -1, y: 0 },
  "+y": { x: 0, y: 1 },
  "-y": { x: 0, y: -1 },
};

export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StartSite {
  islandId: number;
  townHall: Footprint;
  dock: Footprint & { dir: Dir; landing: { x: number; y: number } };
  spawn: { x: number; y: number }[];
}

export interface WorldMap {
  seed: string;
  tribe: TribeId;
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  /** Island id per tile, or -1 for open water. Water tiles near an island carry its id too. */
  island: Int16Array;
  /**
   * Biome index per tile (see BIOMES), reaching well out to sea so fog and water can take on a
   * region's colours; NO_BIOME in the open ocean.
   */
  biome: Uint8Array;
  /** Chebyshev distance from water to the nearest land (0 on land, capped at 255). */
  shore: Uint8Array;
  islands: Island[];
  start: StartSite;
  nodes: NodeSpawn[];
  decor: DecoSpawn[];
}

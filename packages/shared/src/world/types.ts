export const Terrain = {
  Deep: 0,
  Shallow: 1,
  Sand: 2,
  Grass: 3,
  Rock: 4,
  Dirt: 5,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export type IslandTheme = "home" | "farmland" | "forest" | "rocky" | "islet";

export interface Island {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  theme: IslandTheme;
  tiles: number;
}

/** Harvestable things placed by world generation. */
export type NodeKind = "oak" | "pine" | "fruit" | "berry" | "boulder" | "ore";
/** Purely visual decoration; never blocks villagers (sea rocks do block ships). */
export type DecoKind = "flowers" | "grass" | "sunflowers" | "sea_rock";

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
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Uint8Array;
  /** Island id per tile, or -1 for open water. Water tiles near an island carry its id too. */
  island: Int16Array;
  /** Chebyshev distance from water to the nearest land (0 on land, capped at 255). */
  shore: Uint8Array;
  islands: Island[];
  start: StartSite;
  nodes: NodeSpawn[];
  decor: DecoSpawn[];
}

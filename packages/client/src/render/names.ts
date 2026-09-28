// Maps game state to atlas frame names (see tools/sprites for how each is drawn).
import {
  BIOMES,
  farmStage,
  hash2d,
  NODE_VARIANTS,
  NODES,
  Terrain,
  tileIndex,
  type BiomeId,
  type BuildingEntity,
  type BuildingKind,
  type DecoSpawn,
  type NodeEntity,
  type NodeKind,
  type TribeId,
  type WorldMap,
} from "@explorer/shared";

export function biomeOfTile(world: WorldMap, x: number, y: number): BiomeId {
  return BIOMES[world.biome[tileIndex(world, x, y)]!] ?? "temperate";
}

export function groundSprite(biome: BiomeId, t: number, x: number, y: number): string {
  const r = hash2d(x, y, 0x77);
  switch (t) {
    case Terrain.Sand:
      return `t_${biome}_beach_${Math.floor(r * 3)}`;
    case Terrain.Rock:
      return `t_${biome}_rock_${Math.floor(r * 2)}`;
    case Terrain.Dirt:
      return `t_dirt_${Math.floor(r * 2)}`;
    default:
      return r < 0.1
        ? `t_${biome}_ground_3`
        : `t_${biome}_ground_${Math.floor(hash2d(x, y, 0x78) * 3)}`;
  }
}

export function lipKind(t: number): "ground" | "beach" | "rock" | "dirt" {
  return t === Terrain.Sand
    ? "beach"
    : t === Terrain.Rock
      ? "rock"
      : t === Terrain.Dirt
        ? "dirt"
        : "ground";
}

export function decorSprite(biome: BiomeId, d: DecoSpawn): string {
  if (d.kind === "sea_rock") return `sea_rock_${d.variant % 2}`;
  if (d.kind === "tall") return `deco_${biome}_tall`;
  return `deco_${biome}_small_${d.variant % 2}`;
}

const REGROW: Partial<Record<NodeKind, "charred" | "stalk" | "silver">> = {
  charred_tree: "charred",
  giant_mushroom: "stalk",
  silver_tree: "silver",
};

export function nodeSprite(n: NodeEntity): string {
  const style = REGROW[n.kind] ?? "wood";
  if (n.stage === "stump") return `n_stump_${style}`;
  if (n.stage === "sapling") return `n_sapling_${style}`;
  if (n.stage === "bare") return `n_${n.kind}_bare`;
  return `n_${n.kind}_${n.variant % NODE_VARIANTS[n.kind]}`;
}

export function markerSprite(n: NodeEntity): string {
  const tool = NODES[n.kind].tool;
  return tool === "axe" ? "mark_axe" : tool === "pick" ? "mark_pick" : "mark_basket";
}

export function buildingSprite(b: BuildingEntity, tribe: TribeId): string {
  if (b.kind === "farm") return `b_farm_${farmStage(b)}_${tribe}`;
  return buildingThumb(b.kind, tribe);
}

/** Representative frame for a building kind (build menu, selection panel, ghost). */
export function buildingThumb(kind: BuildingKind, tribe: TribeId): string {
  if (kind === "path") return "t_path";
  if (kind === "dock") return "dock_x_end";
  if (kind === "farm") return `b_farm_2_${tribe}`;
  return `b_${kind}_${tribe}`;
}

const SCAFFOLDS = new Set(["1x1", "2x2", "3x3", "3x2", "2x3"]);

export function scaffoldSprite(w: number, h: number): string {
  const key = `${Math.min(3, w)}x${Math.min(3, h)}`;
  return `scaffold_${SCAFFOLDS.has(key) ? key : "2x2"}`;
}

export function villagerSprite(tribe: TribeId, tunic: number, back: boolean, pose: string): string {
  return `villager_${tribe}_${tunic % 3}_${back ? "back" : "front"}_${pose}`;
}

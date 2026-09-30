// Maps game state to atlas frame names (see tools/sprites for how each is drawn).
import {
  BIOMES,
  farmStage,
  hash2d,
  NODE_VARIANTS,
  NODES,
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

/**
 * A small fixed offset inside a tile, in pixels, so plants and rocks do not stand in rows on the
 * grid. The same tile always gets the same offset.
 */
export function tileJitter(x: number, y: number, reach = 1): { dx: number; dy: number } {
  return {
    dx: Math.round((hash2d(x, y, 0x5a1) - 0.5) * 12 * reach),
    dy: Math.round((hash2d(x, y, 0x5a2) - 0.5) * 6 * reach),
  };
}

export function decorSprite(biome: BiomeId, d: DecoSpawn): string {
  if (d.kind === "sea_rock") return `sea_rock_${Math.floor(hash2d(d.x, d.y, 0x91) * 4)}`;
  if (d.kind === "sea_arch") return `sea_arch_${d.variant % 2}`;
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
  if (b.kind === "great_work") {
    // A finished stage stands as it is; while the next is under construction, its ghost shows.
    const stage = b.stage ?? 0;
    return `b_great_work_${Math.min(3, Math.max(1, b.complete ? stage : stage + 1))}_${tribe}`;
  }
  return buildingThumb(b.kind, tribe);
}

/** Representative frame for a building kind (build menu, selection panel, ghost). */
export function buildingThumb(kind: BuildingKind, tribe: TribeId): string {
  if (kind === "path") return "t_path";
  if (kind === "dock") return "dock_x_end";
  if (kind === "farm") return `b_farm_2_${tribe}`;
  if (kind === "great_work") return `b_great_work_3_${tribe}`;
  return `b_${kind}_${tribe}`;
}

const SCAFFOLDS = new Set(["1x1", "2x2", "3x3", "3x2", "2x3", "4x4"]);

export function scaffoldSprite(w: number, h: number): string {
  const key = w >= 4 && h >= 4 ? "4x4" : `${Math.min(3, w)}x${Math.min(3, h)}`;
  return `scaffold_${SCAFFOLDS.has(key) ? key : "2x2"}`;
}

/** A player's character: the villager's figure a quarter larger (standing or walking only). */
export function heroSprite(tribe: TribeId, tunic: number, back: boolean, pose: string): string {
  return `hero_${tribe}_${tunic % 3}_${back ? "back" : "front"}_${pose}`;
}

/** The tintable cape layers of a hero; `under` is only drawn behind a hero seen from the front. */
export function heroCapeSprite(back: boolean, layer: "over" | "under", pose: string): string {
  return `herocape_${back ? "back" : "front"}_${layer}_${pose}`;
}

export function villagerSprite(tribe: TribeId, tunic: number, back: boolean, pose: string): string {
  return `villager_${tribe}_${tunic % 3}_${back ? "back" : "front"}_${pose}`;
}

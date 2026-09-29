// The Great Work: a monument raised in three stages. Each stage is paid from the shared treasury
// and then built by villagers. What it asks for takes the team to every far biome and to the
// wrecks and sunken sites, so hauling goods home by cargo ship is the game's long road.
import { BIOME_DEFS, SIGNATURE, type BiomeId } from "../world/biomes";
import type { WorldMap } from "../world/types";
import { GREAT_WORK_FOUNDATION, NODES, type Resource, type Stock } from "./catalogue";

export interface GreatWorkStage {
  name: string;
  /** One line on what this stage raises. */
  blurb: string;
  cost: Partial<Stock>;
  /** Builder-seconds of construction. */
  work: number;
}

export interface SignatureGood {
  resource: Resource;
  biome: BiomeId;
  /** 1: the middle biomes; 2: the hostile and magical ones at the edge of the map. */
  tier: 1 | 2;
}

/** The six far-biome goods, whatever the world. */
export function signatureGoods(): SignatureGood[] {
  return (Object.entries(SIGNATURE) as [BiomeId, { node: keyof typeof NODES }][]).map(
    ([biome, sig]) => ({
      resource: NODES[sig.node].resource,
      biome,
      tier: BIOME_DEFS[biome].tier === 2 ? 2 : 1,
    }),
  );
}

/** The signature goods this world's team has to fetch: every one except its home biome's own. */
export function fetchedGoods(world: WorldMap): SignatureGood[] {
  const home = world.islands[world.start.islandId]?.biome;
  return signatureGoods().filter((g) => g.biome !== home);
}

/** The three stages, with costs that name the goods of this world's far biomes. */
export function greatWorkStages(world: WorldMap): GreatWorkStage[] {
  const goods = fetchedGoods(world);
  const cost = (tier: 1 | 2, each: number): Partial<Stock> =>
    Object.fromEntries(goods.filter((g) => g.tier === tier).map((g) => [g.resource, each]));
  return [
    {
      name: "Foundation",
      blurb: "Level the ground and lay the great stones.",
      cost: GREAT_WORK_FOUNDATION.cost,
      work: GREAT_WORK_FOUNDATION.work,
    },
    {
      name: "Pillars",
      blurb: "Raise a ring of pillars inlaid with the treasures of the middle lands.",
      cost: { stone: 120, gold: 40, tools: 15, ...cost(1, 40) },
      work: 60,
    },
    {
      name: "The Crown",
      blurb: "Crown it with hellstone and crystal, and light it with relics from the deep.",
      cost: { faith: 40, gold: 100, tools: 20, relic: 6, ...cost(2, 60) },
      work: 90,
    },
  ];
}

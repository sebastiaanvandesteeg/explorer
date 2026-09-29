// Tribes: chosen when a world is created and shared by the whole co-op team. Each has its own
// architecture and clothing (sprite generator + client), a home biome and one gameplay bonus.
import type { BiomeId } from "./world/biomes";

export const TRIBES = ["islanders", "northfolk", "sunfolk", "sylvan"] as const;
export type TribeId = (typeof TRIBES)[number];

export type TribeBonus = "sailing" | "woodcutting" | "mining" | "harvest";

export interface TribeDef {
  id: TribeId;
  name: string;
  description: string;
  homeBiome: BiomeId;
  bonus: TribeBonus;
  bonusText: string;
  banner: string;
}

export const TRIBE_DEFS: Record<TribeId, TribeDef> = {
  islanders: {
    id: "islanders",
    name: "Islanders",
    description: "Timber-and-thatch seafarers from the green isles.",
    homeBiome: "temperate",
    bonus: "sailing",
    bonusText: "Ships cost 25% less and sail 25% faster",
    banner: "#e98a3a",
  },
  northfolk: {
    id: "northfolk",
    name: "Northfolk",
    description: "Hardy log-hall builders from the frozen north.",
    homeBiome: "tundra",
    bonus: "woodcutting",
    bonusText: "Woodcutting is 30% faster",
    banner: "#c24a3a",
  },
  sunfolk: {
    id: "sunfolk",
    name: "Sunfolk",
    description: "Sandstone masons of the sun-baked dunes.",
    homeBiome: "desert",
    bonus: "mining",
    bonusText: "Quarrying and mining are 30% faster",
    banner: "#3a7fc2",
  },
  sylvan: {
    id: "sylvan",
    name: "Sylvan",
    description: "Forest folk who grow their homes among the blossoms.",
    homeBiome: "blossom",
    bonus: "harvest",
    bonusText: "Food gathering and farming are 30% faster",
    banner: "#6fbf5a",
  },
};

export function isTribe(v: unknown): v is TribeId {
  return typeof v === "string" && (TRIBES as readonly string[]).includes(v);
}

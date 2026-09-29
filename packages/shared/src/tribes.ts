// Tribes: chosen when a world is created and shared by the whole co-op team. Each has its own
// architecture and clothing (sprite generator + client), a home biome and one gameplay bonus.
import type { UpgradeId } from "./sim/catalogue";
import type { BiomeId } from "./world/biomes";

export const TRIBES = [
  "islanders",
  "northfolk",
  "sunfolk",
  "sylvan",
  "glowkin",
  "freebooters",
  "mirefolk",
  "amberwrights",
  "cinderborn",
] as const;
export type TribeId = (typeof TRIBES)[number];

export type TribeBonus =
  | "sailing"
  | "woodcutting"
  | "mining"
  | "harvest"
  | "nightsight"
  | "privateering"
  | "diving"
  | "trade"
  | "forging";

export interface TribeDef {
  id: TribeId;
  name: string;
  description: string;
  homeBiome: BiomeId;
  bonus: TribeBonus;
  bonusText: string;
  banner: string;
  /** Upgrades the tribe knows from the start, as if already learned. */
  innate?: UpgradeId[];
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
  glowkin: {
    id: "glowkin",
    name: "Glowkin",
    description: "Mushroom-dwellers of the Fungal Hollows, whose homes glow all night.",
    homeBiome: "fungal",
    bonus: "nightsight",
    bonusText: "Lookouts and ships see as far by night as by day",
    banner: "#a47ae8",
  },
  freebooters: {
    id: "freebooters",
    name: "Freebooters",
    description: "Reformed pirates of the jungle coasts, who never unloaded their guns.",
    homeBiome: "jungle",
    bonus: "privateering",
    bonusText: "Every ship carries cannons, and sunk raiders leave twice the loot",
    banner: "#e0558c",
    innate: ["cannons"],
  },
  mirefolk: {
    id: "mirefolk",
    name: "Mirefolk",
    description: "Pearl divers of the misty bogs, who live in lantern-lit reed huts.",
    homeBiome: "swamp",
    bonus: "diving",
    bonusText: "Divers work twice as fast and bring up 50% more",
    banner: "#3fb0a0",
  },
  amberwrights: {
    id: "amberwrights",
    name: "Amberwrights",
    description: "Craftsfolk and traders of the amber forests.",
    homeBiome: "autumn",
    bonus: "trade",
    bonusText: "Markets pay 30% more gold for your goods",
    banner: "#e3b341",
  },
  cinderborn: {
    id: "cinderborn",
    name: "Cinderborn",
    description: "Basalt-hall builders who live among the embers of the Infernal Isles.",
    homeBiome: "infernal",
    bonus: "forging",
    bonusText: "Blacksmiths forge twice as fast, and no Ember Ward is needed",
    banner: "#ff6b3d",
    innate: ["ember_ward"],
  },
};

export function isTribe(v: unknown): v is TribeId {
  return typeof v === "string" && (TRIBES as readonly string[]).includes(v);
}

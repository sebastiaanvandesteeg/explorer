import type { Resource } from "@explorer/shared";

/** Atlas frame for each resource's HUD icon. */
export const ICON: Record<Resource, string> = {
  wood: "icon_wood",
  stone: "icon_stone",
  food: "icon_food",
  ore: "icon_ore",
  tools: "icon_tools",
  gold: "icon_gold",
  faith: "icon_faith",
  crystal: "icon_crystal",
  relic: "icon_relic",
  sunstone: "icon_sunstone",
  rimeglass: "icon_rimeglass",
  mirepearl: "icon_mirepearl",
  glowcap: "icon_glowcap",
  hellstone: "icon_hellstone",
};

export const LABEL: Record<Resource, string> = {
  wood: "Wood",
  stone: "Stone",
  food: "Food",
  ore: "Ore",
  tools: "Tools",
  gold: "Gold",
  faith: "Faith",
  crystal: "Crystal",
  relic: "Relic",
  sunstone: "Sunstone",
  rimeglass: "Rimeglass",
  mirepearl: "Mirepearl",
  glowcap: "Glowcap",
  hellstone: "Hellstone",
};

/** Goods that only turn up once the settlement has some: the top bar hides them until then. */
export const RARE: readonly Resource[] = [
  "ore",
  "tools",
  "gold",
  "faith",
  "crystal",
  "relic",
  "sunstone",
  "rimeglass",
  "mirepearl",
  "glowcap",
  "hellstone",
];

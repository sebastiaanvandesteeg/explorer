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
};

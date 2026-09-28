import type { Sprite } from "./sprite";
import { buildingSprites } from "./sprites/buildings";
import { natureSprites } from "./sprites/nature";
import { terrainSprites } from "./sprites/terrain";
import { unitSprites } from "./sprites/units";

export function allSprites(): Sprite[] {
  return [...terrainSprites(), ...natureSprites(), ...buildingSprites(), ...unitSprites()];
}

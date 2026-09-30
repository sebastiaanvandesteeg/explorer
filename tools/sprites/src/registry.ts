import type { Sprite } from "./sprite";
import { buildingSprites } from "./sprites/buildings";
import { heroSprites } from "./sprites/heroes";
import { interiorSprites } from "./sprites/interiors";
import { decorSprites } from "./sprites/decor";
import { natureSprites } from "./sprites/nature";
import { terrainSprites } from "./sprites/terrain";
import { unitSprites } from "./sprites/units";

export function allSprites(): Sprite[] {
  return [
    ...terrainSprites(),
    ...decorSprites(),
    ...natureSprites(),
    ...buildingSprites(),
    ...interiorSprites(),
    ...unitSprites(),
    ...heroSprites(),
  ];
}

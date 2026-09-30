// A player's character as a stack of sprites, one per layer (see names.ts), with the look's
// colours multiplied into the greyscale ones. Shared by the island view and the building rooms.
import {
  EYE_COLOURS,
  HAIR_COLOURS,
  hexToNumber,
  SKIN_TONES,
  type CharacterLook,
} from "@explorer/shared";
import { Container, Sprite } from "pixi.js";
import type { Atlas } from "../assets";
import { HERO_LAYER_ORDER, heroLayerSprite, type HeroLayerName } from "./names";

const tintFor = (layer: HeroLayerName, look: CharacterLook, playerColour: number): number => {
  switch (layer) {
    case "skin":
      return hexToNumber(SKIN_TONES[look.skin]!);
    case "hair":
      return hexToNumber(HAIR_COLOURS[look.hair]!);
    case "iris":
      return hexToNumber(EYE_COLOURS[look.eyes]!);
    case "scarf":
      return playerColour;
    default:
      return 0xffffff;
  }
};

export class HeroRig {
  readonly root = new Container();
  private readonly sprites = new Map<HeroLayerName, Sprite>();

  constructor(private readonly atlas: Atlas) {
    for (const layer of HERO_LAYER_ORDER) {
      const sprite = new Sprite();
      sprite.visible = false;
      this.sprites.set(layer, sprite);
      this.root.addChild(sprite);
    }
  }

  /** Show the hero facing `facing` (0 +x, 1 +y, 2 -x, 3 -y) in a pose. */
  set(look: CharacterLook, playerColour: number, facing: number, pose: string): void {
    const back = facing === 2 || facing === 3;
    const flip = facing === 1 || facing === 2;
    for (const layer of HERO_LAYER_ORDER) {
      const sprite = this.sprites.get(layer)!;
      const name = heroLayerSprite(layer, look, back, pose);
      if (name === null || !this.atlas.has(name)) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      this.atlas.setFrame(sprite, name);
      const k = Math.abs(sprite.scale.x);
      sprite.scale.x = flip ? -k : k;
      sprite.tint = tintFor(layer, look, playerColour);
    }
  }
}

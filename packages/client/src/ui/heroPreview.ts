// Draws a hero on a 2D canvas the way the game does (layers stacked, greys multiplied by the
// look's colours), for the lobby's character creator and, later, a wardrobe.
import {
  EYE_COLOURS,
  HAIR_COLOURS,
  HERO_CROP,
  HERO_FRAME,
  SKIN_TONES,
  type CharacterLook,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import {
  HERO_LAYER_ORDER,
  heroLayerSprite,
  TINTED_LAYERS,
  type HeroLayerName,
} from "../render/names";

// HERO_CROP is centred on the anchor: HERO_FRAME.anchorX - HERO_CROP.x === HERO_CROP.width / 2.
const scratch = document.createElement("canvas");
scratch.width = HERO_FRAME.width;
scratch.height = HERO_FRAME.height;
const sctx = scratch.getContext("2d", { willReadFrequently: false })!;

const tintHex = (layer: HeroLayerName, look: CharacterLook, scarf: string): string | null => {
  if (!TINTED_LAYERS.includes(layer)) return null;
  switch (layer) {
    case "skin":
      return SKIN_TONES[look.skin]!;
    case "hair":
      return HAIR_COLOURS[look.hair]!;
    case "iris":
      return EYE_COLOURS[look.eyes]!;
    default:
      return scarf;
  }
};

/** Paint `look` onto `canvas` (HERO_FRAME sized); `facing` is 0..3 as in the game. */
export function drawHero(
  atlas: Atlas,
  canvas: HTMLCanvasElement,
  look: CharacterLook,
  scarf: string,
  facing = 0,
  pose = "stand",
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const back = facing === 2 || facing === 3;
  const flip = facing === 1 || facing === 2;
  ctx.save();
  // The crop is centred on the figure's feet, so mirroring the canvas keeps it in place.
  if (flip) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(-HERO_CROP.x, -HERO_CROP.y);
  for (const layer of HERO_LAYER_ORDER) {
    const name = heroLayerSprite(layer, look, back, pose);
    if (name === null || !atlas.has(name)) continue;
    const tex = atlas.texture(name);
    const src = tex.source.resource as CanvasImageSource;
    const f = atlas.frame(name);
    const anchor = atlas.meta[name]!;
    const dx = HERO_FRAME.anchorX - anchor.anchorX;
    const dy = HERO_FRAME.anchorY - anchor.anchorY;
    const tint = tintHex(layer, look, scarf);
    if (!tint) {
      ctx.drawImage(src, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
      continue;
    }
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.globalCompositeOperation = "source-over";
    sctx.drawImage(src, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
    sctx.globalCompositeOperation = "multiply";
    sctx.fillStyle = tint;
    sctx.fillRect(0, 0, scratch.width, scratch.height);
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(src, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
    ctx.drawImage(scratch, 0, 0);
  }
  ctx.restore();
}

export function heroCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = HERO_CROP.width;
  c.height = HERO_CROP.height;
  c.className = "hero-canvas";
  return c;
}

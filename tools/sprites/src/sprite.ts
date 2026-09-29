import { HALF_H, HALF_W } from "@explorer/shared";
import type { Canvas } from "./canvas";
import type { Scene } from "./raytrace";

export interface Sprite {
  name: string;
  canvas: Canvas;
  /** Pixel in `canvas` that sits on the entity's world anchor (a tile's top vertex). */
  anchorX: number;
  anchorY: number;
  meta?: Record<string, unknown>;
}

/** Trim transparent borders, keeping the anchor in place. */
export function trimmed(
  name: string,
  canvas: Canvas,
  anchorX: number,
  anchorY: number,
  meta?: Record<string, unknown>,
): Sprite {
  const b = canvas.bounds();
  if (!b) throw new Error(`sprite ${name} is empty`);
  const out = canvas.crop(b.left, b.top, b.right - b.left + 1, b.bottom - b.top + 1);
  return {
    name,
    canvas: out,
    anchorX: anchorX - b.left,
    anchorY: anchorY - b.top,
    ...(meta ? { meta } : {}),
  };
}

/**
 * Texels per world pixel for ray-cast art. Buildings, trees, rocks and ships are drawn at twice the
 * world's pixel density and shown at half scale, so they cover the same ground with twice the
 * detail. Frames carry `res` in the manifest and the client scales by it.
 */
export const SPRITE_RES = 2;

/**
 * Render a scene whose footprint spans `w`×`d` tiles from the world origin, with room for
 * `heightPx` pixels above the ground and `pad` pixels on every side (all in world pixels; the
 * canvas itself is `res` times finer).
 */
export function renderSprite(
  name: string,
  scene: Scene,
  w: number,
  d: number,
  heightPx: number,
  pad = 12,
  meta?: Record<string, unknown>,
  options: Omit<NonNullable<Parameters<Scene["render"]>[4]>, "scale"> & { res?: number } = {},
): Sprite {
  const { res = SPRITE_RES, ...renderOptions } = options;
  const width = (w + d) * HALF_W + pad * 2;
  const height = heightPx + (w + d) * HALF_H + pad * 2;
  const ax = d * HALF_W + pad;
  const ay = heightPx + pad;
  const canvas = scene.render(width * res, height * res, ax * res, ay * res, {
    ...renderOptions,
    scale: res,
  });
  return trimmed(name, canvas, ax * res, ay * res, res === 1 ? meta : { ...meta, res });
}

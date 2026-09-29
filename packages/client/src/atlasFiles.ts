// The sprite atlas as tools/sprites writes it: a manifest plus spritesheet pages. Read here without
// PixiJS, so the landing page can show the game's sprites without loading the renderer.
import type { SpritesheetData } from "pixi.js";

export interface SpriteMeta {
  page: number;
  anchorX: number;
  anchorY: number;
  smoke?: { x: number; y: number }[];
  sparkle?: { x: number; y: number }[];
  /** Lit windows and fires: where the building glows at night, and how far. */
  lights?: { x: number; y: number; r: number }[];
  /** A lighthouse's lamp: where its beam starts. */
  beam?: { x: number; y: number }[];
  /** Texels per world pixel: 2 for figures drawn at double resolution. Absent means 1. */
  res?: number;
}

export interface AtlasPage {
  json: SpritesheetData;
  /** URL of the page's image. */
  image: string;
}

export interface AtlasFiles {
  sprites: Record<string, SpriteMeta>;
  pages: AtlasPage[];
}

export async function fetchAtlasFiles(): Promise<AtlasFiles> {
  const manifest = (await fetch("/assets/atlas.json").then((r) => r.json())) as {
    pages: string[];
    sprites: Record<string, SpriteMeta>;
  };
  const pages = await Promise.all(
    manifest.pages.map(async (file) => {
      const json = (await fetch(`/assets/${file}`).then((r) => r.json())) as SpritesheetData;
      return { json, image: `/assets/${json.meta.image}` };
    }),
  );
  return { sprites: manifest.sprites, pages };
}

/**
 * CSS for showing a frame of a page as a pixelated DOM icon. `scale` is CSS pixels per texel; a
 * double-resolution frame should get half the scale of the world's sprites to match their size.
 */
export function frameStyle(page: AtlasPage, name: string, scale = 2): Partial<CSSStyleDeclaration> {
  const f = page.json.frames[name]!.frame;
  const size = page.json.meta.size!;
  return {
    width: `${f.w * scale}px`,
    height: `${f.h * scale}px`,
    backgroundImage: `url(${page.image})`,
    backgroundPosition: `-${f.x * scale}px -${f.y * scale}px`,
    backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
    imageRendering: "pixelated",
  };
}

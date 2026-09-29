import { Assets, Sprite, Spritesheet, Texture, TextureSource, type SpritesheetData } from "pixi.js";

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
}

interface Manifest {
  pages: string[];
  sprites: Record<string, SpriteMeta>;
}

interface Page {
  json: SpritesheetData;
  image: string;
}

export class Atlas {
  constructor(
    readonly textures: Record<string, Texture>,
    readonly meta: Record<string, SpriteMeta>,
    readonly ocean: Texture[],
    private readonly pages: Page[],
  ) {}

  has(name: string): boolean {
    return name in this.textures;
  }

  texture(name: string): Texture {
    const t = this.textures[name];
    if (!t) throw new Error(`missing sprite "${name}"`);
    return t;
  }

  /** A sprite whose anchor is the generator's pixel anchor (a tile's top vertex, feet, …). */
  sprite(name: string): Sprite {
    const s = new Sprite(this.texture(name));
    this.anchor(s, name);
    return s;
  }

  anchor(s: Sprite, name: string): void {
    const m = this.meta[name]!;
    const f = this.frame(name);
    s.anchor.set(m.anchorX / f.w, m.anchorY / f.h);
  }

  frame(name: string): { x: number; y: number; w: number; h: number } {
    const page = this.pages[this.meta[name]!.page]!;
    return page.json.frames[name]!.frame;
  }

  /** CSS for showing a frame as a pixelated DOM icon. */
  iconStyle(name: string, scale = 2): Partial<CSSStyleDeclaration> {
    const page = this.pages[this.meta[name]!.page]!;
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
}

export async function loadAtlas(): Promise<Atlas> {
  TextureSource.defaultOptions.scaleMode = "nearest";
  const manifest = (await fetch("/assets/atlas.json").then((r) => r.json())) as Manifest;
  const pages: Page[] = [];
  const textures: Record<string, Texture> = {};
  for (const file of manifest.pages) {
    const json = (await fetch(`/assets/${file}`).then((r) => r.json())) as SpritesheetData;
    const image = `/assets/${json.meta.image}`;
    const base = await Assets.load<Texture>(image);
    const sheet = new Spritesheet(base, json);
    await sheet.parse();
    Object.assign(textures, sheet.textures);
    pages.push({ json, image });
  }
  const ocean = await Promise.all(
    [0, 1, 2].map((i) => Assets.load<Texture>(`/assets/ocean_${i}.png`)),
  );
  return new Atlas(textures, manifest.sprites, ocean, pages);
}

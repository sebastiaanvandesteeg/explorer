import { Assets, Sprite, Spritesheet, Texture, TextureSource } from "pixi.js";
import { fetchAtlasFiles, frameStyle, type AtlasPage, type SpriteMeta } from "./atlasFiles";

export class Atlas {
  constructor(
    readonly textures: Record<string, Texture>,
    readonly meta: Record<string, SpriteMeta>,
    readonly ocean: Texture[],
    private readonly pages: AtlasPage[],
  ) {}

  has(name: string): boolean {
    return name in this.textures;
  }

  texture(name: string): Texture {
    const t = this.textures[name];
    if (!t) throw new Error(`missing sprite "${name}"`);
    return t;
  }

  /**
   * A sprite whose anchor is the generator's pixel anchor (a tile's top vertex, feet, …), scaled
   * so a double-resolution frame covers as much of the world as an ordinary one.
   */
  sprite(name: string): Sprite {
    const s = new Sprite(this.texture(name));
    this.anchor(s, name);
    s.scale.set(1 / this.res(name));
    return s;
  }

  /** Texels per world pixel for a frame (villagers are drawn at double resolution). */
  res(name: string): number {
    return this.meta[name]?.res ?? 1;
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

  /** CSS for showing a frame as a pixelated DOM icon, `scale` CSS pixels per world pixel. */
  iconStyle(name: string, scale = 2): Partial<CSSStyleDeclaration> {
    return frameStyle(this.pages[this.meta[name]!.page]!, name, scale / this.res(name));
  }
}

export async function loadAtlas(): Promise<Atlas> {
  TextureSource.defaultOptions.scaleMode = "nearest";
  const files = await fetchAtlasFiles();
  const textures: Record<string, Texture> = {};
  for (const page of files.pages) {
    const base = await Assets.load<Texture>(page.image);
    const sheet = new Spritesheet(base, page.json);
    await sheet.parse();
    Object.assign(textures, sheet.textures);
  }
  const ocean = await Promise.all(
    [0, 1, 2].map((i) => Assets.load<Texture>(`/assets/ocean_${i}.png`)),
  );
  return new Atlas(textures, files.sprites, ocean, files.pages);
}

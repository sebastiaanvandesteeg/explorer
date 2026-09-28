import { Assets, Sprite, Spritesheet, Texture, TextureSource, type SpritesheetData } from "pixi.js";

export interface SpriteMeta {
  anchorX: number;
  anchorY: number;
  smoke?: { x: number; y: number }[];
}

interface AtlasJson extends SpritesheetData {
  explorer: Record<string, SpriteMeta>;
}

export class Atlas {
  constructor(
    readonly textures: Record<string, Texture>,
    readonly meta: Record<string, SpriteMeta>,
    readonly ocean: Texture[],
    readonly json: AtlasJson,
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
    const f = this.json.frames[name]!.frame;
    s.anchor.set(m.anchorX / f.w, m.anchorY / f.h);
  }

  /** CSS for showing a frame as a pixelated DOM icon. */
  iconStyle(name: string, scale = 2): Partial<CSSStyleDeclaration> {
    const f = this.json.frames[name]!.frame;
    const size = this.json.meta.size!;
    return {
      width: `${f.w * scale}px`,
      height: `${f.h * scale}px`,
      backgroundImage: "url(/assets/atlas.png)",
      backgroundPosition: `-${f.x * scale}px -${f.y * scale}px`,
      backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
      imageRendering: "pixelated",
    };
  }
}

export async function loadAtlas(): Promise<Atlas> {
  TextureSource.defaultOptions.scaleMode = "nearest";
  const json = (await fetch("/assets/atlas.json").then((r) => r.json())) as AtlasJson;
  const base = await Assets.load<Texture>("/assets/atlas.png");
  const sheet = new Spritesheet(base, json);
  await sheet.parse();
  const ocean = await Promise.all(
    [0, 1, 2].map((i) => Assets.load<Texture>(`/assets/ocean_${i}.png`)),
  );
  return new Atlas(sheet.textures as Record<string, Texture>, json.explorer, ocean, json);
}

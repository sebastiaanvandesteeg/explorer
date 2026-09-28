import { Canvas } from "./canvas";
import type { Sprite } from "./sprite";

export interface PackedFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: 0; y: 0; w: number; h: number };
  sourceSize: { w: number; h: number };
  anchor: { x: number; y: number };
}

/** One atlas page in PixiJS spritesheet format. */
export interface PageJson {
  frames: Record<string, PackedFrame>;
  meta: {
    app: string;
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: 1;
  };
}

/** Index of every sprite: which page it's on, its pixel anchor and extra metadata. */
export interface Manifest {
  pages: string[];
  sprites: Record<
    string,
    { page: number; anchorX: number; anchorY: number } & Record<string, unknown>
  >;
}

const PAD = 2;
const PAGE_W = 2048;
const PAGE_H = 2048;

/** Shelf packer over as many pages as needed: tallest sprites first, rows left to right. */
export function pack(sprites: Sprite[]): {
  pages: { image: Canvas; json: PageJson }[];
  manifest: Manifest;
} {
  const names = new Set<string>();
  for (const s of sprites) {
    if (names.has(s.name)) throw new Error(`duplicate sprite name ${s.name}`);
    names.add(s.name);
  }
  const order = [...sprites].sort(
    (a, b) => b.canvas.height - a.canvas.height || a.name.localeCompare(b.name),
  );
  const spots = new Map<string, { page: number; x: number; y: number }>();
  const used: number[] = [0];
  let page = 0;
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const s of order) {
    if (s.canvas.width + PAD * 2 > PAGE_W || s.canvas.height + PAD * 2 > PAGE_H)
      throw new Error(`sprite ${s.name} is larger than an atlas page`);
    if (x + s.canvas.width + PAD > PAGE_W) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    if (y + s.canvas.height + PAD > PAGE_H) {
      page++;
      used.push(0);
      x = PAD;
      y = PAD;
      rowH = 0;
    }
    spots.set(s.name, { page, x, y });
    x += s.canvas.width + PAD;
    rowH = Math.max(rowH, s.canvas.height);
    used[page] = Math.max(used[page]!, y + rowH + PAD);
  }
  const pages = used.map((h, i) => {
    let height = 1;
    while (height < h) height *= 2;
    return {
      image: new Canvas(PAGE_W, height),
      json: {
        frames: {} as Record<string, PackedFrame>,
        meta: {
          app: "explorer/tools/sprites",
          image: `atlas-${i}.png`,
          format: "RGBA8888" as const,
          size: { w: PAGE_W, h: height },
          scale: 1 as const,
        },
      },
    };
  });
  const manifest: Manifest = { pages: pages.map((_, i) => `atlas-${i}.json`), sprites: {} };
  for (const s of [...sprites].sort((a, b) => a.name.localeCompare(b.name))) {
    const spot = spots.get(s.name)!;
    const p = pages[spot.page]!;
    p.image.draw(s.canvas, spot.x, spot.y);
    const w = s.canvas.width;
    const h = s.canvas.height;
    p.json.frames[s.name] = {
      frame: { x: spot.x, y: spot.y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      anchor: { x: +(s.anchorX / w).toFixed(6), y: +(s.anchorY / h).toFixed(6) },
    };
    manifest.sprites[s.name] = {
      page: spot.page,
      anchorX: s.anchorX,
      anchorY: s.anchorY,
      ...(s.meta ?? {}),
    };
  }
  return { pages, manifest };
}

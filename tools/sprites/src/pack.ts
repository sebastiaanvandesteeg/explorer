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

export interface AtlasJson {
  frames: Record<string, PackedFrame>;
  meta: {
    app: string;
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: 1;
  };
  /** Pixel anchors and per-sprite metadata (smoke emitters…), keyed by frame name. */
  explorer: Record<string, { anchorX: number; anchorY: number } & Record<string, unknown>>;
}

const PAD = 2;

/** Shelf packer: tallest sprites first, rows left to right. */
export function pack(sprites: Sprite[], width = 1024): { image: Canvas; json: AtlasJson } {
  const names = new Set<string>();
  for (const s of sprites) {
    if (names.has(s.name)) throw new Error(`duplicate sprite name ${s.name}`);
    names.add(s.name);
  }
  const order = [...sprites].sort(
    (a, b) => b.canvas.height - a.canvas.height || a.name.localeCompare(b.name),
  );
  const spots = new Map<string, { x: number; y: number }>();
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const s of order) {
    if (s.canvas.width + PAD * 2 > width) throw new Error(`sprite ${s.name} wider than atlas`);
    if (x + s.canvas.width + PAD > width) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    spots.set(s.name, { x, y });
    x += s.canvas.width + PAD;
    rowH = Math.max(rowH, s.canvas.height);
  }
  let height = 1;
  while (height < y + rowH + PAD) height *= 2;
  const image = new Canvas(width, height);
  const frames: Record<string, PackedFrame> = {};
  const explorer: AtlasJson["explorer"] = {};
  for (const s of [...sprites].sort((a, b) => a.name.localeCompare(b.name))) {
    const at = spots.get(s.name)!;
    image.draw(s.canvas, at.x, at.y);
    const w = s.canvas.width;
    const h = s.canvas.height;
    frames[s.name] = {
      frame: { x: at.x, y: at.y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      anchor: { x: +(s.anchorX / w).toFixed(6), y: +(s.anchorY / h).toFixed(6) },
    };
    explorer[s.name] = { anchorX: s.anchorX, anchorY: s.anchorY, ...(s.meta ?? {}) };
  }
  return {
    image,
    json: {
      frames,
      meta: {
        app: "explorer/tools/sprites",
        image: "atlas.png",
        format: "RGBA8888",
        size: { w: width, h: height },
        scale: 1,
      },
      explorer,
    },
  };
}

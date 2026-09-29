import type { Rgba } from "./palette";

/** Minimal RGBA pixel buffer for hand-rolled pixel art. */
export class Canvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3]! : 0;
  }

  get(x: number, y: number): Rgba {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  set(x: number, y: number, [r, g, b, a]: Rgba): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  /** Source-over blend. */
  blend(x: number, y: number, [r, g, b, a]: Rgba): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y) || a === 0) return;
    if (a === 255) return this.set(x, y, [r, g, b, a]);
    const i = (y * this.width + x) * 4;
    const da = this.data[i + 3]! / 255;
    const sa = a / 255;
    const oa = sa + da * (1 - sa);
    const mix = (s: number, d: number) => (s * sa + d * da * (1 - sa)) / oa;
    this.data[i] = mix(r, this.data[i]!);
    this.data[i + 1] = mix(g, this.data[i + 1]!);
    this.data[i + 2] = mix(b, this.data[i + 2]!);
    this.data[i + 3] = oa * 255;
  }

  fill(x0: number, y0: number, w: number, h: number, c: Rgba): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  draw(src: Canvas, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(flipX ? src.width - 1 - x : x, y);
        if (c[3] > 0) this.blend(dx + x, dy + y, c);
      }
    }
  }

  /** Smallest box containing every non-transparent pixel (null when empty). */
  bounds(): { left: number; top: number; right: number; bottom: number } | null {
    let left = this.width;
    let top = this.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alpha(x, y) === 0) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < 0 ? null : { left, top, right, bottom };
  }

  crop(left: number, top: number, width: number, height: number): Canvas {
    const out = new Canvas(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) out.set(x, y, this.get(left + x, top + y));
    return out;
  }
}

/**
 * Darken silhouette pixels (opaque pixels touching transparency) towards the outline colour.
 * Pixels whose alpha is below `solidAlpha` (soft shadows) neither get nor cause outlines.
 */
export function outline(canvas: Canvas, k = 0.42, solidAlpha = 200): void {
  const edge: [number, number][] = [];
  const solid = (x: number, y: number) => canvas.alpha(x, y) >= solidAlpha;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
        edge.push([x, y]);
      }
    }
  }
  const base = [27, 26, 31];
  for (const [x, y] of edge) {
    const [r, g, b, a] = canvas.get(x, y);
    canvas.set(x, y, [
      Math.round(base[0]! + (r - base[0]!) * k),
      Math.round(base[1]! + (g - base[1]!) * k),
      Math.round(base[2]! + (b - base[2]!) * k),
      a,
    ]);
  }
}

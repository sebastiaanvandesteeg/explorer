// A tiny isometric ray-caster for modelling sprites out of boxes, roofs, prisms and blobs.
// Shading is snapped to palette ramps (with restrained ordered dithering) and silhouettes get
// dark outlines, so the output reads as pixel art rather than a 3D render.
//
// Authoring units: x and y in tiles, z in screen pixels. Internally everything is converted to
// an isotropic metric space (z / Z_SCALE) so normals, spheres and lighting are correct.
import { HALF_H, HALF_W, Z_SCALE } from "@explorer/shared";
import { Canvas, outline } from "./canvas";
import { shade, type RampName, type Rgba } from "./palette";

export type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Direction towards the light: from the upper left, like the concept art. */
export const LIGHT: Vec3 = normalize([-0.35, 0.55, 0.9]);
/** Un-normalised view direction; moving along it keeps the screen position fixed. */
const VIEW: Vec3 = [-1, -1, -(2 * HALF_H) / Z_SCALE];
const RAY_START_HEIGHT = 12; // metric units above the water plane (≈235 px)

export interface ShadeContext {
  /** Hit point in world space: x, y in tiles, z in pixels. */
  p: Vec3;
  /** World-space unit normal. */
  n: Vec3;
  /** Hit point in the shape's un-rotated local frame (x, y tiles, z pixels). */
  lp: Vec3;
  /** Normal in the local frame. */
  ln: Vec3;
  /** Lambert term including cast shadows, 0..1. */
  light: number;
  shadowed: boolean;
  px: number;
  py: number;
  /** Lighting for a perturbed normal (for bumpy foliage and billowing cloth). */
  lightFor(n: Vec3): number;
}

export type Material = (c: ShadeContext) => Rgba | null;

/** Standard brightness from lighting, to feed into `shade`. */
export function lit(c: ShadeContext, bias = 0): number {
  return 0.22 + 0.78 * c.light + bias;
}

export function flat(rampName: RampName, bias = 0): Material {
  return (c) => shade(rampName, lit(c, bias), c.px, c.py);
}

interface Transform {
  cos: number;
  sin: number;
  pivot: Vec3; // metric
}

interface Hit {
  t: number;
  n: Vec3;
}

interface Shape {
  material: Material;
  castsShadow: boolean;
  xform: Transform | null;
  intersect(o: Vec3, d: Vec3, tMin: number): Hit | null;
}

interface Plane {
  n: Vec3;
  d: number;
}

class Convex implements Shape {
  constructor(
    readonly planes: Plane[],
    readonly material: Material,
    readonly castsShadow: boolean,
    readonly xform: Transform | null,
  ) {}

  intersect(o: Vec3, d: Vec3, tMin: number): Hit | null {
    let tNear = -Infinity;
    let tFar = Infinity;
    let nNear: Vec3 | null = null;
    for (const pl of this.planes) {
      const denom = dot(pl.n, d);
      const dist = pl.d - dot(pl.n, o);
      if (Math.abs(denom) < 1e-12) {
        if (dist < 0) return null;
        continue;
      }
      const t = dist / denom;
      if (denom < 0) {
        if (t > tNear) {
          tNear = t;
          nNear = pl.n;
        }
      } else if (t < tFar) {
        tFar = t;
      }
      if (tNear > tFar) return null;
    }
    if (!nNear || tNear < tMin) return null;
    return { t: tNear, n: normalize(nNear) };
  }
}

class Ellipsoid implements Shape {
  constructor(
    readonly c: Vec3,
    readonly r: Vec3,
    readonly material: Material,
    readonly castsShadow: boolean,
    readonly xform: Transform | null,
  ) {}

  intersect(o: Vec3, d: Vec3, tMin: number): Hit | null {
    // Rotate the ray into the ellipsoid's frame (inverse of its yaw), then scale to a unit sphere.
    const cos = this.xform?.cos ?? 1;
    const sin = this.xform?.sin ?? 0;
    const rel: Vec3 = [o[0] - this.c[0], o[1] - this.c[1], o[2] - this.c[2]];
    const lo: Vec3 = [
      (rel[0] * cos + rel[1] * sin) / this.r[0],
      (-rel[0] * sin + rel[1] * cos) / this.r[1],
      rel[2] / this.r[2],
    ];
    const ld: Vec3 = [
      (d[0] * cos + d[1] * sin) / this.r[0],
      (-d[0] * sin + d[1] * cos) / this.r[1],
      d[2] / this.r[2],
    ];
    const a = dot(ld, ld);
    const b = 2 * dot(lo, ld);
    const cc = dot(lo, lo) - 1;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < tMin) return null;
    const q = add(lo, ld, t);
    const nl: Vec3 = [q[0] / this.r[0], q[1] / this.r[1], q[2] / this.r[2]];
    return { t, n: normalize([nl[0] * cos - nl[1] * sin, nl[0] * sin + nl[1] * cos, nl[2]]) };
  }
}

export interface ShapeOptions {
  castsShadow?: boolean;
}

type Axis = "x" | "y" | "z";

const m = (zPx: number) => zPx / Z_SCALE;

export class Scene {
  private readonly shapes: Shape[] = [];
  private xform: Transform | null = null;
  /** Ground rectangle (tiles) that receives soft cast shadows. */
  groundShadow: { x0: number; y0: number; x1: number; y1: number } | null = null;
  shadowAlpha = 72;

  /** Run `build` with every shape rotated by `yaw` radians around the vertical axis at `pivot`. */
  withYaw(yaw: number, pivot: [number, number], build: () => void): void {
    const prev = this.xform;
    this.xform = { cos: Math.cos(yaw), sin: Math.sin(yaw), pivot: [pivot[0], pivot[1], 0] };
    try {
      build();
    } finally {
      this.xform = prev;
    }
  }

  convex(planes: Plane[], material: Material, opts: ShapeOptions = {}): void {
    const xf = this.xform;
    const transformed = xf
      ? planes.map(({ n, d }) => {
          const n2: Vec3 = [n[0] * xf.cos - n[1] * xf.sin, n[0] * xf.sin + n[1] * xf.cos, n[2]];
          return { n: n2, d: d - dot(n, xf.pivot) + dot(n2, xf.pivot) };
        })
      : planes;
    this.shapes.push(new Convex(transformed, material, opts.castsShadow ?? true, xf));
  }

  box(min: Vec3, max: Vec3, material: Material, opts?: ShapeOptions): void {
    this.convex(
      [
        { n: [-1, 0, 0], d: -min[0] },
        { n: [1, 0, 0], d: max[0] },
        { n: [0, -1, 0], d: -min[1] },
        { n: [0, 1, 0], d: max[1] },
        { n: [0, 0, -1], d: -m(min[2]) },
        { n: [0, 0, 1], d: m(max[2]) },
      ],
      material,
      opts,
    );
  }

  /** Gable roof over [x0,x1]×[y0,y1] with its ridge running along `axis`. */
  gable(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    zBase: number,
    zRidge: number,
    axis: "x" | "y",
    material: Material,
    opts?: ShapeOptions,
  ): void {
    const wb = m(zBase);
    const H = m(zRidge) - wb;
    const planes: Plane[] = [{ n: [0, 0, -1], d: -wb }];
    if (axis === "x") {
      const hw = (y1 - y0) / 2;
      const ym = (y0 + y1) / 2;
      planes.push(
        { n: [-1, 0, 0], d: -x0 },
        { n: [1, 0, 0], d: x1 },
        { n: [0, 1 / hw, 1 / H], d: 1 + ym / hw + wb / H },
        { n: [0, -1 / hw, 1 / H], d: 1 - ym / hw + wb / H },
      );
    } else {
      const hw = (x1 - x0) / 2;
      const xm = (x0 + x1) / 2;
      planes.push(
        { n: [0, -1, 0], d: -y0 },
        { n: [0, 1, 0], d: y1 },
        { n: [1 / hw, 0, 1 / H], d: 1 + xm / hw + wb / H },
        { n: [-1 / hw, 0, 1 / H], d: 1 - xm / hw + wb / H },
      );
    }
    this.convex(planes, material, opts);
  }

  /** Four-sided pyramid (hip roof / spire) over a rectangle. */
  pyramid(
    cx: number,
    cy: number,
    hx: number,
    hy: number,
    zBase: number,
    zApex: number,
    material: Material,
    opts?: ShapeOptions,
  ): void {
    const wb = m(zBase);
    const H = m(zApex) - wb;
    this.convex(
      [
        { n: [0, 0, -1], d: -wb },
        { n: [1 / hx, 0, 1 / H], d: 1 + cx / hx + wb / H },
        { n: [-1 / hx, 0, 1 / H], d: 1 - cx / hx + wb / H },
        { n: [0, 1 / hy, 1 / H], d: 1 + cy / hy + wb / H },
        { n: [0, -1 / hy, 1 / H], d: 1 - cy / hy + wb / H },
      ],
      material,
      opts,
    );
  }

  /**
   * Regular prism (cylinder approximation). `center` is the middle of the prism; `radius` is in
   * tiles; `halfLength` is in tiles for x/y axes and pixels for the z axis.
   */
  prism(
    axis: Axis,
    center: Vec3,
    radius: number,
    halfLength: number,
    material: Material,
    sides = 10,
    opts?: ShapeOptions,
  ): void {
    const c: Vec3 = [center[0], center[1], m(center[2])];
    const planes: Plane[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides + Math.PI / sides;
      const u = Math.cos(a);
      const v = Math.sin(a);
      const n: Vec3 = axis === "z" ? [u, v, 0] : axis === "x" ? [0, u, v] : [u, 0, v];
      planes.push({ n, d: radius + dot(n, c) });
    }
    const idx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const hl = axis === "z" ? m(halfLength) : halfLength;
    const lo: Vec3 = [0, 0, 0];
    const hi: Vec3 = [0, 0, 0];
    lo[idx] = -1;
    hi[idx] = 1;
    planes.push({ n: lo, d: -(c[idx] - hl) }, { n: hi, d: c[idx] + hl });
    this.convex(planes, material, opts);
  }

  /** Regular cone standing on `base` (x, y tiles, z px). */
  cone(
    base: Vec3,
    radius: number,
    heightPx: number,
    material: Material,
    sides = 12,
    opts?: ShapeOptions,
  ): void {
    const wb = m(base[2]);
    const H = m(heightPx);
    const planes: Plane[] = [{ n: [0, 0, -1], d: -wb }];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      const n: Vec3 = [Math.cos(a), Math.sin(a), radius / H];
      planes.push({ n, d: radius + n[0] * base[0] + n[1] * base[1] + (radius / H) * wb });
    }
    this.convex(planes, material, opts);
  }

  /** Ellipsoid centred at `center` (x, y tiles, z px) with radii [tiles, tiles, px]. */
  ellipsoid(center: Vec3, radii: Vec3, material: Material, opts: ShapeOptions = {}): void {
    let c: Vec3 = [center[0], center[1], m(center[2])];
    const xf = this.xform;
    if (xf) {
      const dx = c[0] - xf.pivot[0];
      const dy = c[1] - xf.pivot[1];
      c = [xf.pivot[0] + dx * xf.cos - dy * xf.sin, xf.pivot[1] + dx * xf.sin + dy * xf.cos, c[2]];
    }
    this.shapes.push(
      new Ellipsoid(c, [radii[0], radii[1], m(radii[2])], material, opts.castsShadow ?? true, xf),
    );
  }

  /**
   * Render into a canvas where world (0, 0, 0) lands on pixel (anchorX, anchorY).
   * `depthEdges` darkens pixels in front of a depth discontinuity to separate overlapping parts.
   */
  render(
    width: number,
    height: number,
    anchorX: number,
    anchorY: number,
    { outlines = true, depthEdges = true }: { outlines?: boolean; depthEdges?: boolean } = {},
  ): Canvas {
    const canvas = new Canvas(width, height);
    const depth = new Float32Array(width * height).fill(Infinity);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const sx = px + 0.5 - anchorX;
        const sy = py + 0.5 - anchorY;
        const a = sx / HALF_W;
        const b = (sy + RAY_START_HEIGHT * Z_SCALE) / HALF_H;
        const o: Vec3 = [(a + b) / 2, (b - a) / 2, RAY_START_HEIGHT];
        let best: Hit | null = null;
        let bestShape: Shape | null = null;
        for (const s of this.shapes) {
          const h = s.intersect(o, VIEW, 0);
          if (h && (!best || h.t < best.t)) {
            best = h;
            bestShape = s;
          }
        }
        if (best && bestShape) {
          const p = add(o, VIEW, best.t);
          const shadowed = this.occluded(p, best.n);
          const lightFor = (n: Vec3) =>
            Math.max(0, dot(normalize(n), LIGHT)) * (shadowed ? 0.3 : 1);
          const xf = bestShape.xform;
          const toLocal = (v: Vec3, point: boolean): Vec3 => {
            if (!xf) return v;
            const dx = point ? v[0] - xf.pivot[0] : v[0];
            const dy = point ? v[1] - xf.pivot[1] : v[1];
            const lx = dx * xf.cos + dy * xf.sin;
            const ly = -dx * xf.sin + dy * xf.cos;
            return point ? [lx + xf.pivot[0], ly + xf.pivot[1], v[2]] : [lx, ly, v[2]];
          };
          const lpm = toLocal(p, true);
          const color = bestShape.material({
            p: [p[0], p[1], p[2] * Z_SCALE],
            n: best.n,
            lp: [lpm[0], lpm[1], lpm[2] * Z_SCALE],
            ln: toLocal(best.n, false),
            light: lightFor(best.n),
            shadowed,
            px,
            py,
            lightFor,
          });
          if (color) {
            canvas.set(px, py, color);
            depth[py * width + px] = best.t;
          }
          continue;
        }
        const g = this.groundShadow;
        if (g) {
          const t = o[2] / -VIEW[2];
          const p = add(o, VIEW, t);
          if (p[0] >= g.x0 && p[0] <= g.x1 && p[1] >= g.y0 && p[1] <= g.y1) {
            if (this.occluded(p, [0, 0, 1])) canvas.set(px, py, [14, 30, 24, this.shadowAlpha]);
          }
        }
      }
    }
    if (depthEdges) {
      const edges: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const t = depth[i]!;
          if (!Number.isFinite(t)) continue;
          const behind = (j: number) => Number.isFinite(depth[j]!) && depth[j]! - t > 0.32;
          if (
            (x > 0 && behind(i - 1)) ||
            (x < width - 1 && behind(i + 1)) ||
            (y > 0 && behind(i - width)) ||
            (y < height - 1 && behind(i + width))
          ) {
            edges.push(i);
          }
        }
      }
      for (const i of edges) {
        const x = i % width;
        const y = Math.floor(i / width);
        const [r, g, b, al] = canvas.get(x, y);
        canvas.set(x, y, [r * 0.62 + 10, g * 0.62 + 10, b * 0.62 + 12, al]);
      }
    }
    if (outlines) outline(canvas);
    return canvas;
  }

  private occluded(p: Vec3, n: Vec3): boolean {
    if (dot(n, LIGHT) <= 0) return false;
    const origin = add(p, n, 1e-3);
    for (const s of this.shapes) {
      if (s.castsShadow && s.intersect(origin, LIGHT, 1e-4)) return true;
    }
    return false;
  }
}

/** Pixel position of world (x, y, zPx) relative to the sprite anchor. */
export function project(x: number, y: number, zPx = 0): { x: number; y: number } {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - zPx };
}

// Surface materials for ray-cast sprites. Each maps a hit to a palette colour.
import { noise3, hash3 } from "./noise3";
import { rampColor, shade, type RampName, type Rgba } from "./palette";
import { lit, type Material, type ShadeContext } from "./raytrace";

/**
 * Courses of shingles, planks and bricks are this much finer than they were at the world's own
 * pixel density: with `SPRITE_RES` texels to the world pixel the art can carry smaller detail.
 */
export const FINE = 0.6;
const frac = (v: number): number => v - Math.floor(v);

/** Streaks of rain and grime running down a wall, and darker damp near the ground. */
function weather(u: number, z: number): number {
  const streak = noise3(u * 34, z * 0.07, 0.6, 41);
  return (streak - 0.5) * 0.1 - (z < 9 ? ((9 - z) / 9) * 0.08 : 0);
}

export type Face = "+x" | "-x" | "+y" | "-y" | "top" | "bottom";

export function faceOf(c: ShadeContext): Face {
  const [x, y, z] = c.ln;
  if (z > 0.7) return "top";
  if (z < -0.7) return "bottom";
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? "+x" : "-x";
  return y > 0 ? "+y" : "-y";
}

/** Horizontal coordinate along a wall face (tiles). */
function along(c: ShadeContext): number {
  const f = faceOf(c);
  return f === "+x" || f === "-x" ? c.lp[1] : c.lp[0];
}

export function straw(rampName: RampName = "thatch", rowPx = 3): Material {
  const rp = rowPx * FINE;
  return (c) => {
    const z = c.lp[2];
    const row = Math.floor(z / rp);
    const u = along(c) + c.lp[0] * 0.3;
    // Bundles of straw, and single straws within them.
    const streak = noise3(u * 44, row * 1.7, 0.5, 11);
    const single = noise3(u * 110, z * 0.8, 1.3, 12);
    const within = (z - row * rp) / rp;
    const lip = within < 0.22 ? -0.17 : within > 0.86 ? 0.06 : 0;
    return shade(
      rampName,
      lit(c, lip + (streak - 0.5) * 0.3 + (single - 0.5) * 0.16),
      c.px,
      c.py,
      0.25,
    );
  };
}

export function shingles(rampName: RampName = "slate", rowPx = 3, width = 0.16): Material {
  const rp = rowPx * FINE;
  const w = width * FINE;
  return (c) => {
    const z = c.lp[2];
    const row = Math.floor(z / rp);
    const u = c.lp[0] + c.lp[1] + (row % 2) * w * 0.5;
    const col = Math.floor(u / w);
    const within = (z - row * rp) / rp;
    const seam = frac(u / w);
    // Each shingle overlaps the one below: a shadow under its lower edge, a glint on its upper one.
    let edge = within < 0.24 ? -0.2 : within > 0.84 ? 0.08 : 0;
    if (seam < 0.09 || seam > 0.97) edge -= 0.13;
    // Tabs are rounded at the bottom corners.
    if (within < 0.4 && (seam < 0.16 || seam > 0.86)) edge -= 0.06;
    const tint = (hash3(col, row, 3) - 0.5) * 0.17;
    // The odd weathered patch of moss on old slate.
    if (rampName === "slate" && c.n[2] > 0.35 && hash3(col, row, 8) > 0.99 && within > 0.3)
      return shade("moss", lit(c, -0.12 + tint), c.px, c.py, 0.2);
    return shade(rampName, lit(c, edge + tint), c.px, c.py, 0.2);
  };
}

/** Wooden planks; `dir` is the axis the planks run along. */
export function planks(
  rampName: RampName = "plank",
  dir: "x" | "y" | "z" = "x",
  pitch = 0.1,
): Material {
  const pt = pitch * FINE;
  return (c) => {
    const f = faceOf(c);
    let across: number;
    let along_: number;
    if (f === "top" || f === "bottom") {
      across = dir === "x" ? c.lp[1] : c.lp[0];
      along_ = dir === "x" ? c.lp[0] : c.lp[1];
    } else if (dir === "z") {
      across = along(c);
      along_ = c.lp[2] / 19.6;
    } else {
      across = c.lp[2] / 19.6;
      along_ = along(c);
    }
    const k = across / pt;
    const board = Math.floor(k);
    const inBoard = frac(k);
    const seam = inBoard < 0.14 ? -0.18 : inBoard > 0.9 ? 0.05 : 0;
    // Boards are cut to length: a butt joint here and there, and a nail near each end.
    const len = 0.5 + hash3(board, 0, 0, 6) * 0.4;
    const run = frac(along_ / len + hash3(board, 1, 0, 6));
    const joint = run < 0.03 ? -0.16 : 0;
    const nail = (run < 0.09 || run > 0.93) && inBoard > 0.42 && inBoard < 0.58 ? -0.12 : 0;
    const grain = (noise3(along_ * 18, board * 1.3, 0.5, 5) - 0.5) * 0.14;
    const tint = (hash3(board, 0, 0, 5) - 0.5) * 0.14;
    return shade(rampName, lit(c, seam + joint + nail + grain + tint), c.px, c.py, 0.2);
  };
}

export function bricks(rampName: RampName = "stone", rowPx = 3.2, width = 0.2): Material {
  const rp = rowPx * FINE;
  const w = width * FINE;
  return (c) => {
    const f = faceOf(c);
    if (f === "top") {
      const n = noise3(c.lp[0] * 14, c.lp[1] * 14, 1, 4);
      const fine = noise3(c.lp[0] * 40, c.lp[1] * 40, 2, 6);
      return shade(rampName, lit(c, (n - 0.5) * 0.25 + (fine - 0.5) * 0.1), c.px, c.py);
    }
    const z = c.lp[2];
    const row = Math.floor(z / rp);
    const u = along(c) + (row % 2) * w * 0.5;
    const col = Math.floor(u / w);
    const within = (z - row * rp) / rp;
    const mortar = within < 0.16 || frac(u / w) < 0.08;
    if (mortar) return shade(rampName, lit(c, -0.28), c.px, c.py, 0.15);
    // Each block is lit along its top edge, and a few are chipped or stained.
    const glint = within > 0.84 ? 0.06 : 0;
    const chip = hash3(col, row, 1, 9) > 0.965 ? -0.13 : 0;
    const tint = (hash3(col, row, 0, 9) - 0.5) * 0.22;
    const pit = (noise3(u * 60, z * 1.5, 0.4, 10) - 0.5) * 0.08;
    return shade(rampName, lit(c, glint + chip + tint + pit), c.px, c.py, 0.2);
  };
}

/**
 * Flagstones for floors: slabs in running bond with dark joints, a lit edge on the upper left,
 * a shaded edge on the lower right, and the odd tint, hairline crack or chipped corner. The
 * pattern repeats every tile (joints every `slab`, rows offset by half a slab), so floor tiles
 * made from it line up.
 */
export function flagstones(rampName: RampName = "stone", slab = 0.5): Material {
  const jw = 0.05;
  return (c) => {
    if (faceOf(c) !== "top") return shade(rampName, lit(c, -0.12), c.px, c.py, 0.2);
    const u = c.lp[0];
    const v = c.lp[1];
    const row = Math.floor(v / slab);
    const odd = ((row % 2) + 2) % 2;
    const uu = u + odd * slab * 0.5;
    const col = Math.floor(uu / slab);
    const ju = uu - col * slab;
    const jv = v - row * slab;
    if (ju < jw || jv < jw) return shade(rampName, lit(c, -0.34), c.px, c.py, 0.15);
    const edge =
      ju < jw * 2.4 || jv < jw * 2.4
        ? 0.08
        : slab - ju < jw * 1.8 || slab - jv < jw * 1.8
          ? -0.08
          : 0;
    const tint = (hash3(col, row, 0, 61) - 0.5) * 0.26;
    const grain = (noise3(u * 44, v * 44, 0.5, 62) - 0.5) * 0.1;
    const crack = noise3(u * 13 + col, v * 13 + row, 1.3, 63) < 0.05 ? -0.16 : 0;
    const chip = hash3(col, row, 1, 64) > 0.94 && ju < 0.13 && jv < 0.13 ? -0.2 : 0;
    return shade(rampName, lit(c, 0.04 + edge + tint + grain + crack + chip), c.px, c.py, 0.25);
  };
}

export function rocky(rampName: RampName = "rock", scale = 7, moss = 0): Material {
  return (c) => {
    const n = noise3(c.p[0] * scale, c.p[1] * scale, c.p[2] / 4, 21);
    const crack =
      noise3(c.p[0] * scale * 2.3, c.p[1] * scale * 2.3, c.p[2] / 2, 5) < 0.18 ? -0.2 : 0;
    // A finer layer of grit and hairline cracks, which the denser pixels can show.
    const grit = noise3(c.p[0] * scale * 4.1, c.p[1] * scale * 4.1, c.p[2] / 1.1, 33);
    const hair =
      noise3(c.p[0] * scale * 5.3, c.p[1] * scale * 5.3, c.p[2] / 0.9, 34) < 0.1 ? -0.1 : 0;
    if (moss > 0 && c.n[2] > 0.55 && n > 1 - moss) {
      const tuft = noise3(c.p[0] * 40, c.p[1] * 40, 0.5, 35) - 0.5;
      return shade("moss", lit(c, -0.05 + tuft * 0.2), c.px, c.py);
    }
    return shade(
      rampName,
      lit(c, (n - 0.5) * 0.3 + crack + (grit - 0.5) * 0.12 + hair),
      c.px,
      c.py,
      0.3,
    );
  };
}

export interface Opening {
  face: "+x" | "+y";
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  kind: "door" | "window" | "lit-window" | "arch";
}

/** The stone footing of a wall: rough blocks in courses, chipped here and there. */
function plinthStone(c: ShadeContext, u: number, z: number, ramp: RampName = "stone"): Rgba {
  const row = Math.floor(z / 1.6);
  const v = u + (row % 2) * 0.05;
  const col = Math.floor(v / 0.1);
  const joint = frac(z / 1.6) < 0.2 || frac(v / 0.1) < 0.1;
  const tint = (hash3(col, row, 0, 2) - 0.5) * 0.24;
  return shade(ramp, lit(c, (joint ? -0.24 : 0.02) + tint), c.px, c.py, 0.2);
}

/**
 * A door or window in a wall, at the finest detail the pixels allow: doors have boards, iron
 * hinges, a handle, a heavy lintel and a step; windows have a frame, a sill, a lintel and
 * mullions that divide the glass into panes, with a glint across dark glass.
 */
function paintOpening(c: ShadeContext, o: Opening, u: number, z: number, frame: RampName): Rgba {
  const w = o.u1 - o.u0;
  const h = o.z1 - o.z0;
  const edge = Math.min(u - o.u0, o.u1 - u);
  const lintel = o.z1 - z < 1.6;
  if (o.kind === "arch") return rampColor("timber", 0);
  if (o.kind === "door") {
    if (z - o.z0 < 0.8) return shade("stone", lit(c, 0.05), c.px, c.py, 0.2);
    if (lintel) return rampColor(frame, 0);
    if (edge < 0.03) return rampColor(frame, 1);
    const k = (u - o.u0) / 0.05;
    const board = Math.floor(k);
    const seam = frac(k) < 0.16 ? -0.16 : 0;
    const tint = (hash3(board, 0, 0, 23) - 0.5) * 0.14;
    // Iron hinges on the left, a ring handle on the right.
    const hinge =
      u - o.u0 < w * 0.4 && [0.24, 0.74].some((f) => Math.abs(z - (o.z0 + h * f)) < 0.7);
    if (hinge) return rampColor("rock", 1);
    if (o.u1 - u < 0.045 && u < o.u1 - 0.025 && Math.abs(z - (o.z0 + h * 0.45)) < 0.75)
      return rampColor("gold", 3);
    return shade("plank", lit(c, -0.1 + seam + tint), c.px, c.py, 0.2);
  }
  // Windows.
  if (z - o.z0 < 1.3) return z - o.z0 < 0.5 ? rampColor("stone", 1) : rampColor("stone", 3);
  if (lintel) return rampColor(frame, 0);
  if (edge < 0.03) return rampColor(frame, 1);
  const mid = (o.u0 + o.u1) / 2;
  if (w > 0.12 && Math.abs(u - mid) < 0.012) return rampColor(frame, 1);
  if (h > 6 && Math.abs(z - (o.z0 + h * 0.5)) < 0.45) return rampColor(frame, 1);
  if (o.kind === "lit-window") return rampColor("glass", z > (o.z0 + o.z1) / 2 ? 3 : 2);
  // Dark glass with a slanting glint.
  return rampColor("glass", frac((u - o.u0) * 26 + (z - o.z0) * 0.42) < 0.16 ? 1 : 0);
}

/**
 * Plaster walls with exposed timber framing, like the cottages in the concept art.
 * `posts` are positions (tiles, along each face) of vertical beams.
 */
export function timberFrame(opts: {
  top: number;
  posts: number[];
  beamPx?: number;
  plinthPx?: number;
  openings?: Opening[];
  wall?: RampName;
  frame?: RampName;
  braces?: boolean;
}): Material {
  const beam = 0.045;
  const beamPx = opts.beamPx ?? 1.4;
  const plinth = opts.plinthPx ?? 3;
  const wall = opts.wall ?? "plaster";
  const frame = opts.frame ?? "timber";
  return (c) => {
    const f = faceOf(c);
    const z = c.lp[2];
    if (f === "top" || f === "bottom") return shade(frame, lit(c), c.px, c.py);
    const u = along(c);
    for (const o of opts.openings ?? []) {
      if (o.face !== f || u < o.u0 || u > o.u1 || z < o.z0 || z > o.z1) continue;
      return paintOpening(c, o, u, z, frame);
    }
    if (z < plinth) return plinthStone(c, u, z);
    const nearPost = opts.posts.some((p) => Math.abs(u - p) < beam);
    const nearBeam = z < plinth + beamPx || Math.abs(z - opts.top) < beamPx + 0.5;
    let brace = false;
    if (opts.braces) {
      for (let i = 0; i + 1 < opts.posts.length; i++) {
        const a = opts.posts[i]!;
        const b = opts.posts[i + 1]!;
        if (u <= a || u >= b) continue;
        const t = (u - a) / (b - a);
        const zLine = plinth + (opts.top - plinth) * (i % 2 === 0 ? t : 1 - t);
        if (Math.abs(z - zLine) < 1.2) brace = true;
      }
    }
    if (nearPost || nearBeam || brace) return shade(frame, lit(c, -0.05), c.px, c.py, 0.1);
    const n = noise3(u * 30, z / 2.5, 0.2, 13);
    const fine = noise3(u * 90, z / 0.9, 0.7, 43);
    return shade(
      wall,
      lit(c, 0.06 + (n - 0.5) * 0.1 + (fine - 0.5) * 0.07 + weather(u, z)),
      c.px,
      c.py,
      0.2,
    );
  };
}

export function cloth(rampName: RampName, bulge = 0.35): Material {
  return (c) => {
    // Billow: tilt the normal with a smooth wave across the cloth.
    const u = along(c);
    const wave = Math.sin(u * 18 + c.lp[2] * 0.12) * bulge;
    const n: [number, number, number] = [
      c.n[0] + wave * 0.5,
      c.n[1] - wave * 0.5,
      c.n[2] + wave * 0.3,
    ];
    const light = c.lightFor(n);
    const seam = (u * 9) % 1 < 0.08 ? -0.08 : 0;
    return shade(rampName, 0.3 + 0.7 * light + seam, c.px, c.py, 0.3);
  };
}

export function solid(color: Rgba): Material {
  return () => color;
}

/** A wall surface: colour for a point `u` along the wall and `z` pixels up. */
export type Surface = (c: ShadeContext, u: number, z: number) => Rgba;

/**
 * Wraps a wall surface with doors, windows and a stone plinth, the same way for every tribe.
 * Tops and bottoms of the box get the frame colour.
 */
export function withOpenings(
  surface: Surface,
  opts: { openings?: Opening[]; frame: RampName; plinthPx?: number; plinth?: RampName },
): Material {
  const plinth = opts.plinthPx ?? 3;
  return (c) => {
    const f = faceOf(c);
    const z = c.lp[2];
    if (f === "top" || f === "bottom") return shade(opts.frame, lit(c), c.px, c.py);
    const u = along(c);
    for (const o of opts.openings ?? []) {
      if (o.face !== f || u < o.u0 || u > o.u1 || z < o.z0 || z > o.z1) continue;
      return paintOpening(c, o, u, z, opts.frame);
    }
    if (z < plinth) return plinthStone(c, u, z, opts.plinth);
    return surface(c, u, z);
  };
}

/** Horizontal logs with dark seams (Northfolk). */
export function logSurface(ramp: RampName = "logs", rowPx = 3.2): Surface {
  const rp = rowPx * FINE * 1.25;
  return (c, u, z) => {
    const row = Math.floor(z / rp);
    const within = (z - row * rp) / rp;
    // Round logs: dark where two meet, lit across the belly, ends showing at the corners.
    const seam = within < 0.2 ? -0.24 : within > 0.6 && within < 0.8 ? 0.06 : 0;
    const grain = (noise3(u * 40, row * 2.1, 0.5, 12) - 0.5) * 0.16;
    const knot = hash3(row, Math.floor(u * 9), 0, 12) > 0.965 ? -0.16 : 0;
    return shade(ramp, lit(c, 0.08 + seam + grain + knot + weather(u, z) * 0.6), c.px, c.py, 0.2);
  };
}

/** Smooth sun-baked adobe with a darker band under the roof line (Sunfolk). */
export function adobeSurface(top: number): Surface {
  return (c, u, z) => {
    const n = noise3(u * 18, z / 3, 0.4, 14);
    const fine = noise3(u * 80, z / 0.9, 0.9, 44);
    const band = top - z < 2.2 ? -0.18 : 0;
    // Hairline cracks and patches where the plaster has flaked.
    const crack = noise3(u * 26, z / 1.4, 2.2, 45) < 0.06 ? -0.12 : 0;
    return shade(
      "adobe",
      lit(c, 0.08 + band + (n - 0.5) * 0.12 + (fine - 0.5) * 0.08 + crack + weather(u, z) * 0.7),
      c.px,
      c.py,
      0.25,
    );
  };
}

/** Living bark with vertical grain and moss near the ground (Sylvan). */
export function barkSurface(): Surface {
  return (c, u, z) => {
    const grain = hash3(Math.floor(u * 70), 0, 0, 15) < 0.3 ? -0.16 : 0;
    const ridge = (noise3(u * 30, z / 5, 0.3, 46) - 0.5) * 0.14;
    const mossy = z < 6 && noise3(u * 34, z * 1.2, 0.2, 16) > 0.5;
    if (mossy)
      return shade("moss", lit(c, (noise3(u * 90, z * 2, 0.5, 47) - 0.5) * 0.2), c.px, c.py);
    return shade("bark", lit(c, 0.1 + grain + ridge), c.px, c.py, 0.2);
  };
}

/** Pale mushroom stalk with fine vertical fibres, darker near the ground (Glowkin). */
export function stalkSurface(): Surface {
  return (c, u, z) => {
    const fibre = hash3(Math.floor(u * 84), 0, 0, 17) < 0.25 ? -0.12 : 0;
    const ring = frac(z / 4.5 + hash3(0, 0, 0, 48) * 3) < 0.1 ? -0.08 : 0;
    const damp = z < 6 ? -0.12 : 0;
    return shade("stalk", lit(c, 0.04 + fibre + damp + ring), c.px, c.py, 0.2);
  };
}

/** Upright bamboo canes with dark joints (Freebooters). */
export function bambooSurface(): Surface {
  return (c, u, z) => {
    const k = u / (0.075 * FINE * 1.3);
    const cane = Math.floor(k);
    // Round canes: a lit stripe down each, dark where they meet, and knuckled joints.
    const edge = frac(k) < 0.2 ? -0.22 : frac(k) > 0.4 && frac(k) < 0.6 ? 0.07 : 0;
    const joint = (z + hash3(cane, 0, 0, 18) * 5) % 5 < 0.6 ? -0.2 : 0;
    return shade("sand", lit(c, -0.08 + edge + joint + weather(u, z) * 0.5), c.px, c.py, 0.2);
  };
}

/** Weathered upright boards, dark and mossy where the bog water reaches (Mirefolk). */
export function boardSurface(ramp: RampName = "darkwood"): Surface {
  return (c, u, z) => {
    const k = u / (0.09 * FINE * 1.2);
    const seam = frac(k) < 0.14 ? -0.2 : 0;
    const grain =
      (hash3(Math.floor(k), 0, 0, 19) - 0.5) * 0.16 + (noise3(k * 2, z / 2, 0.5, 49) - 0.5) * 0.1;
    if (z < 7 && noise3(u * 34, z * 1.3, 0.3, 20) > 0.45)
      return shade("moss", lit(c, -0.1 + (noise3(u * 90, z * 2, 0.5, 50) - 0.5) * 0.2), c.px, c.py);
    return shade(ramp, lit(c, 0.12 + seam + grain + weather(u, z) * 0.6), c.px, c.py, 0.2);
  };
}

/** Rough basalt blocks with lava glowing in the joints (Cinderborn). */
export function basaltSurface(rowPx = 4, width = 0.24): Surface {
  const rp = rowPx * FINE;
  const w = width * FINE;
  return (c, u, z) => {
    const row = Math.floor(z / rp);
    const v = u + (row % 2) * w * 0.5;
    const col = Math.floor(v / w);
    const within = (z - row * rp) / rp;
    const joint = within < 0.14 || frac(v / w) < 0.07;
    if (joint) return rampColor("lava", hash3(col, row, 0, 21) > 0.6 ? 4 : 3);
    // Glassy blocks with a glint on their upper edge, and a warm glow creeping in from the joints.
    const near = within < 0.3 || frac(v / w) < 0.16 ? 0.05 : 0;
    const glint = within > 0.85 ? 0.09 : 0;
    const tint = (hash3(col, row, 0, 22) - 0.5) * 0.25;
    return shade("basalt", lit(c, 0.18 + tint + glint + near), c.px, c.py, 0.25);
  };
}

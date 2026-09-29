// Surface materials for ray-cast sprites. Each maps a hit to a palette colour.
import { noise3, hash3 } from "./noise3";
import { rampColor, shade, type RampName, type Rgba } from "./palette";
import { lit, type Material, type ShadeContext } from "./raytrace";

export type Face = "+x" | "-x" | "+y" | "-y" | "top" | "bottom";

export function faceOf(c: ShadeContext): Face {
  const [x, y, z] = c.ln;
  if (z > 0.7) return "top";
  if (z < -0.7) return "bottom";
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? "+x" : "-x";
  return y > 0 ? "+y" : "-y";
}

/** Horizontal coordinate along a wall face (tiles). */
export function along(c: ShadeContext): number {
  const f = faceOf(c);
  return f === "+x" || f === "-x" ? c.lp[1] : c.lp[0];
}

export function straw(rampName: RampName = "thatch", rowPx = 3): Material {
  return (c) => {
    const z = c.lp[2];
    const row = Math.floor(z / rowPx);
    const u = along(c) + c.lp[0] * 0.3;
    const streak = noise3(u * 26, row * 1.7, 0.5, 11);
    const lip = z - row * rowPx < 0.9 ? -0.16 : 0;
    return shade(rampName, lit(c, lip + (streak - 0.5) * 0.3), c.px, c.py, 0.25);
  };
}

export function shingles(rampName: RampName = "slate", rowPx = 3, width = 0.16): Material {
  return (c) => {
    const z = c.lp[2];
    const row = Math.floor(z / rowPx);
    const u = (c.lp[0] + c.lp[1]) / 1 + (row % 2) * width * 0.5;
    const seam = (u / width) % 1;
    const gap = z - row * rowPx < 0.9 || seam < 0.12 ? -0.14 : 0;
    const tint = (hash3(Math.floor(u / width), row, 3) - 0.5) * 0.12;
    return shade(rampName, lit(c, gap + tint), c.px, c.py, 0.2);
  };
}

/** Wooden planks; `dir` is the axis the planks run along. */
export function planks(
  rampName: RampName = "plank",
  dir: "x" | "y" | "z" = "x",
  pitch = 0.1,
): Material {
  return (c) => {
    const f = faceOf(c);
    let across: number;
    if (f === "top" || f === "bottom") across = dir === "x" ? c.lp[1] : c.lp[0];
    else if (dir === "z") across = along(c);
    else across = c.lp[2] / 19.6;
    const k = across / pitch;
    const seam = k - Math.floor(k) < 0.18 ? -0.16 : 0;
    const grain = (hash3(Math.floor(k), 0, 0, 5) - 0.5) * 0.14;
    return shade(rampName, lit(c, seam + grain), c.px, c.py, 0.2);
  };
}

export function bricks(rampName: RampName = "stone", rowPx = 3.2, width = 0.2): Material {
  return (c) => {
    const f = faceOf(c);
    if (f === "top") {
      const n = noise3(c.lp[0] * 9, c.lp[1] * 9, 1, 4);
      return shade(rampName, lit(c, (n - 0.5) * 0.25), c.px, c.py);
    }
    const z = c.lp[2];
    const row = Math.floor(z / rowPx);
    const u = along(c) + (row % 2) * width * 0.5;
    const col = Math.floor(u / width);
    const mortar = z - row * rowPx < 0.8 || (u / width) % 1 < 0.1 ? -0.2 : 0;
    const tint = (hash3(col, row, 0, 9) - 0.5) * 0.2;
    return shade(rampName, lit(c, mortar + tint), c.px, c.py, 0.2);
  };
}

export function rocky(rampName: RampName = "rock", scale = 7, moss = 0): Material {
  return (c) => {
    const n = noise3(c.p[0] * scale, c.p[1] * scale, c.p[2] / 4, 21);
    const crack =
      noise3(c.p[0] * scale * 2.3, c.p[1] * scale * 2.3, c.p[2] / 2, 5) < 0.18 ? -0.2 : 0;
    if (moss > 0 && c.n[2] > 0.55 && n > 1 - moss) {
      return shade("moss", lit(c, -0.05), c.px, c.py);
    }
    return shade(rampName, lit(c, (n - 0.5) * 0.3 + crack), c.px, c.py, 0.3);
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
      const border = u - o.u0 < 0.035 || o.u1 - u < 0.035 || o.z1 - z < 1;
      if (o.kind === "door") {
        const k = (u - o.u0) / 0.075;
        const seam = k - Math.floor(k) < 0.25 ? -0.12 : 0;
        return border ? rampColor(frame, 1) : shade("plank", lit(c, -0.1 + seam), c.px, c.py);
      }
      if (o.kind === "arch") return rampColor("timber", 0);
      if (border || z - o.z0 < 0.8) return rampColor(frame, 1);
      if (o.kind === "lit-window") return rampColor("glass", z > (o.z0 + o.z1) / 2 ? 3 : 2);
      return rampColor("glass", 1);
    }
    if (z < plinth) {
      return shade("stone", lit(c, (hash3(Math.floor(u * 8), 0, 0, 2) - 0.5) * 0.2), c.px, c.py);
    }
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
    return shade(wall, lit(c, 0.06 + (n - 0.5) * 0.1), c.px, c.py, 0.2);
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
      const border = u - o.u0 < 0.035 || o.u1 - u < 0.035 || o.z1 - z < 1;
      if (o.kind === "door") {
        const k = (u - o.u0) / 0.075;
        const seam = k - Math.floor(k) < 0.25 ? -0.12 : 0;
        return border ? rampColor(opts.frame, 1) : shade("plank", lit(c, -0.1 + seam), c.px, c.py);
      }
      if (o.kind === "arch") return rampColor("timber", 0);
      if (border || z - o.z0 < 0.8) return rampColor(opts.frame, 1);
      if (o.kind === "lit-window") return rampColor("glass", z > (o.z0 + o.z1) / 2 ? 3 : 2);
      return rampColor("glass", 1);
    }
    if (z < plinth) {
      return shade(
        opts.plinth ?? "stone",
        lit(c, (hash3(Math.floor(u * 8), 0, 0, 2) - 0.5) * 0.2),
        c.px,
        c.py,
      );
    }
    return surface(c, u, z);
  };
}

/** Horizontal logs with dark seams (Northfolk). */
export function logSurface(ramp: RampName = "logs", rowPx = 3.2): Surface {
  return (c, u, z) => {
    const row = Math.floor(z / rowPx);
    const seam = z - row * rowPx < 0.9 ? -0.22 : 0;
    const grain = (hash3(row, Math.floor(u * 6), 0, 12) - 0.5) * 0.12;
    return shade(ramp, lit(c, 0.08 + seam + grain), c.px, c.py, 0.2);
  };
}

/** Smooth sun-baked adobe with a darker band under the roof line (Sunfolk). */
export function adobeSurface(top: number): Surface {
  return (c, u, z) => {
    const n = noise3(u * 18, z / 3, 0.4, 14);
    const band = top - z < 2.2 ? -0.18 : 0;
    return shade("adobe", lit(c, 0.08 + band + (n - 0.5) * 0.12), c.px, c.py, 0.25);
  };
}

/** Living bark with vertical grain and moss near the ground (Sylvan). */
export function barkSurface(): Surface {
  return (c, u, z) => {
    const grain = hash3(Math.floor(u * 38), 0, 0, 15) < 0.3 ? -0.16 : 0;
    const mossy = z < 5 && noise3(u * 20, z, 0.2, 16) > 0.5;
    if (mossy) return shade("moss", lit(c, 0), c.px, c.py);
    return shade("bark", lit(c, 0.1 + grain), c.px, c.py, 0.2);
  };
}

/** Pale mushroom stalk with fine vertical fibres, darker near the ground (Glowkin). */
export function stalkSurface(): Surface {
  return (c, u, z) => {
    const fibre = hash3(Math.floor(u * 44), 0, 0, 17) < 0.25 ? -0.12 : 0;
    const damp = z < 5 ? -0.12 : 0;
    return shade("stalk", lit(c, 0.04 + fibre + damp), c.px, c.py, 0.2);
  };
}

/** Upright bamboo canes with dark joints (Freebooters). */
export function bambooSurface(): Surface {
  return (c, u, z) => {
    const k = u / 0.075;
    const edge = k - Math.floor(k) < 0.22 ? -0.2 : 0;
    const joint = (z + hash3(Math.floor(k), 0, 0, 18) * 5) % 6 < 0.9 ? -0.18 : 0;
    return shade("sand", lit(c, -0.08 + edge + joint), c.px, c.py, 0.2);
  };
}

/** Weathered upright boards, dark and mossy where the bog water reaches (Mirefolk). */
export function boardSurface(ramp: RampName = "darkwood"): Surface {
  return (c, u, z) => {
    const k = u / 0.09;
    const seam = k - Math.floor(k) < 0.18 ? -0.18 : 0;
    const grain = (hash3(Math.floor(k), 0, 0, 19) - 0.5) * 0.16;
    if (z < 6 && noise3(u * 22, z, 0.3, 20) > 0.45) return shade("moss", lit(c, -0.1), c.px, c.py);
    return shade(ramp, lit(c, 0.12 + seam + grain), c.px, c.py, 0.2);
  };
}

/** Rough basalt blocks with lava glowing in the joints (Cinderborn). */
export function basaltSurface(rowPx = 4, width = 0.24): Surface {
  return (c, u, z) => {
    const row = Math.floor(z / rowPx);
    const v = u + (row % 2) * width * 0.5;
    const col = Math.floor(v / width);
    const joint = z - row * rowPx < 0.8 || (v / width) % 1 < 0.08;
    if (joint) return rampColor("lava", hash3(col, row, 0, 21) > 0.6 ? 4 : 3);
    const tint = (hash3(col, row, 0, 22) - 0.5) * 0.25;
    return shade("basalt", lit(c, 0.18 + tint), c.px, c.py, 0.25);
  };
}

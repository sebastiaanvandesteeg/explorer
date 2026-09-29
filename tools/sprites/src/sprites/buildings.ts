// Buildings in four tribal styles. Each style supplies wall and roof materials and a roof shape;
// the building recipes below compose walls, roofs, towers and props from the style.
// Names: b_<kind>_<tribe> (farms: b_farm_<stage>_<tribe>); docks and scaffolds are shared.
import { TRIBES, type TribeId } from "@explorer/shared";
import {
  adobeSurface,
  barkSurface,
  bricks,
  logSurface,
  planks,
  rocky,
  shingles,
  straw,
  timberFrame,
  withOpenings,
  type Opening,
} from "../materials";
import { hash3, prng } from "../noise3";
import { rampColor, shade, type RampName } from "../palette";
import { flat, lit, project, Scene, type Material, type Vec3 } from "../raytrace";
import { renderSprite, type Sprite } from "../sprite";
import { canopy, dots, foliage, strand } from "./nature";

type RoofKind = "gable" | "steep" | "flat" | "leafy";

interface Style {
  tribe: TribeId;
  wall(top: number, openings: Opening[], posts: number[]): Material;
  roofKind: RoofKind;
  roof: Material;
  hallRoof: Material;
  gableFill(top: number): Material;
  trim: Material;
  wood: RampName;
  base: Material;
  banner: RampName;
  /** Awning stripes. */
  accent: RampName;
  chimney: boolean;
}

const STYLES: Record<TribeId, Style> = {
  islanders: {
    tribe: "islanders",
    wall: (top, openings, posts) => timberFrame({ top, posts, braces: true, openings }),
    roofKind: "gable",
    roof: straw(),
    hallRoof: shingles("slate"),
    gableFill: (top) => timberFrame({ top, posts: [0.7, 1.3, 1.9] }),
    trim: flat("timber"),
    wood: "plank",
    base: bricks("stone", 2, 0.2),
    banner: "cloth",
    accent: "cloth",
    chimney: true,
  },
  northfolk: {
    tribe: "northfolk",
    wall: (_top, openings) => withOpenings(logSurface("logs"), { openings, frame: "darkwood" }),
    roofKind: "steep",
    roof: shingles("darkwood", 2.5, 0.14),
    hallRoof: shingles("darkwood", 2.5, 0.14),
    gableFill: () => planks("darkwood", "z", 0.09),
    trim: flat("darkwood", 0.05),
    wood: "logs",
    base: bricks("stone", 2.5, 0.25),
    banner: "clothRed",
    accent: "clothRed",
    chimney: true,
  },
  sunfolk: {
    tribe: "sunfolk",
    wall: (top, openings) =>
      withOpenings(adobeSurface(top), { openings, frame: "dome", plinth: "sandstone" }),
    roofKind: "flat",
    roof: (c) => shade("adobe", lit(c, 0.12), c.px, c.py, 0.2),
    hallRoof: (c) => shade("adobe", lit(c, 0.12), c.px, c.py, 0.2),
    gableFill: (top) => withOpenings(adobeSurface(top), { frame: "dome" }),
    trim: flat("sandstone", 0.05),
    wood: "plank",
    base: bricks("sandstone", 2.5, 0.22),
    banner: "clothBlue",
    accent: "clothBlue",
    chimney: false,
  },
  sylvan: {
    tribe: "sylvan",
    wall: (_top, openings) =>
      withOpenings(barkSurface(), { openings, frame: "bark", plinth: "rock" }),
    roofKind: "leafy",
    roof: foliage("blossomGround", 8, dots("petal", 0.1, 51, 0.3), 1.2, 0.02),
    hallRoof: foliage("petal", 8, dots("plaster", 0.05, 52, 0.4), 1.1, 0),
    gableFill: () => withOpenings(barkSurface(), { frame: "bark" }),
    trim: flat("bark", 0.05),
    wood: "bark",
    base: rocky("rock", 8, 0.4),
    banner: "clothGreen",
    accent: "clothGreen",
    chimney: false,
  },
};

const at = (x: number, y: number, z: number) => project(x, y, z);

/**
 * A roof over a wall rectangle, shaped by the tribe: gable, steep gable with carved ridge
 * horns, flat with a crenellated parapet, or a leafy mound. Returns the roof's top (px).
 */
function roof(
  s: Scene,
  st: Style,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  zBase: number,
  rise: number,
  axis: "x" | "y",
  mat: Material = st.roof,
): number {
  const oh = 0.14;
  switch (st.roofKind) {
    case "gable":
    case "steep": {
      const r = st.roofKind === "steep" ? rise * 1.35 : rise;
      s.gable(x0, y0, x1, y1, zBase, zBase + r - 3, axis, st.gableFill(zBase + r - 3));
      s.gable(x0 - oh, y0 - oh, x1 + oh, y1 + oh, zBase - 1, zBase + r, axis, mat);
      if (st.roofKind === "steep") {
        // Crossed ridge boards ending in carved horns at both gable ends.
        const [a, b] = axis === "x" ? [x0 - oh, x1 + oh] : [y0 - oh, y1 + oh];
        const mid = axis === "x" ? (y0 + y1) / 2 : (x0 + x1) / 2;
        for (const e of [a, b]) {
          for (const side of [-1, 1]) {
            const from: Vec3 = axis === "x" ? [e, mid, zBase + r - 1] : [mid, e, zBase + r - 1];
            const to: Vec3 =
              axis === "x"
                ? [e, mid + side * 0.14, zBase + r + 6]
                : [mid + side * 0.14, e, zBase + r + 6];
            strand(s, from, to, 0.025, 1.1, st.trim, 5);
          }
        }
      }
      return zBase + r;
    }
    case "flat": {
      s.box([x0 - 0.06, y0 - 0.06, zBase], [x1 + 0.06, y1 + 0.06, zBase + 2], mat);
      const t = 0.07;
      const h = zBase + 4;
      const wall = st.trim;
      s.box([x0 - 0.06, y0 - 0.06, zBase + 2], [x1 + 0.06, y0 + t - 0.06, h], wall);
      s.box([x0 - 0.06, y1 - t + 0.06, zBase + 2], [x1 + 0.06, y1 + 0.06, h], wall);
      s.box([x0 - 0.06, y0 - 0.06, zBase + 2], [x0 + t - 0.06, y1 + 0.06, h], wall);
      s.box([x1 - t + 0.06, y0 - 0.06, zBase + 2], [x1 + 0.06, y1 + 0.06, h], wall);
      for (let u = x0; u <= x1; u += 0.28) {
        s.box([u, y1 - t + 0.06, h], [u + 0.1, y1 + 0.06, h + 2], wall);
        s.box([u, y0 - 0.06, h], [u + 0.1, y0 + t - 0.06, h + 2], wall);
      }
      for (let v = y0; v <= y1; v += 0.28) {
        s.box([x1 - t + 0.06, v, h], [x1 + 0.06, v + 0.1, h + 2], wall);
        s.box([x0 - 0.06, v, h], [x0 + t - 0.06, v + 0.1, h + 2], wall);
      }
      return h + 2;
    }
    case "leafy": {
      const rand = prng(Math.floor(x0 * 100 + y1 * 37 + zBase));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = Math.max(x1 - x0, y1 - y0) / 2 + 0.12;
      s.ellipsoid(
        [cx, cy, zBase + 2],
        [(x1 - x0) / 2 + 0.16, (y1 - y0) / 2 + 0.16, rise * 0.75],
        mat,
      );
      canopy(s, rand, cx, cy, zBase + rise * 0.45, r * 0.8, rise * 0.4, 6, mat);
      return zBase + rise;
    }
  }
}

/** A flag on a pole. */
function banner(s: Scene, st: Style, x: number, y: number, zBase: number, height = 14): void {
  s.prism("z", [x, y, zBase + height / 2], 0.02, height / 2, st.trim, 6);
  s.box(
    [x + 0.02, y - 0.012, zBase + height - 5],
    [x + 0.28, y + 0.012, zBase + height],
    flat(st.banner, 0.15),
  );
}

function chimney(s: Scene, x: number, y: number, z0: number, z1: number): void {
  s.box([x, y, z0], [x + 0.22, y + 0.22, z1], bricks("stone", 3, 0.11));
  s.box([x - 0.03, y - 0.03, z1], [x + 0.25, y + 0.25, z1 + 2], flat("stone", -0.1));
}

function dome(s: Scene, cx: number, cy: number, z: number, r: number, h: number): void {
  s.box([cx - r * 0.8, cy - r * 0.8, z], [cx + r * 0.8, cy + r * 0.8, z + 3], flat("adobe", 0.05));
  s.ellipsoid([cx, cy, z + 3], [r, r, h], (c) => {
    const rib = ((c.p[0] + c.p[1]) * 12) % 1 < 0.15 ? -0.1 : 0.1;
    return shade("dome", lit(c, rib), c.px, c.py, 0.25);
  });
  s.prism("z", [cx, cy, z + 3 + h + 2], 0.02, 2.5, flat("gold", 0.2), 6);
}

function lantern(s: Scene, x: number, y: number, z: number): void {
  s.ellipsoid([x, y, z], [0.05, 0.05, 1.8], () => rampColor("glass", 3));
}

/** Awning cloth striped in the tribe's colour and white. */
function stripes(ramp: RampName): Material {
  return (c) => {
    const band = Math.floor((c.lp[0] + c.lp[1]) * 9) % 2 === 0;
    return shade(band ? ramp : "plaster", lit(c, 0.15), c.px, c.py, 0.2);
  };
}

// ---------------------------------------------------------------------------------------------
// Buildings

function townHall(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 3.3, y1: 3.3 };
  const top = st.roofKind === "steep" ? 22 : 26;
  s.box([0.25, 0.3, 0], [2.75, 2.7, 4], st.base);
  const openings: Opening[] = [
    { face: "+y", u0: 1.3, u1: 1.7, z0: 5, z1: 19, kind: "door" },
    { face: "+y", u0: 0.55, u1: 0.8, z0: 12, z1: 19, kind: "lit-window" },
    { face: "+y", u0: 2.2, u1: 2.45, z0: 12, z1: 19, kind: "lit-window" },
    { face: "+x", u0: 0.6, u1: 0.85, z0: 12, z1: 19, kind: "window" },
    { face: "+x", u0: 1.35, u1: 1.6, z0: 12, z1: 19, kind: "lit-window" },
    { face: "+x", u0: 2.1, u1: 2.35, z0: 12, z1: 19, kind: "window" },
  ];
  const posts = [0.35, 0.8, 1.25, 1.75, 2.2, 2.65, 0.4, 0.9, 1.5, 2.1, 2.6];
  s.box([0.35, 0.4, 0], [2.65, 2.6, top], st.wall(top, openings, posts));
  const peak = roof(s, st, 0.35, 0.4, 2.65, 2.6, top, 26, "x", st.hallRoof);
  const meta: Record<string, unknown> = {};
  switch (st.tribe) {
    case "islanders":
      s.box([1.28, 1.28, peak - 10], [1.72, 1.72, peak + 8], planks("plank", "z", 0.09));
      s.box([1.36, 1.72, peak - 4], [1.64, 1.73, peak + 4], flat("timber", -0.3));
      s.pyramid(1.5, 1.5, 0.3, 0.3, peak + 7, peak + 22, shingles("slate", 2.5, 0.12));
      banner(s, st, 1.5, 1.5, peak + 20, 12);
      chimney(s, 2.2, 0.75, 30, 58);
      meta.smoke = [at(2.31, 0.86, 61)];
      break;
    case "northfolk":
      banner(s, st, 1.1, 2.75, 0, 26);
      banner(s, st, 1.9, 2.75, 0, 26);
      chimney(s, 2.25, 0.9, 30, peak - 4);
      meta.smoke = [at(2.36, 1.01, peak - 1)];
      break;
    case "sunfolk":
      dome(s, 1.5, 1.5, peak - 2, 0.62, 16);
      s.prism("z", [2.45, 0.55, peak + 8], 0.13, 10, flat("adobe", 0.08), 10);
      s.ellipsoid([2.45, 0.55, peak + 19], [0.15, 0.15, 5], flat("dome", 0.1));
      banner(s, st, 0.55, 0.55, peak, 14);
      break;
    case "sylvan":
      s.prism("z", [1.5, 1.5, peak + 6], 0.14, 12, st.trim, 9);
      canopy(
        s,
        prng(77),
        1.5,
        1.5,
        peak + 20,
        0.6,
        12,
        9,
        foliage("petal", 7, dots("plaster", 0.05, 53), 1),
      );
      lantern(s, 1.15, 2.72, 16);
      lantern(s, 1.85, 2.72, 16);
      break;
  }
  s.box([1.2, 2.6, 0], [1.8, 2.85, 3], st.base);
  return renderSprite(`b_town_hall_${st.tribe}`, s, 3, 3, 110, 10, meta);
}

function house(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 19;
  const openings: Opening[] = [
    { face: "+y", u0: 0.88, u1: 1.12, z0: 3, z1: 14, kind: "door" },
    { face: "+y", u0: 0.44, u1: 0.62, z0: 8, z1: 13, kind: "lit-window" },
    { face: "+y", u0: 1.34, u1: 1.52, z0: 8, z1: 13, kind: "window" },
    { face: "+x", u0: 0.62, u1: 0.8, z0: 8, z1: 13, kind: "window" },
    { face: "+x", u0: 1.12, u1: 1.3, z0: 8, z1: 13, kind: "lit-window" },
  ];
  const meta: Record<string, unknown> = {};
  if (st.tribe === "sylvan") {
    // A round treehouse under a leafy dome.
    s.prism("z", [1, 1, top / 2], 0.62, top / 2, st.wall(top, openings, []), 14);
    roof(s, st, 0.3, 0.3, 1.7, 1.7, top, 16, "x");
    lantern(s, 1.25, 1.66, 12);
  } else {
    const posts = [0.3, 0.75, 1.25, 1.7, 0.35, 0.8, 1.2, 1.65];
    s.box([0.3, 0.35, 0], [1.7, 1.65, top], st.wall(top, openings, posts));
    const peak = roof(s, st, 0.3, 0.35, 1.7, 1.65, top, 17, "x");
    if (st.chimney) {
      const z1 = Math.max(peak + 4, 50);
      chimney(s, 1.22, 0.62, 24, z1);
      meta.smoke = [at(1.33, 0.73, z1 + 3)];
    }
    if (st.roofKind === "flat") {
      // Rooftop awning over a terrace.
      s.prism("z", [0.45, 0.5, peak + 5], 0.02, 5, st.trim, 5);
      s.prism("z", [0.95, 0.5, peak + 5], 0.02, 5, st.trim, 5);
      s.box([0.4, 0.42, peak + 10], [1.0, 0.95, peak + 11], stripes(st.accent));
    }
  }
  s.box([0.84, 1.65, 0], [1.16, 1.84, 2], st.base);
  return renderSprite(`b_house_${st.tribe}`, s, 2, 2, 64, 10, meta);
}

function storehouse(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 18;
  s.box([0.25, 0.3, 0], [1.75, 1.7, 3], st.base);
  const doors: Opening[] = [{ face: "+y", u0: 0.7, u1: 1.3, z0: 3, z1: 15, kind: "door" }];
  const wall =
    st.tribe === "islanders"
      ? withOpenings((c) => planks("plank", "z", 0.085)(c)!, {
          openings: doors,
          frame: "timber",
          plinthPx: 0,
        })
      : st.wall(top, doors, [0.3, 1.0, 1.7]);
  s.box([0.3, 0.35, 3], [1.7, 1.65, top], wall);
  roof(s, st, 0.3, 0.35, 1.7, 1.65, top, 15, "y");
  s.box([0.28, 1.72, 0], [0.5, 1.94, 7], planks(st.wood, "x", 0.07));
  s.box([0.3, 1.74, 7], [0.48, 1.92, 12], planks(st.wood, "y", 0.07));
  s.prism("z", [1.55, 1.85, 4], 0.1, 4, planks(st.wood, "z", 0.05), 10);
  s.prism("z", [1.82, 1.55, 4], 0.1, 4, planks(st.wood, "z", 0.05), 10);
  return renderSprite(`b_storehouse_${st.tribe}`, s, 2, 2, 56, 10);
}

function logMaterial(axis: "x" | "y", centre: Vec3, r: number): Material {
  const bark = flat("timber", -0.05);
  return (c) => {
    const endOn = axis === "x" ? Math.abs(c.ln[0]) > 0.9 : Math.abs(c.ln[1]) > 0.9;
    if (!endOn) return bark(c);
    const du = axis === "x" ? c.lp[1] - centre[1] : c.lp[0] - centre[0];
    const dv = (c.lp[2] - centre[2]) / 19.6;
    const d = Math.hypot(du, dv) / r;
    if (d > 0.78) return rampColor("timber", 1);
    return rampColor("wheat", d < 0.3 ? 2 : d < 0.55 ? 4 : 3);
  };
}

function logPile(
  s: Scene,
  x: number,
  y: number,
  along: "x" | "y",
  count: number,
  len = 0.45,
): void {
  const r = 0.11;
  const rPx = r * 19.6;
  let placed = 0;
  for (let row = 0; placed < count; row++) {
    const inRow = Math.max(1, 3 - row);
    for (let i = 0; i < inRow && placed < count; i++, placed++) {
      const off = (i - (inRow - 1) / 2) * r * 2.05;
      const z = rPx + row * rPx * 1.75;
      const c: Vec3 = along === "x" ? [x, y + off, z] : [x + off, y, z];
      s.prism(along, c, r, len / 2, logMaterial(along, c, r), 10);
    }
  }
}

/** Open shed: four posts and a roof. */
function shed(s: Scene, st: Style, x0: number, y0: number, x1: number, y1: number, h = 17): void {
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const) {
    s.prism("z", [x, y, h / 2], 0.04, h / 2, st.trim, 6);
  }
  s.box([x0 - 0.05, y0 - 0.05, h], [x1 + 0.05, y1 + 0.05, h + 2], st.trim);
  roof(s, st, x0, y0, x1, y1, h + 1, 12, "y");
}

function lumberCamp(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  shed(s, st, 0.35, 0.35, 1.2, 1.2);
  s.box([0.45, 0.5, 0], [1.1, 0.75, 6], planks(st.wood, "x"));
  s.box([0.6, 0.55, 6], [0.95, 0.7, 7], flat("stone", 0.2));
  logPile(s, 1.62, 0.7, "y", 6);
  logPile(s, 0.75, 1.65, "x", 5);
  s.prism(
    "z",
    [1.55, 1.55, 2],
    0.09,
    2,
    (c) => (c.n[2] > 0.9 ? rampColor("wheat", 3) : shade("timber", lit(c), c.px, c.py)),
    8,
  );
  s.box([1.53, 1.54, 4], [1.57, 1.56, 8], flat("timber"));
  s.box([1.5, 1.53, 7], [1.6, 1.57, 9], flat("stone", 0.25));
  return renderSprite(`b_lumber_camp_${st.tribe}`, s, 2, 2, 50, 10);
}

const cutStone: Material = (c) => shade("stone", lit(c, -0.18), c.px, c.py, 0.2);

function quarry(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  s.box(
    [0.15, 0.15, 0],
    [1.85, 1.85, 0.8],
    (c) => {
      const k = hash3(Math.floor(c.lp[0] * 24), Math.floor(c.lp[1] * 24), 0, 8);
      if (k > 0.9) return rampColor("rock", 4);
      return shade("sand", 0.45 + (k - 0.5) * 0.3, c.px, c.py);
    },
    { castsShadow: false },
  );
  const block = (x: number, y: number, z: number, sz = 0.34) =>
    s.box([x, y, z], [x + sz, y + sz, z + sz * 19.6], cutStone);
  block(0.25, 1.25, 0.8);
  block(0.62, 1.3, 0.8);
  block(0.35, 1.3, 7.5, 0.3);
  block(1.3, 1.4, 0.8, 0.36);
  block(1.42, 0.95, 0.8, 0.28);
  block(1.05, 1.5, 0.8, 0.26);
  s.prism("z", [0.4, 0.4, 20], 0.045, 20, st.trim, 6);
  s.prism("z", [1.0, 0.4, 20], 0.045, 20, st.trim, 6);
  s.box([0.33, 0.35, 38], [1.07, 0.47, 41], st.trim);
  s.box([0.64, 0.37, 38], [0.76, 1.3, 41], st.trim);
  s.box([0.69, 1.2, 22], [0.71, 1.22, 38], flat("rock", -0.3), { castsShadow: false });
  s.box([0.55, 1.06, 14], [0.85, 1.36, 22], cutStone);
  s.ellipsoid([1.25, 0.5, 2.5], [0.2, 0.16, 5], rocky("rock", 9));
  s.ellipsoid([1.5, 0.68, 2], [0.14, 0.12, 4], rocky("rock", 9));
  return renderSprite(`b_quarry_${st.tribe}`, s, 2, 2, 54, 10);
}

function mine(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  // A rocky hill with a timbered tunnel mouth facing the viewer.
  s.ellipsoid([0.85, 0.8, 4], [0.75, 0.7, 20], rocky("rock", 7, 0.4));
  s.ellipsoid([1.4, 0.45, 2], [0.4, 0.36, 12], rocky("rock", 8, 0.3));
  s.box([0.62, 1.28, 0], [1.12, 1.5, 14], (c) => {
    const inner = c.ln[1] > 0.7 && c.lp[0] > 0.7 && c.lp[0] < 1.04 && c.lp[2] < 11.5;
    return inner ? rampColor("outline", 0) : st.trim(c);
  });
  s.box([0.58, 1.26, 12], [1.16, 1.52, 15], st.trim);
  // Rails and an ore cart.
  s.box([0.72, 1.5, 0], [0.76, 2.0, 0.8], flat("stone", -0.2));
  s.box([0.98, 1.5, 0], [1.02, 2.0, 0.8], flat("stone", -0.2));
  s.box([0.7, 1.72, 1], [1.04, 1.96, 6], planks(st.wood, "x", 0.07));
  s.ellipsoid([0.87, 1.84, 6.5], [0.12, 0.09, 2], (c) =>
    hash3(c.px, c.py, 0, 3) > 0.7 ? rampColor("fruit", 2) : shade("rock", lit(c), c.px, c.py),
  );
  lantern(s, 1.2, 1.5, 11);
  banner(s, st, 1.6, 1.2, 0, 16);
  return renderSprite(`b_mine_${st.tribe}`, s, 2, 2, 50, 10);
}

function farm(st: Style, stage: 0 | 1 | 2): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 3.3, y1: 3.3 };
  s.box(
    [0.12, 0.12, 0],
    [2.88, 2.88, 1.5],
    (c) => {
      const furrow = (c.lp[0] * 4.65) % 1 < 0.4;
      return shade("soil", lit(c, furrow ? -0.25 : 0), c.px, c.py, 0.2);
    },
    { castsShadow: false },
  );
  if (stage > 0) {
    for (let i = 0; i < 12; i++) {
      const x = 0.3 + i * 0.215;
      if (x > 2.75) break;
      for (let j = 0; j < 12; j++) {
        const y = 0.3 + j * 0.215;
        if (x < 0.95 && y < 0.95) continue;
        const h = stage === 1 ? 3 : 9;
        s.ellipsoid(
          [x, y, 1.5 + h / 2],
          [0.09, 0.09, h / 2],
          stage === 1 ? flat("sprout") : flat("wheat", 0.08),
          { castsShadow: stage === 2 },
        );
      }
    }
  }
  s.box([0.15, 0.15, 0], [0.85, 0.85, 13], st.wall(13, [], [0.15, 0.85]));
  roof(s, st, 0.15, 0.15, 0.85, 0.85, 13, 9, "x");
  for (let k = 0; k <= 6; k++) {
    s.prism("z", [2.9, 0.12 + k * 0.46, 4], 0.025, 4, st.trim, 6);
    s.prism("z", [0.12 + k * 0.46, 2.9, 4], 0.025, 4, st.trim, 6);
  }
  s.box([2.88, 0.12, 5], [2.92, 2.9, 6], st.trim);
  s.box([0.12, 2.88, 5], [2.9, 2.92, 6], st.trim);
  return renderSprite(`b_farm_${stage}_${st.tribe}`, s, 3, 3, 44, 10);
}

function blacksmith(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 18;
  s.box([0.25, 0.25, 0], [1.75, 1.75, 2], st.base);
  // Back and side walls; the front (+y) is open onto the forge.
  s.box([0.3, 0.3, 2], [1.7, 0.5, top], st.wall(top, [], [0.3, 1.0, 1.7]));
  s.box([0.3, 0.3, 2], [0.5, 1.4, top], st.wall(top, [], [0.3, 0.85, 1.4]));
  s.prism("z", [1.65, 1.35, top / 2], 0.04, top / 2, st.trim, 6);
  roof(s, st, 0.3, 0.3, 1.7, 1.4, top, 12, "x");
  // Forge hearth glowing inside, chimney above.
  const hearth = bricks("stone", 3, 0.12);
  s.box([0.6, 0.55, 2], [1.1, 0.95, 7], (c) => (c.n[2] > 0.7 ? rampColor("fire", 3) : hearth(c)));
  s.ellipsoid([0.85, 0.75, 8], [0.14, 0.1, 2.5], (c) => rampColor("fire", c.light > 0.2 ? 4 : 3), {
    castsShadow: false,
  });
  s.box([1.25, 0.5, 2], [1.55, 0.8, 50], hearth);
  s.box([1.22, 0.47, 50], [1.58, 0.83, 52], flat("stone", -0.1));
  // Anvil on a stump and a quench barrel out front.
  s.prism("z", [1.1, 1.65, 2.5], 0.1, 2.5, flat("timber"), 8);
  s.box([0.98, 1.6, 5], [1.24, 1.7, 7.5], flat("rock", -0.2));
  s.box([1.02, 1.62, 3.5], [1.2, 1.68, 5], flat("rock", -0.3));
  s.prism("z", [0.55, 1.7, 3.5], 0.11, 3.5, planks(st.wood, "z", 0.05), 10);
  return renderSprite(`b_blacksmith_${st.tribe}`, s, 2, 2, 60, 10, {
    smoke: [at(1.4, 0.65, 54)],
  });
}

function market(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 3.3, y1: 2.3 };
  s.box(
    [0.1, 0.1, 0],
    [2.9, 1.9, 0.8],
    (c) => {
      const k = hash3(Math.floor(c.lp[0] * 6), Math.floor(c.lp[1] * 6), 0, 4);
      return shade("stone", 0.5 + (k - 0.5) * 0.3, c.px, c.py);
    },
    { castsShadow: false },
  );
  const stall = (x: number, y: number, goods: RampName[]) => {
    for (const [dx, dy] of [
      [0, 0],
      [0.7, 0],
      [0, 0.55],
      [0.7, 0.55],
    ] as const) {
      s.prism("z", [x + dx, y + dy, 7], 0.025, 7, st.trim, 6);
    }
    s.gable(x - 0.08, y - 0.08, x + 0.78, y + 0.63, 13, 18, "x", stripes(st.accent));
    s.box([x + 0.02, y + 0.3, 4], [x + 0.68, y + 0.55, 6], planks(st.wood, "x", 0.08));
    goods.forEach((g, i) =>
      s.ellipsoid([x + 0.12 + i * 0.2, y + 0.42, 7], [0.07, 0.06, 1.5], flat(g, 0.1)),
    );
  };
  stall(0.3, 0.25, ["fruit", "banana", "berry"]);
  stall(1.8, 0.25, ["sail", "clothBlue", "wheat"]);
  stall(1.05, 1.1, ["pumpkin", "gold", "stone"]);
  s.box([0.3, 1.45, 0.8], [0.52, 1.67, 6], planks(st.wood, "y", 0.07));
  s.prism("z", [2.55, 1.6, 4], 0.1, 3.2, planks(st.wood, "z", 0.05), 10);
  banner(s, st, 2.7, 1.1, 0.8, 18);
  return renderSprite(`b_market_${st.tribe}`, s, 3, 2, 50, 10);
}

function church(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 3.3 };
  const top = 22;
  const openings: Opening[] = [
    { face: "+x", u0: 0.7, u1: 0.95, z0: 8, z1: 18, kind: "lit-window" },
    { face: "+x", u0: 1.35, u1: 1.6, z0: 8, z1: 18, kind: "lit-window" },
    { face: "+x", u0: 2.0, u1: 2.25, z0: 8, z1: 18, kind: "lit-window" },
  ];
  s.box([0.25, 0.25, 0], [1.75, 2.75, 3], st.base);
  s.box([0.4, 0.4, 0], [1.6, 2.2, top], st.wall(top, openings, [0.4, 1.0, 1.6, 2.2]));
  const peak = roof(s, st, 0.4, 0.4, 1.6, 2.2, top, 20, "y", st.hallRoof);
  // Tower at the front with the door.
  const doors: Opening[] = [{ face: "+y", u0: 0.85, u1: 1.15, z0: 3, z1: 15, kind: "door" }];
  const towerTop = Math.max(peak + 4, 44);
  s.box([0.62, 2.1, 0], [1.38, 2.8, towerTop], st.wall(towerTop, doors, [0.62, 1.38, 2.1, 2.8]));
  s.box([0.8, 2.79, towerTop - 12], [1.2, 2.81, towerTop - 5], flat("timber", -0.35));
  switch (st.tribe) {
    case "islanders":
      s.pyramid(1.0, 2.45, 0.45, 0.42, towerTop, towerTop + 26, shingles("slate", 2.5, 0.12));
      s.prism("z", [1.0, 2.45, towerTop + 30], 0.02, 4, flat("gold", 0.2), 6);
      break;
    case "northfolk":
      // Stave-church tiers.
      s.pyramid(1.0, 2.45, 0.5, 0.46, towerTop, towerTop + 10, shingles("darkwood", 2.2, 0.12));
      s.box(
        [0.8, 2.25, towerTop + 7],
        [1.2, 2.65, towerTop + 14],
        withOpenings(logSurface("logs"), { frame: "darkwood", plinthPx: 0 }),
      );
      s.pyramid(
        1.0,
        2.45,
        0.3,
        0.28,
        towerTop + 13,
        towerTop + 28,
        shingles("darkwood", 2.2, 0.12),
      );
      break;
    case "sunfolk":
      dome(s, 1.0, 2.45, towerTop, 0.42, 12);
      break;
    case "sylvan":
      canopy(
        s,
        prng(91),
        1.0,
        2.45,
        towerTop + 6,
        0.42,
        9,
        6,
        foliage("petal", 7, dots("plaster", 0.05, 54), 1),
      );
      s.prism("z", [1.0, 2.45, towerTop + 20], 0.03, 6, st.trim, 6);
      lantern(s, 1.0, 2.45, towerTop + 27);
      break;
  }
  return renderSprite(`b_church_${st.tribe}`, s, 2, 3, 100, 10);
}

function magicHouse(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 42;
  const openings: Opening[] = [
    { face: "+y", u0: 0.85, u1: 1.15, z0: 3, z1: 13, kind: "door" },
    { face: "+x", u0: 0.9, u1: 1.1, z0: 20, z1: 27, kind: "lit-window" },
    { face: "+y", u0: 0.9, u1: 1.1, z0: 30, z1: 36, kind: "lit-window" },
  ];
  s.prism("z", [1, 1, top / 2], 0.55, top / 2, st.wall(top, openings, []), 12);
  // Annex with the tribe's roof.
  const annex: Opening[] = [{ face: "+x", u0: 1.35, u1: 1.6, z0: 6, z1: 11, kind: "lit-window" }];
  s.box([1.35, 1.2, 0], [1.85, 1.8, 14], st.wall(14, annex, [1.35, 1.85]));
  roof(s, st, 1.35, 1.2, 1.85, 1.8, 14, 8, "y");
  // Tall pointed hat roof with gold bands and a glowing orb on top.
  const hat: Material = (c) => {
    const band = Math.floor(c.lp[2] / 7) % 3 === 0 && c.lp[2] % 7 < 1.2;
    if (band) return rampColor("gold", 3);
    if (hash3(c.px, c.py, 0, 61) > 0.97) return rampColor("arcane", 6);
    return shade("arcane", lit(c, 0.05), c.px, c.py, 0.25);
  };
  s.cone([1, 1, top - 1], 0.72, 34, hat, 14);
  s.ellipsoid(
    [1, 1, top + 36],
    [0.13, 0.13, 3.5],
    (c) => shade("crystal", 0.55 + c.light * 0.5, c.px, c.py, 0.2),
    {
      castsShadow: false,
    },
  );
  // Floating runestones.
  const rune: Material = (c) => rampColor("arcane", c.light > 0.3 ? 6 : 5);
  s.ellipsoid([0.3, 1.6, 12], [0.06, 0.06, 2], rune);
  s.ellipsoid([1.7, 0.4, 16], [0.06, 0.06, 2], rune);
  return renderSprite(`b_magic_house_${st.tribe}`, s, 2, 2, 100, 10, {
    sparkle: [at(1, 1, top + 36)],
  });
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

/** Pier tile; planks run along `dir`. */
export function dockTile(dir: "x" | "y", end: boolean): Sprite {
  const s = new Scene();
  const deck = 5;
  s.box([0, 0, deck - 1.5], [1, 1, deck], planks("plank", dir === "x" ? "y" : "x", 0.11));
  const posts: [number, number][] = end
    ? [
        [0.08, 0.08],
        [0.92, 0.08],
        [0.08, 0.92],
        [0.92, 0.92],
      ]
    : dir === "x"
      ? [
          [0.5, 0.06],
          [0.5, 0.94],
        ]
      : [
          [0.06, 0.5],
          [0.94, 0.5],
        ];
  for (const [x, y] of posts) s.prism("z", [x, y, 4], 0.05, end ? 5 : 3.5, flat("timber"), 8);
  return renderSprite(`dock_${dir}${end ? "_end" : ""}`, s, 1, 1, 18, 6, undefined, {
    depthEdges: false,
  });
}

export function scaffold(w: number, h: number): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: w + 0.2, y1: h + 0.2 };
  const height = 12 + Math.max(w, h) * 5;
  const x0 = 0.2;
  const y0 = 0.2;
  const x1 = w - 0.2;
  const y1 = h - 0.2;
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const) {
    s.prism("z", [x, y, height / 2], 0.035, height / 2, flat("timber"), 6);
  }
  for (const z of [height * 0.45, height - 1]) {
    s.box([x0, y1 - 0.03, z - 0.8], [x1, y1 + 0.03, z + 0.8], flat("timber", 0.05));
    s.box([x1 - 0.03, y0, z - 0.8], [x1 + 0.03, y1, z + 0.8], flat("timber", 0.05));
    s.box([x0, y0 - 0.03, z - 0.8], [x1, y0 + 0.03, z + 0.8], flat("timber", 0.05));
    s.box([x0 - 0.03, y0, z - 0.8], [x0 + 0.03, y1, z + 0.8], flat("timber", 0.05));
  }
  s.box([x0, y0, 0], [x1, y1, 1.5], planks("plank", "x", 0.12));
  s.box([x0 + 0.1, y0 + 0.1, 1.5], [x0 + 0.45, y0 + 0.3, 4], planks("plank", "y", 0.06));
  return renderSprite(`scaffold_${w}x${h}`, s, w, h, height + 12, 8);
}

export function buildingSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const tribe of TRIBES) {
    const st = STYLES[tribe];
    out.push(
      townHall(st),
      house(st),
      storehouse(st),
      lumberCamp(st),
      quarry(st),
      mine(st),
      farm(st, 0),
      farm(st, 1),
      farm(st, 2),
      blacksmith(st),
      market(st),
      church(st),
      magicHouse(st),
    );
  }
  out.push(dockTile("x", false), dockTile("x", true), dockTile("y", false), dockTile("y", true));
  for (const [w, h] of [
    [1, 1],
    [2, 2],
    [3, 3],
    [3, 2],
    [2, 3],
  ] as const) {
    out.push(scaffold(w, h));
  }
  return out;
}

// Buildings in each tribe's style. Each style supplies wall and roof materials and a roof shape;
// the building recipes below compose walls, roofs, towers and props from the style.
// Names: b_<kind>_<tribe> (farms: b_farm_<stage>_<tribe>); docks and scaffolds are shared.
import { TRIBES, type TribeId } from "@explorer/shared";
import {
  adobeSurface,
  bambooSurface,
  barkSurface,
  basaltSurface,
  boardSurface,
  bricks,
  logSurface,
  planks,
  rocky,
  shingles,
  stalkSurface,
  straw,
  timberFrame,
  withOpenings,
  type Opening,
} from "../materials";
import { hash3, noise3, prng } from "../noise3";
import { RAMPS, hexToRgba, rampColor, shade, type RampName } from "../palette";
import { flat, lit, project, Scene, type Material, type Vec3 } from "../raytrace";
import { renderSprite, type Sprite } from "../sprite";
import { canopy, dots, foliage, strand } from "./nature";

type RoofKind = "gable" | "steep" | "flat" | "leafy" | "cap" | "hip";

export interface Style {
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
  /** Hip roofs: how steep they rise (1 is a low reed roof; more makes a spire). */
  pitch?: number;
}

/** Old sailcloth stretched over a roof and patched here and there (Freebooters). */
const patchedSail: Material = (c) => {
  const patch =
    hash3(Math.floor(c.lp[0] * 4), Math.floor(c.lp[1] * 4), Math.floor(c.lp[2] / 7), 23) > 0.8;
  const seam = (c.lp[2] / 4) % 1 < 0.2 ? -0.1 : 0;
  return shade(patch ? "berry" : "sail", lit(c, 0.02 + seam), c.px, c.py, 0.2);
};

/** A mushroom-cap roof: glowing flecks on top, pale gills with a faint glow underneath. */
function capRoof(ramp: RampName): Material {
  return (c) => {
    if (c.n[2] < -0.1)
      return (c.px + c.py) % 3 === 0
        ? rampColor("glow", 3)
        : shade("stalk", 0.25 + c.light * 0.3, c.px, c.py);
    if (noise3(c.p[0] * 14, c.p[1] * 14, c.p[2] / 2, 56) > 0.74)
      return rampColor("glow", c.light > 0.4 ? 5 : 4);
    return shade(ramp, lit(c, 0.08), c.px, c.py, 0.3);
  };
}

export const STYLES: Record<TribeId, Style> = {
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
  glowkin: {
    tribe: "glowkin",
    wall: (_top, openings) =>
      withOpenings(stalkSurface(), { openings, frame: "fungalGround", plinth: "fungalGround" }),
    roofKind: "cap",
    roof: capRoof("arcane"),
    hallRoof: capRoof("capRed"),
    gableFill: () => withOpenings(stalkSurface(), { frame: "fungalGround" }),
    trim: flat("stalk", -0.1),
    wood: "stalk",
    base: rocky("fungalGround", 8, 0),
    banner: "arcane",
    accent: "glow",
    chimney: false,
  },
  freebooters: {
    tribe: "freebooters",
    wall: (_top, openings) =>
      withOpenings(bambooSurface(), { openings, frame: "timber", plinth: "rock" }),
    roofKind: "gable",
    roof: straw("jungle", 2.5),
    hallRoof: patchedSail,
    gableFill: () => withOpenings(bambooSurface(), { frame: "timber" }),
    trim: flat("timber"),
    wood: "plank",
    base: planks("plank", "x", 0.1),
    banner: "hull",
    accent: "berry",
    chimney: false,
  },
  mirefolk: {
    tribe: "mirefolk",
    wall: (_top, openings) =>
      withOpenings(boardSurface("darkwood"), { openings, frame: "logs", plinth: "swampGround" }),
    roofKind: "hip",
    pitch: 1.15,
    roof: straw("thatch", 2.5),
    hallRoof: straw("thatch", 2.5),
    gableFill: () => withOpenings(boardSurface("darkwood"), { frame: "logs" }),
    trim: flat("logs", 0.05),
    wood: "logs",
    base: planks("logs", "x", 0.1),
    banner: "shallow",
    accent: "shallow",
    chimney: false,
  },
  amberwrights: {
    tribe: "amberwrights",
    wall: (top, openings, posts) =>
      timberFrame({ top, posts, braces: true, openings, wall: "sand", frame: "darkwood" }),
    roofKind: "gable",
    roof: shingles("autumnLeaf", 2.5, 0.14),
    hallRoof: shingles("pumpkin", 2.5, 0.14),
    gableFill: (top) =>
      timberFrame({ top, posts: [0.7, 1.3, 1.9], wall: "sand", frame: "darkwood" }),
    trim: flat("darkwood", 0.05),
    wood: "plank",
    base: bricks("sandstone", 2.5, 0.22),
    banner: "gold",
    accent: "autumnLeaf",
    chimney: true,
  },
  cinderborn: {
    tribe: "cinderborn",
    wall: (_top, openings) =>
      withOpenings(basaltSurface(), { openings, frame: "basalt", plinth: "obsidian" }),
    roofKind: "hip",
    pitch: 1.9,
    roof: shingles("obsidian", 2.5, 0.14),
    hallRoof: shingles("obsidian", 2.5, 0.14),
    gableFill: () => withOpenings(basaltSurface(), { frame: "basalt" }),
    trim: flat("basalt", 0.1),
    wood: "charred",
    base: bricks("obsidian", 3, 0.22),
    banner: "lava",
    accent: "lava",
    chimney: true,
  },
};

const at = (x: number, y: number, z: number) => project(x, y, z);

/**
 * A roof over a wall rectangle, shaped by the tribe: gable, steep gable with carved ridge
 * horns, flat with a crenellated parapet, a leafy mound, a mushroom cap or a hip roof that can
 * rise to a spire. Returns the roof's top (px).
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
    case "cap": {
      // A broad mushroom cap that droops over the top of the walls.
      const h = rise * 0.6;
      s.ellipsoid(
        [(x0 + x1) / 2, (y0 + y1) / 2, zBase + h * 0.2],
        [(x1 - x0) / 2 + 0.28, (y1 - y0) / 2 + 0.28, h],
        mat,
      );
      return zBase + h * 1.2;
    }
    case "hip": {
      const r = rise * (st.pitch ?? 1);
      s.pyramid(
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        (x1 - x0) / 2 + oh,
        (y1 - y0) / 2 + oh,
        zBase - 1,
        zBase + r,
        mat,
      );
      return zBase + r;
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

/** A lantern hung from a post. */
function lanternPost(s: Scene, st: Style, x: number, y: number, height = 14): void {
  s.prism("z", [x, y, height / 2], 0.025, height / 2, st.trim, 6);
  s.box([x - 0.02, y - 0.1, height - 1], [x + 0.02, y + 0.02, height], st.trim);
  lantern(s, x, y - 0.1, height - 3.5);
}

/** A flame burning in an iron bowl. */
function brazier(s: Scene, x: number, y: number, z: number): void {
  s.prism("z", [x, y, z + 1.2], 0.13, 1.2, flat("basalt", 0.1), 8);
  s.ellipsoid([x, y, z + 4], [0.09, 0.09, 3], (c) => rampColor("fire", c.light > 0.3 ? 4 : 3), {
    castsShadow: false,
  });
}

/** A ship's cannon on a little wooden carriage, its muzzle facing +y. */
function cannon(s: Scene, x: number, y: number): void {
  s.box([x - 0.1, y - 0.12, 0], [x + 0.1, y + 0.1, 2.5], planks("plank", "y", 0.06));
  s.prism("y", [x, y + 0.04, 4], 0.065, 0.2, flat("hull", 0.15), 8);
}

/** A mushroom stalk topped with a small glowing cap. */
function toadstool(s: Scene, x: number, y: number, z: number, h: number, r: number): void {
  s.prism("z", [x, y, z + h / 2], r * 0.3, h / 2, flat("stalk", 0.1), 10);
  s.ellipsoid([x, y, z + h], [r, r, r * 16], capRoof("arcane"));
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
    case "glowkin":
      // A second, smaller cap on a tall stalk, and toadstools crowding the door.
      toadstool(s, 1.5, 1.5, peak - 6, 22, 0.5);
      toadstool(s, 0.55, 2.8, 0, 9, 0.2);
      toadstool(s, 2.5, 2.85, 0, 6, 0.15);
      banner(s, st, 2.8, 1.2, 0, 24);
      break;
    case "freebooters":
      // A mast with a crow's nest and the black flag, and a cannon guarding the door.
      s.prism("z", [2.2, 0.8, peak + 8], 0.035, 22, flat("timber", 0.05), 6);
      s.prism("z", [2.2, 0.8, peak + 22], 0.16, 2, planks("plank", "z", 0.05), 10);
      banner(s, st, 2.2, 0.8, peak + 24, 12);
      cannon(s, 0.75, 2.9);
      cannon(s, 2.25, 2.9);
      break;
    case "mirefolk":
      // A pearl on the ridge, and lanterns on posts either side of the boardwalk.
      s.ellipsoid([1.5, 1.5, peak + 1.5], [0.09, 0.09, 2.2], (c) =>
        shade("plaster", 0.55 + c.light * 0.5, c.px, c.py, 0.2),
      );
      lanternPost(s, st, 1.0, 2.95, 16);
      lanternPost(s, st, 2.0, 2.95, 16);
      banner(s, st, 0.35, 2.4, 0, 22);
      break;
    case "amberwrights":
      // A clock-tower cupola with a gold vane, and a chimney.
      s.box([1.3, 1.3, peak - 10], [1.7, 1.7, peak + 6], planks("plank", "z", 0.09));
      s.box([1.38, 1.7, peak - 3], [1.62, 1.71, peak + 3], flat("gold", 0.1));
      s.pyramid(1.5, 1.5, 0.3, 0.3, peak + 5, peak + 18, shingles("autumnLeaf", 2.5, 0.12));
      s.prism("z", [1.5, 1.5, peak + 21], 0.02, 3, flat("gold", 0.2), 6);
      chimney(s, 2.2, 0.75, 30, peak - 2);
      meta.smoke = [at(2.31, 0.86, peak + 1)];
      banner(s, st, 0.4, 2.7, 0, 20);
      break;
    case "cinderborn":
      // A fire burning at the spire's foot, obelisks at the door and smoking vents.
      brazier(s, 1.5, 1.5, peak - 3);
      s.pyramid(0.95, 2.95, 0.09, 0.09, 0, 20, shingles("obsidian", 2.5, 0.12));
      s.pyramid(2.05, 2.95, 0.09, 0.09, 0, 20, shingles("obsidian", 2.5, 0.12));
      chimney(s, 2.25, 0.8, 30, 58);
      meta.smoke = [at(2.36, 0.91, 61)];
      banner(s, st, 0.4, 2.6, 0, 22);
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
  if (st.tribe === "sylvan" || st.roofKind === "cap") {
    // A round treehouse under a leafy dome, or a mushroom house under its cap.
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
  // No soil here: the terrain paints the ploughed field, with an organic edge, under the sprite.
  // Crops stand on its ridges (five rows to a tile), thinning out and ragged toward the fence.
  if (stage > 0) {
    const rand = prng(7300 + stage);
    for (let row = 0; row < 15; row++) {
      const x = (row + 0.68) / 5;
      if (x < 0.15 || x > 2.85) continue;
      for (let j = 0; j < 17; j++) {
        const y = 0.22 + j * 0.16 + (rand() - 0.5) * 0.05;
        if (y > 2.85) break;
        if (x < 0.95 && y < 0.95) continue;
        const edge = Math.min(x, y, 3 - x, 3 - y);
        if (rand() < (edge < 0.45 ? 0.5 : 0.07)) continue;
        const h = (stage === 1 ? 3 : 9) * (0.75 + rand() * 0.5);
        s.ellipsoid(
          [x + (rand() - 0.5) * 0.03, y, h / 2],
          [0.085, 0.085, h / 2],
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
    case "glowkin":
      toadstool(s, 1.0, 2.45, towerTop - 4, 18, 0.46);
      break;
    case "freebooters":
      s.pyramid(1.0, 2.45, 0.46, 0.42, towerTop, towerTop + 16, straw("jungle", 2.5));
      banner(s, st, 1.0, 2.45, towerTop + 14, 12);
      break;
    case "mirefolk":
      s.cone([1.0, 2.45, towerTop], 0.5, 22, straw("thatch", 2.5), 12);
      lantern(s, 1.0, 2.86, towerTop - 3);
      break;
    case "amberwrights":
      s.pyramid(1.0, 2.45, 0.45, 0.42, towerTop, towerTop + 28, shingles("autumnLeaf", 2.5, 0.12));
      s.prism("z", [1.0, 2.45, towerTop + 32], 0.02, 4, flat("gold", 0.2), 6);
      break;
    case "cinderborn":
      s.pyramid(1.0, 2.45, 0.42, 0.4, towerTop, towerTop + 36, shingles("obsidian", 2.5, 0.12));
      brazier(s, 1.0, 2.45, towerTop + 34);
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

/**
 * A round tower on a stone plinth with a gallery, a glowing lantern room and a cap in the tribe's
 * roofing. The lantern is a bright, lit block so the game finds it as a light; `beam` marks where
 * the sweeping beam starts.
 */
function lighthouse(st: Style): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 2.2, y1: 2.2 };
  const plinth = 14;
  const lower = 34;
  const upper = 22;
  const openings: Opening[] = [
    { face: "+y", u0: 0.85, u1: 1.15, z0: plinth + 1, z1: plinth + 12, kind: "door" },
    { face: "+x", u0: 0.9, u1: 1.1, z0: plinth + 20, z1: plinth + 27, kind: "window" },
  ];
  s.prism("z", [1, 1, plinth / 2], 0.66, plinth / 2, st.base, 14);
  s.prism(
    "z",
    [1, 1, plinth + lower / 2],
    0.5,
    lower / 2,
    st.wall(plinth + lower, openings, []),
    14,
  );
  const gallery = plinth + lower + upper;
  s.prism("z", [1, 1, plinth + lower + upper / 2], 0.4, upper / 2, st.wall(gallery, [], []), 14);
  // Gallery deck with a rail, and the lantern room above it.
  s.prism("z", [1, 1, gallery + 1.5], 0.55, 1.5, st.trim, 14);
  const glass: Material = (c) => rampColor("glass", c.light > 0.55 ? 3 : 2);
  s.prism("z", [1, 1, gallery + 8], 0.27, 5, glass, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s.prism(
      "z",
      [1 + Math.cos(a) * 0.29, 1 + Math.sin(a) * 0.29, gallery + 8],
      0.025,
      5,
      st.trim,
      5,
    );
  }
  // The cap.
  const capBase = gallery + 13;
  s.prism("z", [1, 1, capBase + 0.75], 0.34, 0.75, st.trim, 12);
  if (st.roofKind === "cap") {
    s.ellipsoid([1, 1, capBase + 3], [0.5, 0.5, 7], st.hallRoof);
  } else if (st.roofKind === "flat") {
    s.ellipsoid([1, 1, capBase + 1.5], [0.32, 0.32, 9], (c) =>
      shade("dome", lit(c, ((c.p[0] + c.p[1]) * 12) % 1 < 0.15 ? -0.1 : 0.1), c.px, c.py, 0.25),
    );
    s.prism("z", [1, 1, capBase + 13], 0.02, 3, flat("gold", 0.2), 6);
  } else {
    const spire =
      st.roofKind === "steep" ? 22 : st.roofKind === "hip" ? 10 + 8 * (st.pitch ?? 1) : 16;
    s.cone([1, 1, capBase + 1.5], 0.4, spire, st.hallRoof, 14);
    s.prism("z", [1, 1, capBase + spire + 4], 0.02, 3, flat("gold", 0.2), 6);
  }
  banner(s, st, 1.32, 0.78, plinth + 2, 10);
  return renderSprite(`b_lighthouse_${st.tribe}`, s, 2, 2, 112, 10, {
    beam: [at(1, 1, gallery + 8)],
  });
}

/** What the Great Work's pillars are made of, in each tribe's own material. */
function pillarMaterial(st: Style): Material {
  switch (st.tribe) {
    case "islanders":
      return (c) => shade("plaster", lit(c, 0.05), c.px, c.py, 0.2);
    case "northfolk":
      return withOpenings(logSurface("logs"), { frame: "darkwood", plinthPx: 0 });
    case "sunfolk":
      return (c) =>
        shade("sandstone", lit(c, (c.lp[2] / 7) % 1 < 0.12 ? -0.15 : 0.06), c.px, c.py, 0.2);
    case "sylvan":
      return withOpenings(barkSurface(), { frame: "bark", plinthPx: 0 });
    case "glowkin":
      return withOpenings(stalkSurface(), { frame: "fungalGround", plinthPx: 0 });
    case "freebooters":
      return withOpenings(bambooSurface(), { frame: "timber", plinthPx: 0 });
    case "mirefolk":
      return withOpenings(boardSurface("logs"), { frame: "logs", plinthPx: 0 });
    case "amberwrights":
      return (c) =>
        shade("autumnLeaf", lit(c, (c.lp[2] / 7) % 1 < 0.14 ? -0.2 : 0.1), c.px, c.py, 0.2);
    case "cinderborn":
      return withOpenings(basaltSurface(), { frame: "basalt", plinthPx: 0 });
  }
}

/** The pillars stand in a ring round the middle of the platform. */
const RING: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4 + Math.PI / 8;
  return [2 + Math.cos(a) * 1.5, 2 + Math.sin(a) * 1.5];
});

/**
 * The Great Work, in three stages: a stepped platform with plinths and an altar; a ring of tall
 * pillars round a glowing crystal; and the crown: lintels joining the pillars under a spire of
 * crystal. Each tribe raises it in its own material.
 */
function greatWork(st: Style, stage: 1 | 2 | 3): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 4.3, y1: 4.3 };
  const pillar = pillarMaterial(st);
  // A stepped platform.
  s.box([0.1, 0.1, 0], [3.9, 3.9, 3], st.base);
  s.box([0.45, 0.45, 3], [3.55, 3.55, 6], st.base);
  const gem: Material = (c) => shade("crystal", 0.35 + 0.8 * c.light, c.px, c.py, 0.2);
  const glowing: Material = (c) => rampColor("glass", c.light > 0.5 ? 3 : 2);
  // Banners on the corners of the lower step.
  for (const [x, y] of [
    [0.3, 0.3],
    [3.7, 0.3],
    [0.3, 3.7],
    [3.7, 3.7],
  ] as const)
    banner(s, st, x, y, 3, 16);
  if (stage === 1) {
    // Plinths and an altar slab where the pillars will stand.
    for (const [x, y] of RING) s.prism("z", [x, y, 10], 0.24, 4, pillar, 10);
    s.box([1.55, 1.55, 6], [2.45, 2.45, 10], st.base);
    s.box([1.7, 1.7, 10], [2.3, 2.3, 11], flat("gold", 0.1));
    return renderSprite(`b_great_work_1_${st.tribe}`, s, 4, 4, 60, 10);
  }
  const height = stage === 3 ? 52 : 46;
  for (const [x, y] of RING) {
    s.prism("z", [x, y, 6 + height / 2], 0.2, height / 2, pillar, 10);
    s.prism("z", [x, y, 8], 0.27, 2, st.trim, 10);
    s.prism("z", [x, y, 6 + height + 1], 0.25, 1.5, st.trim, 10);
    if (stage === 3) {
      // A lamp on each pillar, and the tribe's own finial.
      s.ellipsoid([x, y, 6 + height + 5], [0.08, 0.08, 3], glowing);
    }
  }
  // The heart of the monument: a crystal on a dais.
  s.box([1.45, 1.45, 6], [2.55, 2.55, 9], st.base);
  if (stage === 2) {
    s.cone([2, 2, 9], 0.3, 26, gem, 8);
    s.cone([2.25, 1.85, 9], 0.14, 14, gem, 6);
    s.cone([1.75, 2.2, 9], 0.14, 11, gem, 6);
    return renderSprite(`b_great_work_2_${st.tribe}`, s, 4, 4, 80, 10, {
      sparkle: [at(2, 2, 40)],
    });
  }
  // Stage three: lintels between the pillars, and a spire of crystal rising from the dais.
  for (let i = 0; i < RING.length; i++) {
    const [x0, y0] = RING[i]!;
    const [x1, y1] = RING[(i + 1) % RING.length]!;
    strand(s, [x0, y0, 6 + height + 4], [x1, y1, 6 + height + 4], 0.07, 1, st.trim, 6);
  }
  s.cone([2, 2, 9], 0.5, 84, gem, 10);
  s.cone([2.35, 1.75, 9], 0.18, 40, gem, 7);
  s.cone([1.65, 2.25, 9], 0.16, 34, gem, 7);
  s.cone([1.8, 1.65, 9], 0.14, 28, gem, 6);
  s.ellipsoid([2, 2, 96], [0.14, 0.14, 5], glowing);
  return renderSprite(`b_great_work_3_${st.tribe}`, s, 4, 4, 128, 10, {
    sparkle: [at(2, 2, 96)],
  });
}

// ---------------------------------------------------------------------------------------------
// Harbours

/**
 * A harbour's body: a house on a platform of timber piles standing in the water beside the pier,
 * with a crane, crates and a lamp on the deck. `axis` "y" is 3 tiles along x by 2 along y, "x" is
 * 2 by 3; doors face both open sides, so it reads whichever way the pier lies.
 */
/**
 * Deck planking: every board runs the full width of the deck, laid across it one after another,
 * each a slightly different tone, with a dark gap between boards and a nail near each edge.
 */
function deckBoards(axis: "x" | "y", width: number): Material {
  return (c) => {
    if (c.ln[2] < 0.8) return shade("timber", lit(c, 0.05), c.px, c.py, 0.2);
    const t = axis === "x" ? c.lp[0] : c.lp[1];
    const a = axis === "x" ? c.lp[1] : c.lp[0];
    const k = t / 0.16;
    const board = Math.floor(k);
    const inBoard = k - board;
    const tone = hash3(board, 3, 0, 9);
    let level = 0.46 + tone * 0.26 + noise3(a * 7, board, 0, 31) * 0.1;
    if (inBoard < 0.1) level -= 0.22;
    else if (inBoard > 0.88) level += 0.06;
    const nail = (a < 0.2 || a > width - 0.2) && inBoard > 0.4 && inBoard < 0.62;
    if (nail && (a < 0.13 || a > width - 0.13)) level -= 0.18;
    return shade("plank", level, c.px, c.py, 0.25);
  };
}

/** How high a harbour's deck stands above the water, in pixels (the game uses the same figure). */
const DECK_Z = 7;

function harbour(st: Style, axis: "x" | "y"): Sprite {
  const s = new Scene();
  const W = axis === "y" ? 3 : 2;
  const D = axis === "y" ? 2 : 3;
  const deck = DECK_Z;
  // Piles: round timbers from the sea bed up to the deck, braced along both open faces.
  const pile = planks("logs", "z", 0.05);
  const pilesAt = (len: number): number[] => {
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    return Array.from({ length: n }, (_, i) => 0.12 + ((len - 0.24) * i) / (n - 1));
  };
  for (const x of pilesAt(W))
    for (const y of [0.12, D - 0.12]) s.prism("z", [x, y, deck / 2], 0.075, deck / 2, pile, 8);
  for (const y of pilesAt(D)) {
    if (y > 0.2 && y < D - 0.2)
      for (const x of [0.12, W - 0.12]) s.prism("z", [x, y, deck / 2], 0.075, deck / 2, pile, 8);
  }
  for (const z of [1.6, 3.4]) {
    s.box([0.1, D - 0.18, z], [W - 0.1, D - 0.1, z + 0.55], flat("darkwood", 0.05));
    s.box([W - 0.18, 0.1, z], [W - 0.1, D - 0.1, z + 0.55], flat("darkwood", 0.05));
  }
  // The platform: planks laid across, a rim beam round the edge.
  s.box(
    [0.02, 0.02, deck - 1.6],
    [W - 0.02, D - 0.02, deck],
    deckBoards(axis === "y" ? "x" : "y", axis === "y" ? D : W),
  );
  s.box([0.0, D - 0.07, deck - 1.9], [W, D, deck - 0.2], flat("timber", 0.05));
  s.box([W - 0.07, 0.0, deck - 1.9], [W, D, deck - 0.2], flat("timber", 0.05));
  // The house, set in from the edge so there is a walkway round it.
  const top = 19;
  const openings: Opening[] = [
    { face: "+y", u0: W / 2 - 0.15, u1: W / 2 + 0.15, z0: deck + 3, z1: deck + 15, kind: "door" },
    { face: "+y", u0: 0.55, u1: 0.73, z0: deck + 8, z1: deck + 13, kind: "lit-window" },
    { face: "+x", u0: D / 2 - 0.15, u1: D / 2 + 0.15, z0: deck + 3, z1: deck + 15, kind: "door" },
    { face: "+x", u0: 0.55, u1: 0.73, z0: deck + 8, z1: deck + 13, kind: "window" },
  ];
  const x0 = 0.4;
  const y0 = 0.4;
  const x1 = W - 0.4;
  const y1 = D - 0.4;
  s.box([x0 - 0.04, y0 - 0.04, deck], [x1 + 0.04, y1 + 0.04, deck + 3], st.base);
  s.box([x0, y0, deck + 3], [x1, y1, deck + top], st.wall(top, openings, []));
  const peak = roof(s, st, x0, y0, x1, y1, deck + top, 14, axis === "y" ? "x" : "y");
  if (st.chimney) chimney(s, x1 - 0.25, y0 + 0.25, deck + top - 2, Math.max(peak + 3, deck + 44));
  // A loading crane at the corner furthest out, and crates, barrels and a lamp on the walkway.
  const cx = W - 0.2;
  const cy = D - 0.2;
  s.prism("z", [cx, cy, deck + 13], 0.06, 13, planks(st.wood, "z", 0.06), 8);
  strand(s, [cx, cy, deck + 25], [cx - 0.3, cy, deck + 22], 0.03, 1.2, st.trim, 5);
  strand(s, [cx - 0.3, cy, deck + 22], [cx - 0.3, cy, deck + 15], 0.012, 1.4, flat("thatch"), 4);
  s.box(
    [cx - 0.38, cy - 0.08, deck + 9],
    [cx - 0.22, cy + 0.08, deck + 15],
    planks(st.wood, "y", 0.07),
  );
  s.box([0.1, D - 0.34, deck], [0.34, D - 0.1, deck + 5], crateLike(st));
  s.prism("z", [W - 0.22, 0.2, deck + 3], 0.1, 3, planks("plank", "z", 0.05), 10);
  s.prism("z", [0.2, 0.2, deck + 6], 0.03, 6, st.trim, 5);
  lantern(s, 0.2, 0.2, deck + 10);
  s.prism("z", [x0 + 0.1, y0 + 0.1, deck + top + 8], 0.02, 6, st.trim, 5);
  s.box(
    [x0 + 0.08, y0 + 0.1, deck + top + 10],
    [x0 + 0.12, y0 + 0.36, deck + top + 15],
    stripes(st.accent),
  );
  return renderSprite(`b_harbour_${axis}_${st.tribe}`, s, W, D, 78, 14);
}

const crateLike = (st: Style): Material => planks(st.wood, "x", 0.07);

/**
 * A whole pier as one picture: planks laid across its full width, timber piles under it, rails
 * along both edges, bollards where ships tie up and a stone landing where it meets the shore.
 * `axis` is the way it runs; length and width are in tiles.
 */
function pierSprite(axis: "x" | "y", length: number, width = 3): Sprite {
  const s = new Scene();
  const W = axis === "x" ? length : width;
  const D = axis === "x" ? width : length;
  const deck = DECK_Z;
  // Position along (t, 0 at the shore) and across (c) the pier, as scene coordinates.
  const at = (t: number, c: number): [number, number] => (axis === "x" ? [t, c] : [c, t]);
  const box = (
    t0: number,
    c0: number,
    z0: number,
    t1: number,
    c1: number,
    z1: number,
    mat: Material,
  ) => {
    const [xa, ya] = at(t0, c0);
    const [xb, yb] = at(t1, c1);
    s.box([Math.min(xa, xb), Math.min(ya, yb), z0], [Math.max(xa, xb), Math.max(ya, yb), z1], mat);
  };
  const post = (t: number, c: number, z0: number, z1: number, r: number, mat: Material) => {
    const [x, y] = at(t, c);
    s.prism("z", [x, y, (z0 + z1) / 2], r, (z1 - z0) / 2, mat, 8);
  };
  // Piles: every two tiles along both edges and, on a long pier, down the middle.
  const pile = planks("logs", "z", 0.05);
  for (let t = 0.5; t < length; t += 2) {
    post(t, 0.1, 0, deck, 0.08, pile);
    post(t, width - 0.1, 0, deck, 0.08, pile);
    if (t % 4 < 2) post(t, width / 2, 0, deck, 0.08, pile);
  }
  // Cross-bracing between the piles, on the faces the camera sees.
  for (const z of [1.6, 3.4]) {
    box(0.1, width - 0.17, z, length, width - 0.1, z + 0.5, flat("darkwood", 0.05));
    if (axis === "x")
      box(length - 0.08, 0.1, z, length, width - 0.1, z + 0.5, flat("darkwood", 0.05));
    else box(0.1, length - 0.08, z, width - 0.1, length, z + 0.5, flat("darkwood", 0.05));
  }
  // Two long stringers and the deck: one board per slab, laid across the full width.
  box(0, 0.12, deck - 2.4, length, 0.3, deck - 1.4, flat("darkwood", 0.05));
  box(0, width - 0.3, deck - 2.4, length, width - 0.12, deck - 1.4, flat("darkwood", 0.05));
  box(0, 0, deck - 1.7, length, width, deck, deckBoards(axis, width));
  box(0, width - 0.08, deck - 1.9, length, width, deck - 0.2, flat("timber", 0.05));
  if (axis === "x")
    box(length - 0.08, 0, deck - 1.9, length, width, deck - 0.2, flat("timber", 0.05));
  else box(0, length - 0.08, deck - 1.9, width, length, deck - 0.2, flat("timber", 0.05));
  // A stone landing where the pier leaves the shore.
  box(0, 0, deck - 1.7, 0.7, width, deck + 0.4, bricks("stone", 2, 0.2));
  // Rails: posts every tile along both edges with a rope-and-timber rail between them.
  for (const c of [0.06, width - 0.06]) {
    for (let t = 0.9; t < length; t += 1) post(t, c, deck, deck + 3, 0.04, flat("timber"));
    box(0.8, c - 0.02, deck + 2.6, length, c + 0.02, deck + 3.3, flat("timber", 0.05));
  }
  // Bollards where ships tie up: two beside each berth, on both edges.
  for (let t = 0.6; t + 2.4 <= length + 0.01; t += 3) {
    for (const c of [0.3, width - 0.3])
      for (const dt of [0, 1.8]) {
        post(t + dt, c, deck, deck + 2.2, 0.085, flat("basalt", 0.1));
        const [x, y] = at(t + dt, c);
        s.ellipsoid([x, y, deck + 2.6], [0.1, 0.1, 0.8], flat("basalt", 0.2));
      }
  }
  const name = `pier_${axis}_${length}`;
  return renderSprite(name, s, W, D, 24, 10, undefined, { depthEdges: false });
}

/** Things that stand on a pier: drawn on one tile, placed by the game according to the upgrades. */
function pierProps(): Sprite[] {
  const out: Sprite[] = [];
  const deck = DECK_Z;
  const prop = (name: string, draw: (s: Scene) => void, height = 30): void => {
    const s = new Scene();
    draw(s);
    out.push(renderSprite(`pier_p_${name}`, s, 1, 1, height, 8, undefined, { depthEdges: false }));
  };
  const crate = (s: Scene, x: number, y: number, z: number, size: number, axis: "x" | "y") =>
    s.box(
      [x - size, y - size, z],
      [x + size, y + size, z + size * 2 * 8],
      planks("plank", axis, 0.09),
    );
  prop("crate", (s) => crate(s, 0.5, 0.5, deck, 0.2, "x"));
  prop("crates", (s) => {
    crate(s, 0.35, 0.4, deck, 0.2, "x");
    crate(s, 0.68, 0.62, deck, 0.2, "y");
    crate(s, 0.4, 0.42, deck + 6.4, 0.16, "y");
  });
  prop("barrel", (s) => {
    s.prism("z", [0.5, 0.5, deck + 3.4], 0.2, 3.4, planks("plank", "z", 0.06), 12);
    s.box([0.3, 0.3, deck + 2], [0.7, 0.7, deck + 2.6], flat("basalt", 0.1));
  });
  prop("barrels", (s) => {
    for (const [x, y] of [
      [0.32, 0.36],
      [0.68, 0.4],
      [0.5, 0.7],
    ] as const)
      s.prism("z", [x, y, deck + 3.2], 0.17, 3.2, planks("plank", "z", 0.06), 12);
  });
  prop(
    "stack",
    (s) => {
      // A warehouse pile: crates three high with a sack on top.
      crate(s, 0.3, 0.3, deck, 0.22, "x");
      crate(s, 0.72, 0.3, deck, 0.22, "y");
      crate(s, 0.3, 0.72, deck, 0.22, "y");
      crate(s, 0.72, 0.72, deck, 0.22, "x");
      crate(s, 0.5, 0.5, deck + 7, 0.22, "x");
      s.ellipsoid([0.5, 0.5, deck + 16], [0.2, 0.18, 2.4], flat("sail", 0.05));
    },
    40,
  );
  prop("ingots", (s) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3 - i; j++)
        s.box(
          [0.2 + i * 0.12 + j * 0.24, 0.3, deck + i * 2.2],
          [0.4 + i * 0.12 + j * 0.24, 0.7, deck + i * 2.2 + 2],
          flat("silver", 0.12),
        );
  });
  prop("coil", (s) => {
    s.ellipsoid([0.5, 0.5, deck + 1.2], [0.22, 0.22, 1.3], flat("thatch", 0.05));
    s.ellipsoid([0.5, 0.5, deck + 2.2], [0.14, 0.14, 0.8], flat("thatch", 0.12));
  });
  prop(
    "lamp",
    (s) => {
      s.prism("z", [0.5, 0.5, deck + 7], 0.04, 7, flat("darkwood"), 8);
      lantern(s, 0.5, 0.5, deck + 12);
    },
    34,
  );
  // Cannons on carriages, one for each way the muzzle can point.
  ["+y", "+x", "-y", "-x"].forEach((dir, i) =>
    prop(`cannon_${dir}`, (s) => {
      s.withYaw((i * Math.PI) / 2, [0.5, 0.5], () => {
        s.box([0.4, 0.36, deck], [0.6, 0.6, deck + 2.6], planks("plank", "y", 0.06));
        s.prism("y", [0.5, 0.56, deck + 4.2], 0.08, 0.26, flat("hull", 0.15), 8);
      });
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

/** Pier tile; planks run along `dir`. */
function dockTile(dir: "x" | "y", end: boolean): Sprite {
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

function scaffold(w: number, h: number): Sprite {
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

/** Colours that read as light: lit window glass and the fire of a forge. */
const LIGHT_COLOURS = new Set(
  [...RAMPS.glass.slice(2), ...RAMPS.fire.slice(2)].map((h) => hexToRgba(h).slice(0, 3).join(",")),
);

/**
 * Where a building shines at night: the warm pixels of its lit windows and fires, grouped into
 * small clusters, as offsets from the sprite's anchor with a glow radius. The game turns each
 * into a soft glow that comes up at dusk.
 */
function findLights(sprite: Sprite): { x: number; y: number; r: number }[] {
  // Offsets and radii are in world pixels; the sprite's own pixels may be finer.
  const res = (sprite.meta?.res as number | undefined) ?? 1;
  const cell = 6 * res;
  const groups = new Map<string, { x: number; y: number; n: number }>();
  for (let y = 0; y < sprite.canvas.height; y++)
    for (let x = 0; x < sprite.canvas.width; x++) {
      const [r, g, b, a] = sprite.canvas.get(x, y);
      if (a < 255 || !LIGHT_COLOURS.has(`${r},${g},${b}`)) continue;
      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      const group = groups.get(key) ?? { x: 0, y: 0, n: 0 };
      group.x += x;
      group.y += y;
      group.n++;
      groups.set(key, group);
    }
  return [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((g) => ({
      x: Math.round((g.x / g.n - sprite.anchorX) / res),
      y: Math.round((g.y / g.n - sprite.anchorY) / res),
      r: Math.round(9 + 2.2 * Math.sqrt(g.n / (res * res))),
    }));
}

/** Give a finished building sprite its night lights, if it has any. */
export function withLights(sprite: Sprite): Sprite {
  if (sprite.name.startsWith("b_farm")) return sprite;
  const lights = findLights(sprite);
  return lights.length === 0 ? sprite : { ...sprite, meta: { ...sprite.meta, lights } };
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
      lighthouse(st),
      greatWork(st, 1),
      greatWork(st, 2),
      greatWork(st, 3),
      harbour(st, "x"),
      harbour(st, "y"),
    );
  }
  out.push(dockTile("x", false), dockTile("x", true), dockTile("y", false), dockTile("y", true));
  for (const axis of ["x", "y"] as const)
    for (const length of [5, 10, 15]) out.push(pierSprite(axis, length));
  out.push(...pierProps());
  for (const [w, h] of [
    [1, 1],
    [2, 2],
    [3, 3],
    [3, 2],
    [2, 3],
    [4, 4],
  ] as const) {
    out.push(scaffold(w, h));
  }
  return out.map(withLights);
}

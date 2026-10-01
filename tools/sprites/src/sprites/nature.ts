// Harvestable plants and rocks for every biome, plus stumps, saplings and sea rocks.
// Names: n_<kind>_<variant> when grown, n_<kind>_bare for picked food plants,
// n_stump_<style> and n_sapling_<style> for regrowth stages.
import { NODE_VARIANTS, Z_SCALE } from "@explorer/shared";
import { Canvas } from "../canvas";
import { rocky } from "../materials";
import { hash3, noise3, prng } from "../noise3";
import { RAMPS, hexToRgba, rampColor, shade, type RampName, type Rgba } from "../palette";
import { flat, lit, Scene, type Material, type ShadeContext, type Vec3 } from "../raytrace";
import { renderSprite, SPRITE_RES, trimmed, type Sprite } from "../sprite";

type Extra = (c: ShadeContext, v: number) => Rgba | null;

/** Foliage: a bumpy normal gives clumps of light and shadow, like painted leaf clusters. */
export function foliage(
  rampName: RampName,
  scale = 9,
  extras?: Extra,
  bumpiness = 1.3,
  bias = 0,
): Material {
  return (c) => {
    const [x, y, z] = [c.p[0] * scale, c.p[1] * scale, c.p[2] / (32 / scale)];
    const bump: Vec3 = [
      noise3(x, y, z, 1) - 0.5,
      noise3(x, y, z, 2) - 0.5,
      noise3(x, y, z, 3) - 0.5,
    ];
    // A second, finer layer of bumps: single leaves catching the light within each clump.
    const [fx, fy, fz] = [x * 3.3, y * 3.3, z * 3.3];
    const leaf: Vec3 = [
      noise3(fx, fy, fz, 6) - 0.5,
      noise3(fx, fy, fz, 7) - 0.5,
      noise3(fx, fy, fz, 8) - 0.5,
    ];
    const k = bumpiness;
    const n: Vec3 = [
      c.n[0] + bump[0] * k + leaf[0] * k * 0.85,
      c.n[1] + bump[1] * k + leaf[1] * k * 0.85,
      c.n[2] + bump[2] * k + leaf[2] * k * 0.85,
    ];
    const v =
      0.16 +
      0.9 * c.lightFor(n) +
      (noise3(x * 2, y * 2, z * 2, 4) - 0.5) * 0.16 +
      (noise3(fx * 1.7, fy * 1.7, fz * 1.7, 9) - 0.5) * 0.13 +
      bias;
    const extra = extras?.(c, v);
    if (extra) return extra;
    return shade(rampName, v, c.px, c.py, 0.4);
  };
}

/** Occasional coloured pixels (fruit, berries, flowers) on the lit side of foliage. */
export function dots(ramp: RampName, chance: number, seed: number, minLight = 0.35): Extra {
  return (c, v) => {
    // Texels are half a world pixel: a little fewer of them, so berries stay berries.
    if (v > minLight && hash3(c.px, c.py, 0, seed) > 1 - chance * 0.7) {
      const colors = rampLength(ramp);
      return rampColor(ramp, v > 0.7 ? colors - 2 : colors - 3);
    }
    return null;
  };
}

function rampLength(ramp: RampName): number {
  return RAMPS[ramp].length;
}

const barkOf =
  (ramp: RampName, bias = 0.1): Material =>
  (c) => {
    const streak = hash3(Math.floor((c.p[0] - c.p[1]) * 60), 0, 0, 3) < 0.3 ? -0.15 : 0;
    return shade(ramp, lit(c, bias + streak), c.px, c.py, 0.2);
  };
const bark = barkOf("timber");

export function canopy(
  s: Scene,
  rand: () => number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  rz: number,
  blobs: number,
  mat: Material,
): void {
  s.ellipsoid([cx, cy, cz], [r * 0.85, r * 0.85, rz * 0.85], mat);
  // Small clumps of leaves round the rim: a scalloped, less blobby silhouette.
  for (let i = 0; i < Math.round(blobs * 0.9); i++) {
    const a = rand() * Math.PI * 2;
    const tilt = (rand() - 0.4) * 1.5;
    const dist = r * (0.72 + rand() * 0.3);
    const br = r * (0.2 + rand() * 0.14);
    s.ellipsoid(
      [cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, cz + tilt * rz * 0.85],
      [br, br, br * 19.6 * 0.9],
      mat,
    );
  }
  for (let i = 0; i < blobs; i++) {
    const a = rand() * Math.PI * 2;
    const tilt = (rand() - 0.35) * 1.3;
    const dist = r * (0.55 + rand() * 0.25);
    const br = r * (0.42 + rand() * 0.2);
    s.ellipsoid(
      [cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, cz + tilt * rz * 0.8],
      [br, br, br * 19.6 * 0.9],
      mat,
    );
  }
}

/** A string of small blobs from `a` to `b` (x, y tiles; z px): branches, fronds, vines. */
export function strand(
  s: Scene,
  a: Vec3,
  b: Vec3,
  r: number,
  rz: number,
  mat: Material,
  steps = 6,
): void {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    s.ellipsoid(
      [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      [r, r, rz],
      mat,
      {
        castsShadow: true,
      },
    );
  }
}

const SHADOW = { x0: -0.4, y0: -0.4, x1: 1.6, y1: 1.6 };

// --- Broadleaf trees --------------------------------------------------------------------------

function broadleaf(
  name: string,
  seed: number,
  size: number,
  leaves: Material,
  trunk = bark,
  trunkH = 7,
): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  s.groundShadow = SHADOW;
  s.prism("z", [0.5, 0.5, trunkH], 0.085, trunkH, trunk, 7);
  s.prism("z", [0.5, 0.5, 1.5], 0.12, 1.5, trunk, 7);
  canopy(s, rand, 0.5, 0.5, (trunkH + 16) * size, 0.56 * size, 13 * size, 11, leaves);
  return renderSprite(name, s, 1, 1, 64, 12);
}

const oak = (v: number) =>
  broadleaf(`n_oak_${v}`, 1000 + v * 77, [1, 0.9, 1.12][v]!, foliage("leaf", 7, undefined, 1));
const autumn = (v: number) =>
  broadleaf(
    `n_autumn_tree_${v}`,
    1500 + v * 71,
    [1, 0.92, 1.08][v]!,
    foliage("autumnLeaf", 7, undefined, 1, [-0.02, -0.14, 0.12][v]),
  );
const blossom = (v: number) =>
  broadleaf(
    `n_blossom_tree_${v}`,
    1700 + v * 53,
    [1, 0.9][v]!,
    foliage("petal", 7, dots("plaster", 0.05, 41), 1, v === 1 ? 0.1 : 0),
    barkOf("timber", 0.05),
    6,
  );

function fruitTree(bare: boolean): Sprite {
  return broadleaf(
    bare ? "n_fruit_bare" : "n_fruit_0",
    4242,
    0.82,
    foliage("leaf", 7, bare ? undefined : dots("fruit", 0.07, 17)),
    bark,
    6,
  );
}

function silverTree(v: number): Sprite {
  const rand = prng(1900 + v * 13);
  const s = new Scene();
  s.groundShadow = SHADOW;
  const trunk = barkOf("silver", 0.2);
  s.prism("z", [0.5, 0.5, 10], 0.05, 10, trunk, 7);
  const leaves = foliage("silver", 9, dots("crystal", 0.04, 43, 0.5), 1.1, 0.05);
  canopy(s, rand, 0.5, 0.5, 26, 0.36, 15, 8, leaves);
  canopy(s, rand, 0.5, 0.5, 38, 0.22, 8, 4, leaves);
  return renderSprite(`n_silver_tree_${v}`, s, 1, 1, 64, 12);
}

function jungleTree(v: number): Sprite {
  const rand = prng(2600 + v * 19);
  const s = new Scene();
  s.groundShadow = { x0: -0.6, y0: -0.6, x1: 1.8, y1: 1.8 };
  s.prism("z", [0.5, 0.5, 13], 0.1, 13, barkOf("timber", 0.05), 8);
  // Buttress roots.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    strand(
      s,
      [0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22, 0],
      [0.5, 0.5, 6],
      0.05,
      1.5,
      bark,
      3,
    );
  }
  const leaves = foliage("jungle", 7, undefined, 1.2);
  canopy(s, rand, 0.5, 0.5, 30, 0.7, 9, 12, leaves);
  canopy(s, rand, 0.45, 0.52, 40, 0.42, 7, 6, leaves);
  // Hanging vines.
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const x = 0.5 + Math.cos(a) * 0.55;
    const y = 0.5 + Math.sin(a) * 0.55;
    strand(s, [x, y, 26], [x, y, 12 + rand() * 6], 0.02, 1.2, flat("jungle", -0.2), 5);
  }
  return renderSprite(`n_jungle_tree_${v}`, s, 1, 1, 72, 14);
}

function willow(v: number): Sprite {
  const rand = prng(2700 + v * 7);
  const s = new Scene();
  s.groundShadow = SHADOW;
  s.prism("z", [0.5, 0.5, 8], 0.09, 8, barkOf("darkwood", 0.15), 7);
  const leaves = foliage("willow", 8, undefined, 1.1);
  canopy(s, rand, 0.5, 0.5, 24, 0.5, 9, 8, leaves);
  // Drooping curtains of leaves.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = 0.44 + rand() * 0.08;
    const x = 0.5 + Math.cos(a) * r;
    const y = 0.5 + Math.sin(a) * r;
    s.ellipsoid([x, y, 16 + rand() * 3], [0.06, 0.06, 7 + rand() * 3], leaves);
  }
  return renderSprite(`n_willow_${v}`, s, 1, 1, 56, 12);
}

// --- Conifers --------------------------------------------------------------------------------

function conifer(name: string, seed: number, tall: number, needles: Material): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  s.groundShadow = SHADOW;
  s.prism("z", [0.5, 0.5, 5], 0.055, 5, bark, 6);
  for (let k = 0; k < 4; k++) {
    const base = (6 + k * 9) * tall;
    const r = (0.4 - k * 0.075) * (0.95 + rand() * 0.1);
    const h = (17 - k * 1.5) * tall;
    s.cone([0.5, 0.5, base], r, h, needles, 12);
    // Drooping branch tips break up the cone's straight silhouette.
    const tips = 9 - k;
    for (let i = 0; i < tips; i++) {
      const a = (i / tips) * Math.PI * 2 + rand() * 0.5;
      s.ellipsoid(
        [0.5 + Math.cos(a) * r * 0.85, 0.5 + Math.sin(a) * r * 0.85, base + 1.5],
        [0.07, 0.07, 2.4],
        needles,
      );
    }
  }
  return renderSprite(name, s, 1, 1, 66, 12);
}

const pine = (v: number) =>
  conifer(`n_pine_${v}`, 2000 + v * 31, [1, 1.15, 0.88][v]!, foliage("pine", 12, undefined, 1.1));

/** Snow settles on the upward-facing needles. */
const snowy: Material = (() => {
  const needles = foliage("pine", 12, undefined, 1.1);
  return (c) => {
    const n = noise3(c.p[0] * 14, c.p[1] * 14, c.p[2] / 3, 88);
    if (c.n[2] > 0.35 + n * 0.3) return shade("snow", 0.45 + c.light * 0.6, c.px, c.py, 0.3);
    return needles(c);
  };
})();
const snowPine = (v: number) => conifer(`n_snow_pine_${v}`, 2100 + v * 17, [1, 0.9][v]!, snowy);

// --- Dead and alien trees ----------------------------------------------------------------------

function charredTree(v: number): Sprite {
  const rand = prng(2800 + v * 23);
  const s = new Scene();
  s.groundShadow = SHADOW;
  const wood: Material = (c) => {
    const crack = Math.abs(noise3(c.p[0] * 30, c.p[1] * 30, c.p[2] / 2, 90) - 0.5);
    if (crack < 0.04 && c.lp[2] < 20) return rampColor("lava", 3);
    return shade("charred", lit(c, 0.05), c.px, c.py, 0.2);
  };
  const h = 24 + v * 6;
  s.prism("z", [0.5, 0.5, h / 2], 0.07, h / 2, wood, 7);
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const z0 = 10 + rand() * (h - 12);
    const len = 0.22 + rand() * 0.18;
    strand(
      s,
      [0.5, 0.5, z0],
      [0.5 + Math.cos(a) * len, 0.5 + Math.sin(a) * len, z0 + 6 + rand() * 6],
      0.025,
      1.2,
      wood,
      5,
    );
  }
  return renderSprite(`n_charred_tree_${v}`, s, 1, 1, 50, 10);
}

function giantMushroom(v: number): Sprite {
  const s = new Scene();
  s.groundShadow = SHADOW;
  const h = v === 0 ? 20 : 15;
  const capRamp: RampName = v === 0 ? "capRed" : "arcane";
  s.prism("z", [0.5, 0.5, h / 2], 0.1, h / 2, flat("stalk", 0.1), 10);
  s.ellipsoid([0.5, 0.5, 2], [0.14, 0.14, 3], flat("stalk"));
  const cap: Material = (c) => {
    if (c.n[2] < -0.2) return shade("stalk", 0.3 + c.light * 0.3, c.px, c.py);
    const spot = noise3(c.p[0] * 16, c.p[1] * 16, c.p[2] / 2, 55) > 0.72;
    if (spot && c.n[2] > 0.2) return rampColor("stalk", 5);
    return shade(capRamp, lit(c, 0.08), c.px, c.py, 0.3);
  };
  s.ellipsoid([0.5, 0.5, h + 1], [0.5, 0.5, 5.5], cap);
  s.ellipsoid([0.5, 0.5, h + 4], [0.34, 0.34, 4], cap);
  return renderSprite(`n_giant_mushroom_${v}`, s, 1, 1, 44, 10);
}

function palm(v: number): Sprite {
  const rand = prng(3100 + v * 29);
  const s = new Scene();
  s.groundShadow = SHADOW;
  const lean = v === 0 ? 0.18 : -0.14;
  const top: Vec3 = [0.5 + lean, 0.5 - lean * 0.4, 30];
  const trunk: Material = (c) =>
    shade("timber", lit(c, 0.25 + ((c.lp[2] / 3) % 1 < 0.35 ? -0.15 : 0)), c.px, c.py, 0.2);
  strand(s, [0.5, 0.5, 0], top, 0.06, 1.6, trunk, 12);
  const fronds = foliage("jungle", 10, undefined, 0.8, 0.05);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const len = 0.42 + rand() * 0.1;
    const mid: Vec3 = [
      top[0] + Math.cos(a) * len * 0.5,
      top[1] + Math.sin(a) * len * 0.5,
      top[2] + 3,
    ];
    const end: Vec3 = [top[0] + Math.cos(a) * len, top[1] + Math.sin(a) * len, top[2] - 6];
    strand(s, top, mid, 0.05, 1.3, fronds, 4);
    strand(s, mid, end, 0.045, 1.2, fronds, 4);
  }
  for (let i = 0; i < 3; i++)
    s.ellipsoid(
      [top[0] + (i - 1) * 0.05, top[1] + 0.04, top[2] - 2],
      [0.035, 0.035, 1.6],
      flat("timber", -0.05),
    );
  return renderSprite(`n_palm_${v}`, s, 1, 1, 56, 12);
}

// --- Food plants ------------------------------------------------------------------------------

function bush(
  name: string,
  seed: number,
  ramp: RampName,
  r: number,
  extras?: Extra,
  bias = 0,
): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  canopy(s, rand, 0.5, 0.5, 6, r, 6, 6, foliage(ramp, 11, extras, 1.3, bias));
  return renderSprite(name, s, 1, 1, 24, 8);
}

function withSnow(base: Material): Material {
  return (c) =>
    c.n[2] > 0.55 && noise3(c.p[0] * 20, c.p[1] * 20, 0, 5) > 0.35
      ? shade("snow", 0.5 + c.light * 0.5, c.px, c.py)
      : base(c);
}

function frostBerry(bare: boolean): Sprite {
  const rand = prng(6100);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  canopy(
    s,
    rand,
    0.5,
    0.5,
    6,
    0.28,
    6,
    6,
    withSnow(foliage("pine", 11, bare ? undefined : dots("clothBlue", 0.12, 31, 0.25))),
  );
  return renderSprite(bare ? "n_frost_berry_bare" : "n_frost_berry_0", s, 1, 1, 24, 8);
}

function cactus(v: number, bare: boolean): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const skin: Material = (c) => {
    const rib = Math.abs(Math.sin(Math.atan2(c.lp[1] - 0.5, c.lp[0] - 0.5) * 4)) < 0.3 ? -0.14 : 0;
    return shade("cactus", lit(c, 0.05 + rib), c.px, c.py, 0.25);
  };
  const h = v === 0 ? 20 : 14;
  s.prism("z", [0.5, 0.5, h / 2], 0.1, h / 2, skin, 10);
  s.ellipsoid([0.5, 0.5, h], [0.1, 0.1, 2], skin);
  const arm = (dx: number, dy: number, z: number, up: number) => {
    s.prism(dx !== 0 ? "x" : "y", [0.5 + dx * 0.12, 0.5 + dy * 0.12, z], 0.06, 0.1, skin, 8);
    s.prism("z", [0.5 + dx * 0.2, 0.5 + dy * 0.2, z + up / 2], 0.06, up / 2, skin, 8);
    s.ellipsoid([0.5 + dx * 0.2, 0.5 + dy * 0.2, z + up], [0.06, 0.06, 1.3], skin);
  };
  arm(1, 0, h * 0.45, 6);
  if (v === 0) arm(0, 1, h * 0.6, 5);
  if (!bare) {
    s.ellipsoid([0.5, 0.5, h + 2], [0.05, 0.05, 1.5], flat("petal", 0.2));
    s.ellipsoid([0.5 + 0.2, 0.5, h * 0.45 + 7.5], [0.04, 0.04, 1.2], flat("pumpkin", 0.2));
  }
  return renderSprite(bare ? "n_cactus_bare" : `n_cactus_${v}`, s, 1, 1, 34, 8);
}

function emberFruit(bare: boolean): Sprite {
  const rand = prng(6300);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const twig: Material = (c) => shade("charred", lit(c, 0.1), c.px, c.py);
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    strand(
      s,
      [0.5, 0.5, 0],
      [0.5 + Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.25, 8 + rand() * 5],
      0.02,
      1,
      twig,
      5,
    );
    if (!bare)
      s.ellipsoid(
        [0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22, 9 + rand() * 4],
        [0.05, 0.05, 1.6],
        (c) => rampColor("lava", c.light > 0.3 ? 5 : 4),
      );
  }
  return renderSprite(bare ? "n_ember_fruit_bare" : "n_ember_fruit_0", s, 1, 1, 24, 8);
}

function banana(bare: boolean): Sprite {
  const rand = prng(6400);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  s.prism("z", [0.5, 0.5, 5], 0.05, 5, flat("sprout", -0.1), 8);
  const leaf = foliage("jungle", 10, undefined, 0.7, 0.1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.3;
    strand(
      s,
      [0.5, 0.5, 9],
      [0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38, 13 - rand() * 6],
      0.06,
      1,
      leaf,
      5,
    );
  }
  if (!bare)
    for (let i = 0; i < 4; i++)
      s.ellipsoid(
        [0.56 + (i % 2) * 0.04, 0.5, 6 + i * 1.3],
        [0.05, 0.04, 1.2],
        flat("banana", 0.1),
      );
  return renderSprite(bare ? "n_banana_bare" : "n_banana_0", s, 1, 1, 26, 8);
}

function shroomPatch(
  name: string,
  capRamp: RampName,
  emissive: boolean,
  bare: boolean,
  seed: number,
): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 };
  const cap: Material = (c) =>
    emissive ? rampColor(capRamp, c.light > 0.2 ? 5 : 4) : shade(capRamp, lit(c, 0.1), c.px, c.py);
  const count = bare ? 2 : 5;
  for (let i = 0; i < count; i++) {
    const x = 0.25 + rand() * 0.5;
    const y = 0.25 + rand() * 0.5;
    const h = (bare ? 3 : 5) + rand() * 6;
    s.prism("z", [x, y, h / 2], 0.03, h / 2, flat("stalk", 0.1), 6);
    s.ellipsoid([x, y, h], [0.11 + rand() * 0.05, 0.11, 2.6], cap);
  }
  return renderSprite(name, s, 1, 1, 18, 6);
}

function pumpkinPatch(bare: boolean): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 };
  const vine = flat("sprout", -0.05);
  strand(s, [0.2, 0.3, 0.5], [0.8, 0.7, 0.5], 0.03, 0.8, vine, 8);
  strand(s, [0.3, 0.8, 0.5], [0.7, 0.25, 0.5], 0.03, 0.8, vine, 8);
  if (!bare) {
    const skin: Material = (c) => {
      const rib =
        Math.abs(Math.sin(Math.atan2(c.lp[1] - c.p[1], 1) + c.lp[0] * 40)) < 0.2 ? -0.12 : 0;
      return shade("pumpkin", lit(c, 0.05 + rib), c.px, c.py, 0.25);
    };
    for (const [x, y, r] of [
      [0.44, 0.44, 0.22],
      [0.7, 0.64, 0.16],
      [0.28, 0.7, 0.14],
    ] as const) {
      s.ellipsoid([x, y, r * 12], [r, r, r * 14], skin);
      s.prism("z", [x, y, r * 25], 0.015, 1.5, flat("timber"), 5);
    }
  } else {
    for (let i = 0; i < 5; i++)
      s.ellipsoid([0.3 + i * 0.1, 0.5 + (i % 2) * 0.1, 1], [0.06, 0.05, 1.5], vine);
  }
  return renderSprite(bare ? "n_pumpkin_bare" : "n_pumpkin_0", s, 1, 1, 20, 6);
}

// --- Rocks and deposits ----------------------------------------------------------------------

/** Angular rock: an ellipsoid's support planes in random directions, jittered. */
function rock(
  s: Scene,
  rand: () => number,
  center: Vec3,
  radii: Vec3,
  mat: Material,
  facets = 18,
): void {
  const c: Vec3 = [center[0], center[1], center[2] / Z_SCALE];
  const r: Vec3 = [radii[0], radii[1], radii[2] / Z_SCALE];
  const planes: { n: Vec3; d: number }[] = [{ n: [0, 0, -1], d: -Math.max(0, c[2] - r[2]) }];
  // An even ring of steep side facets bounds the shape; random facets on top add the chips.
  const ring = 8;
  for (let i = 0; i < ring + facets; i++) {
    const a = i < ring ? ((i + rand() * 0.4) / ring) * Math.PI * 2 : rand() * Math.PI * 2;
    const z = i < ring ? 0.1 + rand() * 0.25 : Math.min(1, 0.2 + rand() * 0.85);
    const h = Math.sqrt(1 - z * z);
    const n: Vec3 = [Math.cos(a) * h, Math.sin(a) * h, z];
    const support = Math.hypot(r[0] * n[0], r[1] * n[1], r[2] * n[2]) * (0.82 + rand() * 0.18);
    planes.push({ n, d: n[0] * c[0] + n[1] * c[1] + n[2] * c[2] + support });
  }
  s.convex(planes, mat);
}

function rockPile(name: string, seed: number, mat: Material, big = 1, height = 9): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  rock(s, rand, [0.5, 0.5, 3], [0.34 * big, 0.3 * big, height * big], mat);
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    rock(
      s,
      rand,
      [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3, 1],
      [0.14 + rand() * 0.06, 0.12 + rand() * 0.05, 4 + rand() * 2],
      mat,
      12,
    );
  }
  return renderSprite(name, s, 1, 1, 36, 8);
}

/** Rock with coloured flecks or veins of something valuable. */
function veined(base: Material, vein: RampName, seed: number, amount = 0.2, scale = 22): Material {
  return (c) => {
    const k = noise3(c.p[0] * scale, c.p[1] * scale, c.p[2] / 1.5, seed);
    if (k > 1 - amount) return rampColor(vein, c.light > 0.3 ? rampLength(vein) - 2 : 2);
    return base(c);
  };
}

function deposit(name: string, seed: number, mat: Material): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.3, y0: -0.3, x1: 1.3, y1: 1.3 };
  const rand = prng(seed);
  rock(s, rand, [0.5, 0.5, 4], [0.42, 0.36, 13], mat, 20);
  rock(s, rand, [0.18, 0.66, 1], [0.18, 0.16, 6], mat, 12);
  rock(s, rand, [0.74, 0.26, 1], [0.16, 0.14, 6], mat, 12);
  return renderSprite(name, s, 1, 1, 36, 8);
}

/** Glossy stone: sharp highlights on well-lit facets. */
function glossy(ramp: RampName, highlight: RampName): Material {
  return (c) =>
    c.light > 0.62
      ? rampColor(highlight, rampLength(highlight) - 2)
      : shade(ramp, lit(c, -0.05), c.px, c.py, 0.25);
}

/**
 * A far biome's signature deposit: amber gems, icy shards, pearls or glowing caps, on a base of
 * the local rock. Each is a small cluster that catches the light, so it reads as treasure.
 */
function signatureDeposit(kind: "sunstone" | "rimeglass" | "mirepearl" | "glowcap"): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const rand = prng(4100 + kind.length * 17);
  const shine =
    (ramp: RampName, bias = 0.35): Material =>
    (c) =>
      shade(ramp, bias + 0.8 * c.light + (c.n[2] > 0.3 ? 0.1 : 0), c.px, c.py, 0.2);
  if (kind === "sunstone") {
    rock(s, rand, [0.5, 0.5, 1], [0.34, 0.3, 4], rocky("sandstone", 7, 0), 14);
    const gem = shine("sunflower", 0.3);
    for (const [x, y, r, h] of [
      [0.5, 0.5, 0.15, 24],
      [0.3, 0.6, 0.1, 15],
      [0.68, 0.4, 0.11, 17],
      [0.6, 0.68, 0.08, 11],
      [0.36, 0.34, 0.08, 12],
    ] as const)
      s.cone([x, y, 3], r, h, gem, 6);
  } else if (kind === "rimeglass") {
    rock(s, rand, [0.5, 0.5, 1], [0.34, 0.3, 4], glossy("ice", "snow"), 14);
    const shard = shine("ice", 0.4);
    for (const [x, y, r, h] of [
      [0.5, 0.5, 0.09, 40],
      [0.36, 0.44, 0.07, 28],
      [0.64, 0.56, 0.07, 32],
      [0.5, 0.7, 0.06, 20],
      [0.28, 0.66, 0.05, 15],
    ] as const)
      s.cone([x, y, 3], r, h, shard, 5);
  } else if (kind === "mirepearl") {
    rock(s, rand, [0.5, 0.5, 1], [0.38, 0.32, 3], rocky("swampGround", 7, 0.3), 14);
    const pearl = shine("glow", 0.25);
    for (const [x, y, z, r] of [
      [0.42, 0.46, 6, 0.13],
      [0.62, 0.52, 5, 0.11],
      [0.5, 0.64, 4.5, 0.09],
      [0.34, 0.62, 4, 0.07],
    ] as const)
      s.ellipsoid([x, y, z], [r, r, r * 22], pearl);
  } else {
    rock(s, rand, [0.5, 0.5, 1], [0.34, 0.3, 3], rocky("basalt", 7, 0), 12);
    const cap = shine("glow", 0.3);
    const stalk = flat("stalk", 0.05);
    for (const [x, y, h, r] of [
      [0.5, 0.5, 16, 0.17],
      [0.32, 0.56, 10, 0.12],
      [0.68, 0.42, 12, 0.13],
      [0.56, 0.7, 7, 0.09],
    ] as const) {
      s.prism("z", [x, y, 3 + h / 2], 0.03, h / 2, stalk, 6);
      s.ellipsoid([x, y, 3 + h], [r, r, 4], cap);
    }
  }
  return renderSprite(`n_${kind}_0`, s, 1, 1, 52, 10);
}

function crystalCluster(v: number): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const gem: Material = (c) =>
    shade("crystal", 0.35 + 0.8 * c.light + (c.n[2] > 0.3 ? 0.1 : 0), c.px, c.py, 0.2);
  const rand = prng(3700 + v);
  rock(s, rand, [0.5, 0.5, 1], [0.26, 0.22, 5], rocky("crystalGround", 8), 12);
  const spikes = v === 0 ? 5 : 4;
  s.withYaw(v * 0.6, [0.5, 0.5], () => {
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const d = i === 0 ? 0 : 0.14;
      s.cone(
        [0.5 + Math.cos(a) * d * 1.3, 0.5 + Math.sin(a) * d * 1.3, 2],
        i === 0 ? 0.17 : 0.11,
        i === 0 ? 36 : 18 + rand() * 9,
        gem,
        6,
      );
    }
  });
  return renderSprite(`n_crystal_${v}`, s, 1, 1, 52, 10);
}

/** A boulder formation: a main mass with lobes, mossy on top, lit from the upper left. */
function boulders(
  name: string,
  seed: number,
  size: number,
  moss: number,
  opts: { shadow: boolean; lobes: number; res?: number },
): Sprite {
  const rand = prng(seed);
  const s = new Scene();
  if (opts.shadow) s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.25, y1: 1.25 };
  const mat = rocky("rock", 6, moss);
  const mainH = (9 + rand() * 5) * size;
  rock(s, rand, [0.5, 0.5, 2], [0.4 * size, 0.33 * size, mainH], mat, 22);
  const slots: [number, number][] = [
    [0.24, 0.7],
    [0.76, 0.3],
    [0.7, 0.74],
    [0.3, 0.26],
  ];
  for (let i = 0; i < opts.lobes; i++) {
    const [x, y] = slots[(i + Math.floor(rand() * 2)) % slots.length]!;
    const r = (0.16 + rand() * 0.08) * size;
    rock(s, rand, [x, y, 0], [r, r * 0.85, (5 + rand() * 5) * size], mat, 12);
  }
  return renderSprite(name, s, 1, 1, 34 * size, 8, undefined, { res: opts.res ?? SPRITE_RES });
}

/** A ring of surf around a rock's base, with a few loose wave arcs beyond it. */
function surf(canvas: Canvas, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  const white = rampColor("foam", 4);
  const pale = rampColor("foam", 2);
  const faint = hexToRgba("#a0c4b6", 190);
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + (noise3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 0.5, 7) - 0.5) * 0.35;
    const front = Math.sin(a) > -0.2;
    const x = Math.round(cx + Math.cos(a) * rx * wob);
    const y = Math.round(cy + Math.sin(a) * ry * wob);
    if (hash3(i, seed, 0, 8) > 0.12) {
      canvas.set(x, y, white);
      if (front && hash3(i, seed, 1, 8) > 0.35) canvas.set(x, y + 1, pale);
    }
    // A paler, broken ring just outside.
    const x2 = Math.round(cx + Math.cos(a) * (rx + 2.5) * wob);
    const y2 = Math.round(cy + Math.sin(a) * (ry + 1.5) * wob);
    if (hash3(i, seed, 2, 8) > 0.5) canvas.blend(x2, y2, faint);
  }
  // Two swooshes trailing off to either side.
  for (const side of [-1, 1]) {
    const len = 6 + Math.floor(hash3(side, seed, 3, 8) * 5);
    for (let k = 0; k < len; k++) {
      const x = Math.round(cx + side * (rx + 3 + k));
      const y = Math.round(cy + ry * 0.55 + Math.sin(k * 0.5) * 0.9);
      canvas.set(x, y, k < len - 3 ? pale : faint);
    }
  }
}

function seaRock(variant: number): Sprite {
  const size = [1, 0.85, 1.15, 0.7][variant]!;
  const rock = boulders(`sea_rock_${variant}`, 5000 + variant * 17, size, 0.5, {
    shadow: false,
    lobes: variant === 3 ? 1 : 2,
    // Painted over with 1× surf below, so it stays at the world's own pixel density.
    res: 1,
  });
  const out = new Canvas(rock.canvas.width + 30, rock.canvas.height + 14);
  const ax = rock.anchorX + 15;
  const ay = rock.anchorY;
  // The rock's footprint centre sits half a tile below its anchor (the tile's top vertex).
  surf(out, ax, ay + 8, 13 * size, 5.6 * size, variant + 1);
  out.draw(rock.canvas, 15, 0);
  return trimmed(rock.name, out, ax, ay);
}

/**
 * A natural rock arch standing in the shallows on two water tiles: variant 0 spans +x, variant 1
 * spans +y. Two mossy legs carry a lintel, with the sea running through the gap.
 */
function seaArch(variant: number): Sprite {
  const rand = prng(5400 + variant * 31);
  const s = new Scene();
  const mat = rocky("rock", 6, 0.5);
  // Along the span axis the legs stand on the two tile centres; across it, mid-tile.
  const at = (along: number, across: number): [number, number] =>
    variant === 0 ? [along, across] : [across, along];
  const leg = (along: number, h: number) => {
    const [x, y] = at(along, 0.5);
    rock(s, rand, [x, y, h / 2], [0.23, 0.29, h / 2 + 2], mat, 20);
  };
  // Seen from the diagonal the tunnel is foreshortened, so the legs stand well apart.
  leg(0.27, 36 + rand() * 4);
  leg(1.73, 32 + rand() * 4);
  // The lintel: a long, thin rock resting on both legs.
  const [lx, ly] = at(1.0, 0.5);
  s.withYaw(variant === 0 ? 0 : Math.PI / 2, [lx, ly], () => {
    rock(s, rand, [lx, ly, 31], [0.98, 0.21, 5.5], mat, 18);
  });
  rock(s, rand, [...at(0.62, 0.78), 3], [0.16, 0.14, 7], mat, 10);
  const w = variant === 0 ? 2 : 1;
  const d = variant === 0 ? 1 : 2;
  const rocks = renderSprite(`sea_arch_${variant}`, s, w, d, 48, 8, undefined, { res: 1 });
  const out = new Canvas(rocks.canvas.width + 44, rocks.canvas.height + 20);
  const ax = rocks.anchorX + 22;
  const ay = rocks.anchorY + 4;
  // Surf around each foot: tile (0, 0) is centred half a tile below the anchor, its neighbour
  // one tile-diagonal further along the span.
  const feet: [number, number][] =
    variant === 0
      ? [
          [0, 8],
          [16, 16],
        ]
      : [
          [0, 8],
          [-16, 16],
        ];
  feet.forEach(([dx, dy], i) => surf(out, ax + dx, ay + dy, 12, 5.2, 11 + variant * 2 + i));
  out.draw(rocks.canvas, 22, 4);
  return trimmed(rocks.name, out, ax, ay);
}

/** Land boulders for the shore: like sea rocks but with a shadow and no surf. */
function shoreRock(variant: number): Sprite {
  const size = [0.8, 0.62, 0.95, 0.5][variant]!;
  return boulders(`shore_rock_${variant}`, 5200 + variant * 23, size, 0.4, {
    shadow: true,
    lobes: variant === 3 ? 0 : 1 + (variant % 2),
  });
}

// --- Regrowth stages --------------------------------------------------------------------------

type RegrowStyle = "wood" | "charred" | "stalk" | "silver";

function stump(style: RegrowStyle): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const side =
    style === "charred"
      ? barkOf("charred")
      : style === "stalk"
        ? flat("stalk")
        : style === "silver"
          ? barkOf("silver", 0.2)
          : bark;
  const top = style === "charred" ? "lava" : style === "stalk" ? "stalk" : "wheat";
  s.prism(
    "z",
    [0.5, 0.5, 2],
    0.1,
    2,
    (c) => {
      if (c.n[2] > 0.9) {
        const d = Math.hypot(c.lp[0] - 0.5, c.lp[1] - 0.5);
        return rampColor(top, (d * 40) % 2 < 1 ? 2 : 3);
      }
      return side(c);
    },
    9,
  );
  if (style === "wood") s.ellipsoid([0.36, 0.62, 0.5], [0.06, 0.04, 1], bark);
  return renderSprite(`n_stump_${style}`, s, 1, 1, 12, 6);
}

function sapling(style: RegrowStyle): Sprite {
  const s = new Scene();
  if (style === "charred") {
    strand(s, [0.5, 0.5, 0], [0.55, 0.45, 9], 0.02, 1, barkOf("charred"), 4);
    s.ellipsoid([0.55, 0.45, 9], [0.03, 0.03, 1], () => rampColor("lava", 4));
  } else if (style === "stalk") {
    s.prism("z", [0.5, 0.5, 2.5], 0.025, 2.5, flat("stalk"), 6);
    s.ellipsoid([0.5, 0.5, 5], [0.1, 0.1, 2.5], flat("capRed", 0.1));
  } else {
    const leaf = style === "silver" ? "silver" : "leaf";
    s.prism("z", [0.5, 0.5, 3], 0.025, 3, bark, 5);
    s.ellipsoid([0.5, 0.5, 8], [0.14, 0.14, 4], foliage(leaf));
    s.ellipsoid([0.58, 0.44, 10], [0.09, 0.09, 3], foliage(leaf));
  }
  return renderSprite(`n_sapling_${style}`, s, 1, 1, 20, 6);
}

/** Boulder sprite, also used to draw the stone icon. */
export function boulder(variant: number): Sprite {
  return rockPile(
    `n_boulder_${variant}`,
    3000 + variant * 13,
    rocky("rock", 8, 0.35),
    variant === 0 ? 1 : 0.8,
  );
}

// --- Registry ---------------------------------------------------------------------------------

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function natureSprites(): Sprite[] {
  const V = NODE_VARIANTS;
  const out: Sprite[] = [
    ...range(V.oak).map(oak),
    ...range(V.pine).map(pine),
    fruitTree(false),
    fruitTree(true),
    bush("n_berry_0", 6000, "leaf", 0.28, dots("berry", 0.12, 29, 0.3)),
    bush("n_berry_bare", 6000, "leaf", 0.28),
    ...range(V.boulder).map(boulder),
    deposit("n_ore_0", 3999, veined(rocky("rock", 7, 0.2), "fruit", 77)),
    ...range(V.palm).map(palm),
    ...range(V.cactus).map((v) => cactus(v, false)),
    cactus(1, true),
    ...range(V.sandstone).map((v) =>
      rockPile(
        `n_sandstone_${v}`,
        3200 + v * 7,
        (c) => shade("sandstone", lit(c, (c.lp[2] / 3) % 1 < 0.3 ? -0.12 : 0.02), c.px, c.py, 0.2),
        v === 0 ? 1 : 0.85,
        11,
      ),
    ),
    deposit("n_gold_vein_0", 3300, veined(rocky("sandstone", 7, 0), "gold", 78, 0.28)),
    ...range(V.charred_tree).map(charredTree),
    emberFruit(false),
    emberFruit(true),
    ...range(V.obsidian).map((v) =>
      rockPile(
        `n_obsidian_${v}`,
        3400 + v * 11,
        glossy("obsidian", "arcane"),
        v === 0 ? 1 : 0.8,
        12,
      ),
    ),
    deposit("n_hellstone_0", 3500, veined(rocky("basalt", 7, 0), "lava", 79, 0.3)),
    ...range(V.snow_pine).map(snowPine),
    frostBerry(false),
    frostBerry(true),
    ...range(V.ice_rock).map((v) =>
      rockPile(`n_ice_rock_${v}`, 3600 + v * 5, glossy("ice", "snow"), v === 0 ? 1 : 0.8, 11),
    ),
    ...range(V.jungle_tree).map(jungleTree),
    banana(false),
    banana(true),
    ...range(V.willow).map(willow),
    shroomPatch("n_swamp_shroom_0", "timber", false, false, 6500),
    shroomPatch("n_swamp_shroom_bare", "timber", false, true, 6500),
    deposit("n_bog_ore_0", 3800, veined(rocky("swampGround", 7, 0.3), "pumpkin", 80, 0.22)),
    ...range(V.giant_mushroom).map(giantMushroom),
    shroomPatch("n_glowshroom_0", "glow", true, false, 6600),
    shroomPatch("n_glowshroom_bare", "glow", true, true, 6600),
    ...range(V.silver_tree).map(silverTree),
    ...range(V.crystal).map(crystalCluster),
    signatureDeposit("sunstone"),
    signatureDeposit("rimeglass"),
    signatureDeposit("mirepearl"),
    signatureDeposit("glowcap"),
    ...range(V.autumn_tree).map(autumn),
    pumpkinPatch(false),
    pumpkinPatch(true),
    ...range(V.blossom_tree).map(blossom),
    bush("n_flower_bush_0", 6700, "blossomGround", 0.26, dots("petal", 0.16, 33, 0.25), 0.05),
    bush("n_flower_bush_bare", 6700, "blossomGround", 0.26, undefined, 0.05),
    ...[0, 1, 2, 3].map(seaRock),
    seaArch(0),
    seaArch(1),
    ...[0, 1, 2, 3].map(shoreRock),
    ...(["wood", "charred", "stalk", "silver"] as RegrowStyle[]).flatMap((st) => [
      stump(st),
      sapling(st),
    ]),
  ];
  return out;
}

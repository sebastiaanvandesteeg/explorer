import { Canvas } from "../canvas";
import { rocky } from "../materials";
import { Z_SCALE } from "@explorer/shared";
import { hash3, noise3, prng } from "../noise3";
import { rampColor, shade, type RampName, type Rgba } from "../palette";
import { flat, lit, Scene, type Material, type Vec3 } from "../raytrace";
import { renderSprite, trimmed, type Sprite } from "../sprite";

/** Foliage: a bumpy normal gives clumps of light and shadow, like painted leaf clusters. */
function foliage(
  rampName: RampName,
  scale = 9,
  extras?: (c: Parameters<Material>[0], v: number) => Rgba | null,
  bumpiness = 1.3,
): Material {
  return (c) => {
    const [x, y, z] = [c.p[0] * scale, c.p[1] * scale, c.p[2] / (32 / scale)];
    const bump: Vec3 = [
      noise3(x, y, z, 1) - 0.5,
      noise3(x, y, z, 2) - 0.5,
      noise3(x, y, z, 3) - 0.5,
    ];
    const k = bumpiness;
    const n: Vec3 = [c.n[0] + bump[0] * k, c.n[1] + bump[1] * k, c.n[2] + bump[2] * k];
    const v = 0.16 + 0.9 * c.lightFor(n) + (noise3(x * 2, y * 2, z * 2, 4) - 0.5) * 0.16;
    const extra = extras?.(c, v);
    if (extra) return extra;
    return shade(rampName, v, c.px, c.py, 0.4);
  };
}

const bark: Material = (c) => {
  const streak = hash3(Math.floor((c.p[0] - c.p[1]) * 60), 0, 0, 3) < 0.3 ? -0.15 : 0;
  return shade("timber", lit(c, 0.1 + streak), c.px, c.py, 0.2);
};

function canopy(
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

export function oak(variant: number): Sprite {
  const rand = prng(1000 + variant * 77);
  const s = new Scene();
  s.groundShadow = { x0: -0.4, y0: -0.4, x1: 1.6, y1: 1.6 };
  const size = [1, 0.9, 1.12][variant % 3]!;
  s.prism("z", [0.5, 0.5, 7], 0.085, 7, bark, 7);
  s.prism("z", [0.5, 0.5, 1.5], 0.12, 1.5, bark, 7);
  canopy(
    s,
    rand,
    0.5,
    0.5,
    23 * size,
    0.56 * size,
    13 * size,
    11,
    foliage("leaf", 7, undefined, 1),
  );
  return renderSprite(`tree_oak_${variant}`, s, 1, 1, 60, 12);
}

export function fruitTree(): Sprite {
  const rand = prng(4242);
  const s = new Scene();
  s.groundShadow = { x0: -0.4, y0: -0.4, x1: 1.6, y1: 1.6 };
  s.prism("z", [0.5, 0.5, 6], 0.07, 6, bark, 7);
  const fruit = foliage("leaf", 7, (c, v) => {
    const k = hash3(c.px, c.py, 0, 17);
    if (v > 0.35 && k > 0.93) return rampColor("fruit", v > 0.7 ? 3 : 2);
    return null;
  });
  canopy(s, rand, 0.5, 0.5, 19, 0.44, 10, 9, fruit);
  return renderSprite("tree_fruit", s, 1, 1, 50, 12);
}

export function pine(variant: number): Sprite {
  const rand = prng(2000 + variant * 31);
  const s = new Scene();
  s.groundShadow = { x0: -0.4, y0: -0.4, x1: 1.6, y1: 1.6 };
  const tall = [1, 1.15, 0.88][variant % 3]!;
  s.prism("z", [0.5, 0.5, 5], 0.055, 5, bark, 6);
  const needles = foliage("pine", 12, undefined, 1.1);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
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
  return renderSprite(`tree_pine_${variant}`, s, 1, 1, 64, 12);
}

export function sapling(): Sprite {
  const s = new Scene();
  s.prism("z", [0.5, 0.5, 3], 0.025, 3, bark, 5);
  s.ellipsoid([0.5, 0.5, 8], [0.14, 0.14, 4], foliage("leaf"));
  s.ellipsoid([0.58, 0.44, 10], [0.09, 0.09, 3], foliage("leaf"));
  return renderSprite("tree_sapling", s, 1, 1, 20, 6);
}

export function stump(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: 0, y0: 0, x1: 1, y1: 1 };
  s.prism(
    "z",
    [0.5, 0.5, 2],
    0.1,
    2,
    (c) => {
      if (c.n[2] > 0.9) {
        const d = Math.hypot(c.lp[0] - 0.5, c.lp[1] - 0.5);
        return rampColor("wheat", (d * 40) % 2 < 1 ? 2 : 3);
      }
      return bark(c);
    },
    9,
  );
  s.ellipsoid([0.36, 0.62, 0.5], [0.06, 0.04, 1], bark);
  return renderSprite("tree_stump", s, 1, 1, 12, 6);
}

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

export function boulder(variant: number): Sprite {
  const rand = prng(3000 + variant * 13);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const mat = rocky("rock", 8, 0.35);
  const big = variant === 0 ? 1 : 0.8;
  rock(s, rand, [0.5, 0.5, 3], [0.34 * big, 0.3 * big, 9 * big], mat);
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
  return renderSprite(`rock_boulder_${variant}`, s, 1, 1, 30, 8);
}

export function oreRock(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.3, y0: -0.3, x1: 1.3, y1: 1.3 };
  const base = rocky("rock", 7, 0.2);
  const mat: Material = (c) => {
    const k = noise3(c.p[0] * 22, c.p[1] * 22, c.p[2] / 1.5, 77);
    if (k > 0.8) return rampColor("wheat", c.light > 0.3 ? 4 : 2);
    if (k < 0.12) return rampColor("fruit", 1);
    return base(c);
  };
  const rand = prng(3999);
  rock(s, rand, [0.5, 0.5, 4], [0.42, 0.36, 13], mat, 20);
  rock(s, rand, [0.18, 0.66, 1], [0.18, 0.16, 6], mat, 12);
  rock(s, rand, [0.74, 0.26, 1], [0.16, 0.14, 6], mat, 12);
  return renderSprite("rock_ore", s, 1, 1, 36, 8);
}

export function seaRock(variant: number): Sprite {
  const rand = prng(5000 + variant);
  const s = new Scene();
  const mat = rocky("rock", 6, 0.25);
  rock(s, rand, [0.5, 0.5, 2], [0.36, 0.3, 13], mat, 18);
  rock(s, rand, [0.28 + rand() * 0.1, 0.72, 0], [0.18, 0.15, 6], mat, 12);
  // Foam ring at the waterline.
  const sprite = renderSprite(`sea_rock_${variant}`, s, 1, 1, 30, 8);
  const c = sprite.canvas;
  const out = new Canvas(c.width + 8, c.height + 4);
  const foam = rampColor("foam", 3);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const fx = Math.round(sprite.anchorX + 4 + Math.cos(a) * 13);
    const fy = Math.round(sprite.anchorY + 8 + Math.sin(a) * 6);
    if (hash3(i, variant, 0, 3) > 0.2) out.set(fx, fy, foam);
  }
  out.draw(c, 4, 0);
  return trimmed(sprite.name, out, sprite.anchorX + 4, sprite.anchorY);
}

export function berryBush(ripe: boolean): Sprite {
  const rand = prng(6000);
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 1.2, y1: 1.2 };
  const mat = foliage("leaf", 11, (c, v) => {
    if (!ripe) return null;
    const k = hash3(c.px, c.py, 0, 29);
    if (v > 0.3 && k > 0.88) return rampColor("berry", v > 0.65 ? 3 : 2);
    return null;
  });
  canopy(s, rand, 0.5, 0.5, 6, 0.28, 6, 6, mat);
  return renderSprite(ripe ? "bush_berry" : "bush_bare", s, 1, 1, 22, 8);
}

export function sunflowers(): Sprite {
  const rand = prng(7000);
  const s = new Scene();
  const stem = flat("sprout");
  const head: Material = (c) => shade("sunflower", lit(c, 0.1), c.px, c.py);
  for (let i = 0; i < 7; i++) {
    const x = 0.18 + rand() * 0.64;
    const y = 0.18 + rand() * 0.64;
    const h = 14 + rand() * 7;
    s.prism("z", [x, y, h / 2], 0.025, h / 2, stem, 5);
    s.ellipsoid([x + 0.07, y, h * 0.5], [0.09, 0.04, 2], flat("sprout"));
    s.ellipsoid([x - 0.06, y, h * 0.35], [0.08, 0.04, 2], flat("sprout"));
    const centre: Vec3 = [x, y + 0.03, h + 2];
    s.prism(
      "y",
      centre,
      0.13,
      0.015,
      (c) => {
        const r = Math.hypot(c.lp[0] - centre[0], (c.lp[2] - centre[2]) / 19.6);
        if (r < 0.05) return rampColor("sunflower", 0);
        return head(c);
      },
      10,
    );
  }
  return renderSprite("deco_sunflowers", s, 1, 1, 30, 6);
}

export function flowers(variant: number): Sprite {
  const c = new Canvas(32, 16);
  const rand = prng(8000 + variant);
  const colours: Rgba[] = [
    rampColor("sunflower", 3),
    rampColor("plaster", 4),
    rampColor("cloth", 3),
    rampColor("berry", 3),
  ];
  for (let i = 0; i < 9; i++) {
    const x = 8 + Math.floor(rand() * 16);
    const y = 4 + Math.floor(rand() * 8);
    c.set(x, y + 1, rampColor("grass", 1));
    c.set(x, y, colours[(i + variant) % colours.length]!);
  }
  return trimmed(`deco_flowers_${variant}`, c, 16, 0);
}

export function grassTuft(variant: number): Sprite {
  const c = new Canvas(32, 16);
  const rand = prng(8500 + variant);
  for (let i = 0; i < 5; i++) {
    const x = 10 + Math.floor(rand() * 12);
    const y = 6 + Math.floor(rand() * 6);
    c.set(x, y, rampColor("grass", 5));
    c.set(x - 1, y + 1, rampColor("grass", 4));
    c.set(x + 1, y + 1, rampColor("grass", 4));
    c.set(x, y + 1, rampColor("grass", 3));
  }
  return trimmed(`deco_grass_${variant}`, c, 16, 0);
}

export function natureSprites(): Sprite[] {
  return [
    oak(0),
    oak(1),
    oak(2),
    pine(0),
    pine(1),
    pine(2),
    fruitTree(),
    sapling(),
    stump(),
    boulder(0),
    boulder(1),
    oreRock(),
    seaRock(0),
    seaRock(1),
    berryBush(true),
    berryBush(false),
    sunflowers(),
    flowers(0),
    flowers(1),
    grassTuft(0),
    grassTuft(1),
  ];
}

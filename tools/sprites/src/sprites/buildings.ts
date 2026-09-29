import { rampColor, shade } from "../palette";
import { hash3 } from "../noise3";
import { bricks, planks, rocky, shingles, straw, timberFrame } from "../materials";
import { flat, lit, project, Scene, type Material } from "../raytrace";
import { renderSprite, type Sprite } from "../sprite";

const smokeAt = (x: number, y: number, z: number) => project(x, y, z);

export function house(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 19;
  const walls = timberFrame({
    top,
    posts: [0.3, 0.75, 1.25, 1.7, 0.35, 0.8, 1.2, 1.65],
    braces: true,
    openings: [
      { face: "+y", u0: 0.88, u1: 1.12, z0: 3, z1: 14, kind: "door" },
      { face: "+y", u0: 0.44, u1: 0.62, z0: 8, z1: 13, kind: "lit-window" },
      { face: "+y", u0: 1.34, u1: 1.52, z0: 8, z1: 13, kind: "window" },
      { face: "+x", u0: 0.62, u1: 0.8, z0: 8, z1: 13, kind: "window" },
      { face: "+x", u0: 1.12, u1: 1.3, z0: 8, z1: 13, kind: "lit-window" },
    ],
  });
  s.box([0.3, 0.35, 0], [1.7, 1.65, top], walls);
  s.gable(0.3, 0.35, 1.7, 1.65, top, 36, "x", timberFrame({ top: 36, posts: [0.7, 1.3] }));
  s.gable(0.16, 0.2, 1.84, 1.8, top - 1, 40, "x", straw());
  s.box([1.22, 0.62, 24], [1.44, 0.84, 50], bricks("stone", 3, 0.11));
  s.box([1.19, 0.59, 50], [1.47, 0.87, 52], flat("stone", -0.1));
  s.box([0.84, 1.65, 0], [1.16, 1.84, 2], flat("stone"));
  return renderSprite("house", s, 2, 2, 60, 10, { smoke: [smokeAt(1.33, 0.73, 53)] });
}

export function townHall(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 3.3, y1: 3.3 };
  const top = 26;
  s.box([0.25, 0.3, 0], [2.75, 2.7, 4], bricks("stone", 2, 0.2));
  const walls = timberFrame({
    top,
    posts: [0.35, 0.8, 1.25, 1.75, 2.2, 2.65, 0.4, 0.9, 1.5, 2.1, 2.6],
    braces: true,
    plinthPx: 5,
    openings: [
      { face: "+y", u0: 1.3, u1: 1.7, z0: 5, z1: 19, kind: "door" },
      { face: "+y", u0: 0.55, u1: 0.8, z0: 12, z1: 19, kind: "lit-window" },
      { face: "+y", u0: 2.2, u1: 2.45, z0: 12, z1: 19, kind: "lit-window" },
      { face: "+x", u0: 0.6, u1: 0.85, z0: 12, z1: 19, kind: "window" },
      { face: "+x", u0: 1.35, u1: 1.6, z0: 12, z1: 19, kind: "lit-window" },
      { face: "+x", u0: 2.1, u1: 2.35, z0: 12, z1: 19, kind: "window" },
    ],
  });
  s.box([0.35, 0.4, 0], [2.65, 2.6, top], walls);
  s.gable(0.35, 0.4, 2.65, 2.6, top, 48, "x", timberFrame({ top: 48, posts: [1.1, 1.9] }));
  s.gable(0.2, 0.22, 2.8, 2.78, top - 1, 54, "x", shingles("slate"));
  // Bell tower over the ridge.
  s.box([1.28, 1.28, 44], [1.72, 1.72, 62], planks("plank", "z", 0.09));
  s.box([1.36, 1.72, 50], [1.64, 1.73, 58], flat("timber", -0.3));
  s.pyramid(1.5, 1.5, 0.3, 0.3, 61, 76, shingles("slate", 2.5, 0.12));
  s.prism("z", [1.5, 1.5, 82], 0.025, 7, flat("timber"), 6);
  s.box([1.525, 1.48, 83], [1.85, 1.52, 88], flat("cloth", 0.1));
  // Chimney.
  s.box([2.2, 0.75, 30], [2.44, 0.99, 58], bricks("stone", 3, 0.12));
  // Porch steps and posts.
  s.box([1.2, 2.6, 0], [1.8, 2.85, 3], flat("stone"));
  s.prism("z", [1.18, 2.62, 12], 0.03, 12, flat("timber"), 6);
  s.prism("z", [1.82, 2.62, 12], 0.03, 12, flat("timber"), 6);
  return renderSprite("town_hall", s, 3, 3, 96, 10, { smoke: [smokeAt(2.32, 0.87, 60)] });
}

export function storehouse(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  const top = 18;
  s.box([0.25, 0.3, 0], [1.75, 1.7, 3], flat("stone"));
  s.box([0.3, 0.35, 3], [1.7, 1.65, top], planks("plank", "z", 0.085));
  s.box([0.7, 1.64, 3], [1.3, 1.66, 15], flat("timber", -0.35));
  s.gable(0.3, 0.35, 1.7, 1.65, top, 32, "y", planks("plank", "z", 0.085));
  s.gable(0.2, 0.22, 1.8, 1.78, top - 1, 35, "y", shingles("slate"));
  // Crates and barrels by the door.
  s.box([0.28, 1.72, 0], [0.5, 1.94, 7], planks("plank", "x", 0.07));
  s.box([0.3, 1.74, 7], [0.48, 1.92, 12], planks("plank", "y", 0.07));
  s.prism("z", [1.55, 1.85, 4], 0.1, 4, planks("plank", "z", 0.05), 10);
  s.prism("z", [1.82, 1.55, 4], 0.1, 4, planks("plank", "z", 0.05), 10);
  return renderSprite("storehouse", s, 2, 2, 48, 10);
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
      const c: [number, number, number] = along === "x" ? [x, y + off, z] : [x + off, y, z];
      s.prism(along, c, r, len / 2, logMaterial(along, c, r), 10);
    }
  }
}

function logMaterial(axis: "x" | "y", centre: [number, number, number], r: number): Material {
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

export function lumberCamp(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  // Open-sided shed: four posts and a slate roof, like the sawmill in the concept art.
  for (const [x, y] of [
    [0.35, 0.35],
    [1.2, 0.35],
    [0.35, 1.2],
    [1.2, 1.2],
  ] as const) {
    s.prism("z", [x, y, 9], 0.04, 9, flat("timber"), 6);
  }
  s.box([0.3, 0.3, 17], [1.25, 1.25, 19], flat("timber"));
  s.gable(0.2, 0.2, 1.35, 1.35, 18, 30, "y", shingles("slate"));
  s.box([0.45, 0.5, 0], [1.1, 0.75, 6], planks("plank", "x"));
  s.box([0.6, 0.55, 6], [0.95, 0.7, 7], flat("stone", 0.2));
  logPile(s, 1.62, 0.7, "y", 6);
  logPile(s, 0.75, 1.65, "x", 5);
  // Chopping block with an axe.
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
  return renderSprite("lumber_camp", s, 2, 2, 44, 10);
}

export function quarry(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 2.3, y1: 2.3 };
  // Sandy yard with pebbles.
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
    s.box([x, y, z], [x + sz, y + sz, z + sz * 19.6], (c) =>
      shade("stone", lit(c, -0.18), c.px, c.py, 0.2),
    );
  block(0.25, 1.25, 0.8);
  block(0.62, 1.3, 0.8);
  block(0.35, 1.3, 7.5, 0.3);
  block(1.3, 1.4, 0.8, 0.36);
  block(1.42, 0.95, 0.8, 0.28);
  block(1.05, 1.5, 0.8, 0.26);
  // Wooden crane (A-frame + boom) like the concept art's forge island.
  s.prism("z", [0.4, 0.4, 20], 0.045, 20, flat("timber"), 6);
  s.prism("z", [1.0, 0.4, 20], 0.045, 20, flat("timber"), 6);
  s.box([0.33, 0.35, 38], [1.07, 0.47, 41], flat("timber"));
  s.box([0.64, 0.37, 38], [0.76, 1.3, 41], flat("timber"));
  s.box([0.69, 1.2, 22], [0.71, 1.22, 38], flat("rock", -0.3), { castsShadow: false });
  s.box([0.55, 1.06, 14], [0.85, 1.36, 22], bricks("stone", 40, 3));
  // Rubble.
  s.ellipsoid([1.25, 0.5, 2.5], [0.2, 0.16, 5], rocky("rock", 9));
  s.ellipsoid([1.5, 0.68, 2], [0.14, 0.12, 4], rocky("rock", 9));
  s.ellipsoid([1.62, 0.42, 1.5], [0.1, 0.09, 3], rocky("rock", 9));
  return renderSprite("quarry", s, 2, 2, 54, 10);
}

/** Farm field with a small shed. `stage` 0 = ploughed, 1 = sprouts, 2 = ripe wheat. */
export function farm(stage: 0 | 1 | 2): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.2, y0: -0.2, x1: 3.3, y1: 3.3 };
  // Soil bed.
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
        if (x < 0.95 && y < 0.95) continue; // shed corner
        const h = stage === 1 ? 3 : 9;
        s.ellipsoid(
          [x, y, 1.5 + h / 2],
          [0.09, 0.09, h / 2],
          stage === 1 ? flat("sprout") : flat("wheat", 0.08),
          {
            castsShadow: stage === 2,
          },
        );
      }
    }
  }
  // Shed in the back corner.
  s.box([0.15, 0.15, 0], [0.85, 0.85, 13], planks("plank", "z", 0.08));
  s.gable(0.08, 0.1, 0.92, 0.9, 12, 22, "x", straw());
  // Fence along the front edges.
  for (let k = 0; k <= 6; k++) {
    s.prism("z", [2.9, 0.12 + k * 0.46, 4], 0.025, 4, flat("timber"), 6);
    s.prism("z", [0.12 + k * 0.46, 2.9, 4], 0.025, 4, flat("timber"), 6);
  }
  s.box([2.88, 0.12, 5], [2.92, 2.9, 6], flat("timber"));
  s.box([0.12, 2.88, 5], [2.9, 2.92, 6], flat("timber"));
  return renderSprite(`farm_${stage}`, s, 3, 3, 40, 10);
}

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

export function scaffold(size: 1 | 2 | 3): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: size + 0.2, y1: size + 0.2 };
  const h = 12 + size * 5;
  const lo = 0.2;
  const hi = size - 0.2;
  for (const [x, y] of [
    [lo, lo],
    [hi, lo],
    [lo, hi],
    [hi, hi],
  ] as const) {
    s.prism("z", [x, y, h / 2], 0.035, h / 2, flat("timber"), 6);
  }
  for (const z of [h * 0.45, h - 1]) {
    s.box([lo, hi - 0.03, z - 0.8], [hi, hi + 0.03, z + 0.8], flat("timber", 0.05));
    s.box([hi - 0.03, lo, z - 0.8], [hi + 0.03, hi, z + 0.8], flat("timber", 0.05));
    s.box([lo, lo - 0.03, z - 0.8], [hi, lo + 0.03, z + 0.8], flat("timber", 0.05));
    s.box([lo - 0.03, lo, z - 0.8], [lo + 0.03, hi, z + 0.8], flat("timber", 0.05));
  }
  s.box([lo, lo, 0], [hi, hi, 1.5], planks("plank", "x", 0.12));
  s.box([lo + 0.1, lo + 0.1, 1.5], [lo + 0.45, lo + 0.3, 4], planks("plank", "y", 0.06));
  return renderSprite(`scaffold_${size}`, s, size, size, h + 12, 8);
}

export function crate(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 };
  s.box([0.3, 0.3, 0], [0.62, 0.62, 9], planks("plank", "x", 0.08));
  s.box([0.64, 0.4, 0], [0.86, 0.62, 6], planks("plank", "y", 0.07));
  return renderSprite("prop_crates", s, 1, 1, 20, 6);
}

export function barrel(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 };
  const mat = planks("plank", "z", 0.045);
  s.prism("z", [0.45, 0.45, 5], 0.13, 5, mat, 12);
  s.prism("z", [0.72, 0.55, 4], 0.11, 4, mat, 12);
  return renderSprite("prop_barrels", s, 1, 1, 18, 6);
}

export function logs(): Sprite {
  const s = new Scene();
  s.groundShadow = { x0: -0.1, y0: -0.1, x1: 1.2, y1: 1.2 };
  logPile(s, 0.5, 0.5, "x", 6, 0.7);
  return renderSprite("prop_logs", s, 1, 1, 20, 6);
}

export function buildingSprites(): Sprite[] {
  return [
    townHall(),
    house(),
    storehouse(),
    lumberCamp(),
    quarry(),
    farm(0),
    farm(1),
    farm(2),
    dockTile("x", false),
    dockTile("x", true),
    dockTile("y", false),
    dockTile("y", true),
    scaffold(1),
    scaffold(2),
    scaffold(3),
    crate(),
    barrel(),
    logs(),
  ];
}

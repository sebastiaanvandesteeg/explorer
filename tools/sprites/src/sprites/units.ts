// Villagers (hand-drawn pixel figures), ships (ray-cast in 8 headings), smoke and UI icons.
import { Canvas, outline } from "../canvas";
import { cloth, planks } from "../materials";
import { bayer, hexToRgba, rampColor, shade, type Rgba } from "../palette";
import { flat, lit, Scene, type Material } from "../raytrace";
import { renderSprite, trimmed, type Sprite } from "../sprite";
import { boulder } from "./nature";

export const TUNICS = ["blue", "green", "red"] as const;
export type Tunic = (typeof TUNICS)[number];
export const VILLAGER_POSES = ["stand", "walk0", "walk1", "work0", "work1"] as const;
export type VillagerPose = (typeof VILLAGER_POSES)[number];
export const TOOLS = ["axe", "pick", "hammer", "hoe"] as const;
export type Tool = (typeof TOOLS)[number];

const TUNIC_COLOURS: Record<Tunic, [string, string, string]> = {
  blue: ["#2a3446", "#3e4d6a", "#5a6f94"],
  green: ["#2f4a26", "#4a6b30", "#6f8f42"],
  red: ["#5a2a1c", "#8a3d22", "#b85a34"],
};

/**
 * Draw a 12×20 villager. Feet rest on (6, 19). "front" faces the viewer's lower right (+x);
 * the renderer mirrors it for +y, and uses "back" (mirrored or not) for the other two headings.
 */
function villager(facing: "front" | "back", pose: VillagerPose, tunic: Tunic, tool?: Tool): Canvas {
  const c = new Canvas(16, 24);
  const ox = 2; // extra room on the left for raised tools
  const oy = 4; // and on top
  const P = (x: number, y: number, col: Rgba) => c.set(x + ox, y + oy, col);
  const R = (x: number, y: number, w: number, h: number, col: Rgba) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, col);
  };
  const [tDark, tMid, tLight] = TUNIC_COLOURS[tunic].map((h) => hexToRgba(h));
  const skin = rampColor("skin", 2);
  const skinShade = rampColor("skin", 1);
  const hair = rampColor("hair", 1);
  const hairLight = rampColor("hair", 2);
  const trousers = rampColor("timber", 2);
  const boots = rampColor("timber", 0);
  const belt = rampColor("apron", 0);

  // Legs.
  const stride = pose === "walk0" ? 1 : pose === "walk1" ? -1 : 0;
  R(4, 13, 2, 3, trousers);
  R(6, 13, 2, 3, trousers);
  R(4 - stride, 16, 2, 1, trousers);
  R(6 + stride, 16, 2, 1, trousers);
  R(4 - stride, 17, 2, 1, boots);
  R(6 + stride, 17, 2, 1, boots);

  // Torso.
  R(3, 7, 6, 6, tMid!);
  R(3, 7, 2, 6, tLight!);
  R(8, 7, 1, 6, tDark!);
  R(3, 12, 6, 1, belt);

  // Arms.
  const armSwing = pose === "walk0" ? 1 : pose === "walk1" ? -1 : 0;
  R(2, 8, 1, 3 + armSwing, tLight!);
  P(2, 11 + armSwing, skin);
  if (pose === "work0") {
    // Tool arm raised above the head.
    R(9, 4, 1, 4, tDark!);
    P(9, 3, skin);
  } else if (pose === "work1") {
    // Tool arm swung down and forward.
    R(9, 8, 2, 2, tDark!);
    P(11, 10, skin);
  } else {
    R(9, 8, 1, 3 - armSwing, tDark!);
    P(9, 11 - armSwing, skinShade);
  }

  // Head.
  if (facing === "front") {
    R(4, 2, 4, 5, skin);
    R(7, 3, 1, 4, skinShade);
    R(4, 1, 4, 2, hair);
    P(4, 3, hair);
    P(5, 1, hairLight);
    P(5, 4, rampColor("outline", 0));
    P(7, 4, rampColor("outline", 0));
    P(6, 7, skinShade);
  } else {
    R(4, 1, 4, 6, hair);
    R(4, 1, 2, 2, hairLight);
    P(7, 6, skinShade);
  }

  // Tools.
  if (tool && (pose === "work0" || pose === "work1")) {
    const handle = rampColor("timber", 3);
    const metal = rampColor("stone", 4);
    const metalDark = rampColor("stone", 2);
    if (pose === "work0") {
      // Handle rises from the hand at (9, 3).
      P(9, 2, handle);
      P(10, 1, handle);
      P(10, 0, handle);
      if (tool === "axe") (R(11, -1, 2, 3, metal), P(12, 2, metalDark));
      if (tool === "pick") (R(8, -1, 6, 1, metal), P(8, 0, metalDark), P(13, 0, metalDark));
      if (tool === "hammer") (R(10, -2, 3, 2, metalDark), R(10, -2, 2, 1, metal));
      if (tool === "hoe") (R(10, -1, 3, 1, metal), P(12, 0, metalDark));
    } else {
      P(12, 11, handle);
      P(13, 12, handle);
      if (tool === "axe") (R(13, 12, 2, 3, metal), P(14, 14, metalDark));
      if (tool === "pick") (R(12, 13, 1, 3, metal), R(14, 11, 1, 3, metal));
      if (tool === "hammer") (R(13, 13, 2, 2, metalDark), P(13, 13, metal));
      if (tool === "hoe") R(14, 13, 1, 3, metal);
    }
  }
  outline(c, 0.3);
  return c;
}

function villagerSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const tunic of TUNICS) {
    for (const facing of ["front", "back"] as const) {
      for (const pose of VILLAGER_POSES) {
        const tools: (Tool | undefined)[] = pose.startsWith("work") ? [...TOOLS] : [undefined];
        for (const tool of tools) {
          const name = `villager_${tunic}_${facing}_${pose}${tool ? `_${tool}` : ""}`;
          out.push({ name, canvas: villager(facing, pose, tunic, tool), anchorX: 8, anchorY: 22 });
        }
      }
    }
  }
  return out;
}

/** Items carried above the head while hauling. Anchor = top of the villager's head. */
function carried(kind: "wood" | "stone" | "food"): Sprite {
  const c = new Canvas(12, 8);
  if (kind === "wood") {
    for (let i = 0; i < 3; i++) {
      c.fill(1, 2 + i * 2, 10, 2, rampColor("timber", 2 + (i % 2)));
      c.set(10, 2 + i * 2, rampColor("wheat", 3));
      c.set(10, 3 + i * 2, rampColor("wheat", 2));
    }
  } else if (kind === "stone") {
    c.fill(3, 2, 6, 5, rampColor("stone", 2));
    c.fill(3, 2, 4, 3, rampColor("stone", 3));
    c.fill(4, 2, 2, 1, rampColor("stone", 4));
  } else {
    c.fill(2, 4, 8, 4, rampColor("plank", 3));
    c.fill(2, 4, 8, 1, rampColor("plank", 4));
    c.fill(3, 1, 2, 3, rampColor("wheat", 4));
    c.fill(5, 0, 2, 4, rampColor("wheat", 3));
    c.fill(7, 1, 2, 3, rampColor("berry", 2));
  }
  outline(c, 0.35);
  return { name: `carry_${kind}`, canvas: c, anchorX: 6, anchorY: 8 };
}

/** Wooden crate with darker banding along its edges. */
function crateMaterial(min: [number, number, number], max: [number, number, number]): Material {
  return (c) => {
    const [x, y, z] = c.lp;
    const ex = Math.min(x - min[0], max[0] - x) < 0.03;
    const ey = Math.min(y - min[1], max[1] - y) < 0.03;
    const ez = Math.min(z - min[2], max[2] - z) < 0.9;
    const f = c.ln;
    const edge = Math.abs(f[2]) > 0.7 ? ex || ey : Math.abs(f[0]) > 0.7 ? ey || ez : ex || ez;
    return shade(edge ? "timber" : "thatch", lit(c, edge ? 0 : 0.05), c.px, c.py, 0.2);
  };
}

/** Planes for a hull pointed at both ends, lying along x from x0 to x1 around y = cy. */
function pointedHull(x0: number, x1: number, cy: number, hw: number, topPx: number) {
  const mid = (x0 + x1) / 2;
  const planes: { n: [number, number, number]; d: number }[] = [
    { n: [0, 0, -1], d: 0 },
    { n: [0, 0, 1], d: topPx / 19.6 },
  ];
  for (const [tip, dir] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (const side of [-1, 1]) {
      // Through the tip (tip, cy) and the widest point (mid, cy + side*hw).
      const dx = mid - tip;
      const dy = side * hw;
      let n: [number, number, number] = [dy, -dx, 0];
      if (n[0] * dir < 0) n = [-n[0], -n[1], 0];
      planes.push({ n, d: n[0] * tip + n[1] * cy });
    }
  }
  planes.push({ n: [0, 1, -0.3], d: cy + hw }, { n: [0, -1, -0.3], d: -cy + hw });
  return planes;
}

/** Hull, deck cargo, mast and a square sail, heading along +x in the local frame. */
function shipScene(heading: number): Scene {
  const s = new Scene();
  // Modelled around the world origin so the sprite anchor is the ship's centre.
  s.withYaw((heading * Math.PI) / 4, [0, 0], () => {
    const cx = 0;
    const cy = 0;
    const L = 0.95; // half length
    const W = 0.3; // half width
    const hullTop = 8;
    const m = (z: number) => z / 19.6;
    const hull: Material = (c) => {
      const z = c.lp[2];
      if (c.ln[2] > 0.8) return planks("plank", "x", 0.07)(c);
      if (z < 3.5) return shade("hull", lit(c, 0.15), c.px, c.py, 0.2);
      if (z > hullTop - 1.2) return shade("plank", lit(c, 0.15), c.px, c.py, 0.2);
      const k = (z / 2) % 1 < 0.3 ? -0.16 : 0;
      return shade("timber", lit(c, 0.12 + k), c.px, c.py, 0.2);
    };
    // Convex hull with a pointed bow (+x) and a flat stern, sides flaring slightly outwards.
    s.convex(
      [
        { n: [0, 0, -1], d: 0 },
        { n: [0, 0, 1], d: m(hullTop) },
        { n: [-1, 0, 0], d: -(cx - L * 0.9) },
        { n: [0, 1, -0.25], d: cy + W },
        { n: [0, -1, -0.25], d: -cy + W },
        { n: [0.6, 1, 0], d: 0.6 * (cx + L) + cy },
        { n: [0.6, -1, 0], d: 0.6 * (cx + L) - cy },
      ],
      hull,
    );
    // Raised stern castle.
    s.box(
      [cx - L * 0.9, cy - W * 0.95, hullTop - 1],
      [cx - L * 0.5, cy + W * 0.95, hullTop + 5],
      hull,
    );
    s.box(
      [cx - L * 0.92, cy - W, hullTop + 5],
      [cx - L * 0.48, cy + W, hullTop + 6],
      flat("plank", 0.1),
    );
    // Cargo crates.
    const crate = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) =>
      s.box(
        [cx + x0, cy + y0, z0],
        [cx + x1, cy + y1, z1],
        crateMaterial([cx + x0, cy + y0, z0], [cx + x1, cy + y1, z1]),
      );
    crate(-0.34, -0.2, -0.12, 0.02, hullTop, hullTop + 5);
    crate(-0.34, 0.04, -0.14, 0.22, hullTop, hullTop + 4.5);
    crate(0.22, -0.16, 0.42, 0.06, hullTop, hullTop + 4.5);
    crate(-0.32, -0.17, -0.15, 0, hullTop + 5, hullTop + 9);
    // Mast, yard and sail.
    s.prism("z", [cx + 0.05, cy, hullTop + 22], 0.035, 22, flat("timber"), 6);
    s.prism("y", [cx + 0.08, cy, hullTop + 38], 0.02, 0.36, flat("timber"), 6);
    s.box(
      [cx + 0.1, cy - 0.34, hullTop + 12],
      [cx + 0.13, cy + 0.34, hullTop + 37],
      cloth("sail"),
      {
        castsShadow: true,
      },
    );
    // Pennant.
    s.box(
      [cx - 0.2, cy - 0.01, hullTop + 44],
      [cx + 0.05, cy + 0.01, hullTop + 47],
      flat("cloth", 0.15),
    );
  });
  return s;
}

function ship(heading: number): Sprite {
  const s = shipScene(heading);
  return renderSprite(`ship_${heading}`, s, 1, 1, 70, 40);
}

function rowboat(dir: "x" | "y"): Sprite {
  const s = new Scene();
  s.withYaw(dir === "x" ? 0 : Math.PI / 2, [0.5, 0.5], () => {
    const hull: Material = (c) =>
      c.ln[2] > 0.8 ? rampColor("timber", 1) : shade("plank", lit(c, 0.05), c.px, c.py, 0.2);
    s.convex(pointedHull(0.12, 0.88, 0.5, 0.17, 4), hull);
    s.box([0.45, 0.36, 2.5], [0.52, 0.64, 3.5], flat("plank", 0.1));
  });
  return renderSprite(`boat_${dir}`, s, 1, 1, 14, 8);
}

function smoke(frame: number): Sprite {
  const r = 2 + frame * 1.2;
  const size = Math.ceil(r * 2) + 4;
  const c = new Canvas(size, size);
  const mid = size / 2;
  const alpha = 220 - frame * 40;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - mid, (y + 0.5 - mid) * 1.1) / r;
      if (d > 1) continue;
      if (d > 0.75 && bayer(x, y) > 0.5) continue;
      const light = x + y < size - 1 ? 3 : 2;
      const [cr, cg, cb] = rampColor("smoke", d > 0.6 ? light - 1 : light);
      c.set(x, y, [cr, cg, cb, alpha]);
    }
  }
  return { name: `smoke_${frame}`, canvas: c, anchorX: Math.floor(mid), anchorY: Math.floor(mid) };
}

/** Pixel icons for the HUD, drawn at 12×12. */
function icon(name: string, draw: (c: Canvas) => void): Sprite {
  const c = new Canvas(14, 14);
  draw(c);
  outline(c, 0.3);
  return { name: `icon_${name}`, canvas: c, anchorX: 7, anchorY: 7 };
}

function icons(): Sprite[] {
  const rock = boulder(1).canvas;
  return [
    icon("wood", (c) => {
      for (let i = 0; i < 3; i++) {
        const y = 3 + i * 3;
        const x = i === 1 ? 1 : 3;
        c.fill(x, y, 9, 3, rampColor("timber", 2 + (i % 2)));
        c.fill(x, y, 9, 1, rampColor("timber", 4));
        c.fill(x + 8, y, 2, 3, rampColor("wheat", 3));
        c.set(x + 9, y + 1, rampColor("wheat", 1));
      }
    }),
    icon("stone", (c) => {
      const scale = Math.max(rock.width, rock.height) / 12;
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 12; x++) {
          const col = rock.get(Math.floor(x * scale), Math.floor(y * scale));
          if (col[3] > 200) c.set(x + 1, y + 1, col);
        }
    }),
    icon("food", (c) => {
      c.fill(2, 7, 10, 5, rampColor("plank", 3));
      c.fill(2, 7, 10, 1, rampColor("plank", 5));
      c.fill(3, 3, 3, 4, rampColor("wheat", 4));
      c.fill(6, 2, 3, 5, rampColor("wheat", 3));
      c.fill(8, 4, 3, 3, rampColor("fruit", 2));
      c.set(9, 4, rampColor("fruit", 3));
    }),
    icon("villager", (c) => {
      c.fill(4, 2, 6, 5, rampColor("skin", 2));
      c.fill(4, 1, 6, 2, rampColor("hair", 1));
      c.set(5, 4, rampColor("outline", 0));
      c.set(8, 4, rampColor("outline", 0));
      c.fill(3, 7, 8, 6, hexToRgba("#3e4d6a"));
      c.fill(3, 7, 3, 6, hexToRgba("#5a6f94"));
    }),
    icon("axe", (c) => {
      for (let i = 0; i < 9; i++) c.set(3 + i, 12 - i, rampColor("timber", 3));
      c.fill(8, 1, 4, 5, rampColor("stone", 4));
      c.fill(10, 1, 2, 5, rampColor("stone", 2));
    }),
    icon("pick", (c) => {
      for (let i = 0; i < 9; i++) c.set(3 + i, 12 - i, rampColor("timber", 3));
      for (let i = 0; i < 7; i++) c.set(5 + i, 1 + Math.abs(i - 3) - 1, rampColor("stone", 4));
    }),
    icon("hammer", (c) => {
      for (let i = 0; i < 8; i++) c.set(3 + i, 12 - i, rampColor("timber", 3));
      c.fill(7, 1, 6, 4, rampColor("stone", 2));
      c.fill(7, 1, 6, 1, rampColor("stone", 4));
    }),
    icon("basket", (c) => {
      c.fill(2, 6, 10, 6, rampColor("plank", 3));
      for (let x = 2; x < 12; x += 2) c.fill(x, 6, 1, 6, rampColor("plank", 2));
      c.fill(3, 3, 3, 3, rampColor("berry", 3));
      c.fill(7, 2, 3, 4, rampColor("fruit", 2));
    }),
    icon("ship", (c) => {
      c.fill(1, 9, 12, 3, hexToRgba("#34405e"));
      c.fill(2, 8, 10, 1, rampColor("plank", 3));
      c.fill(6, 1, 1, 8, rampColor("timber", 2));
      c.fill(3, 2, 7, 5, rampColor("sail", 3));
      c.fill(3, 2, 2, 5, rampColor("sail", 4));
    }),
    icon("flag", (c) => {
      c.fill(3, 1, 1, 12, rampColor("timber", 2));
      c.fill(4, 1, 7, 5, rampColor("cloth", 3));
      c.fill(4, 1, 7, 1, rampColor("cloth", 4));
    }),
  ];
}

/** Floating marker drawn above resources marked for harvest. */
function markers(): Sprite[] {
  const handle = rampColor("timber", 1);
  const metal = rampColor("rock", 2);
  const metalLight = rampColor("rock", 4);
  const glyphs: Record<string, (c: Canvas) => void> = {
    axe: (c) => {
      for (let i = 0; i < 8; i++) c.fill(5 + i, 12 - i, 2, 1, handle);
      c.fill(9, 3, 4, 5, metal);
      c.fill(9, 3, 2, 5, metalLight);
    },
    pick: (c) => {
      for (let i = 0; i < 8; i++) c.fill(6 + Math.round(i * 0.75), 13 - i, 2, 1, handle);
      for (let i = 0; i < 9; i++)
        c.fill(5 + i, 3 + Math.round(Math.abs(i - 4) * 0.6), 1, 2, i < 5 ? metalLight : metal);
    },
    basket: (c) => {
      c.fill(4, 8, 10, 5, rampColor("plank", 2));
      for (let x = 4; x < 14; x += 2) c.fill(x, 8, 1, 5, rampColor("plank", 1));
      c.fill(5, 5, 3, 3, rampColor("berry", 2));
      c.fill(9, 4, 3, 4, rampColor("fruit", 2));
    },
  };
  return Object.entries(glyphs).map(([kind, draw]) => {
    const c = new Canvas(18, 20);
    const bubble = rampColor("ui", 4);
    const rim = rampColor("ui", 2);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 18; x++) {
        const d = Math.hypot(x - 8.5, y - 8);
        if (d < 8) c.set(x, y, d > 6.9 ? rim : bubble);
      }
    for (let i = 0; i < 3; i++) c.fill(7 + i, 15 + i, 3 - i, 1, rim);
    draw(c);
    outline(c, 0.4);
    return { name: `mark_${kind}`, canvas: c, anchorX: 9, anchorY: 19 };
  });
}

/** Sparkle frames for water glints near the camera. */
function sparkle(frame: number): Sprite {
  const c = new Canvas(5, 5);
  const col = rampColor("foam", 4);
  const dim = hexToRgba("#cfe3d6", 160);
  if (frame === 0) c.set(2, 2, col);
  if (frame === 1) {
    c.set(2, 2, col);
    c.set(1, 2, dim);
    c.set(3, 2, dim);
  }
  if (frame === 2) {
    c.set(2, 2, col);
    c.set(0, 2, dim);
    c.set(4, 2, dim);
    c.set(2, 1, dim);
  }
  return { name: `sparkle_${frame}`, canvas: c, anchorX: 2, anchorY: 2 };
}

export function unitSprites(): Sprite[] {
  return [
    ...villagerSprites(),
    carried("wood"),
    carried("stone"),
    carried("food"),
    ...Array.from({ length: 8 }, (_, h) => ship(h)),
    rowboat("x"),
    rowboat("y"),
    ...[0, 1, 2, 3].map(smoke),
    ...[0, 1, 2].map(sparkle),
    ...icons(),
    ...markers(),
  ].map((s) => (s.canvas.bounds() ? trimmedKeep(s) : s));
}

function trimmedKeep(s: Sprite): Sprite {
  return trimmed(s.name, s.canvas, s.anchorX, s.anchorY, s.meta);
}

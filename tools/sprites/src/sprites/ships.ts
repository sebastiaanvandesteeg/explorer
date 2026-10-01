// Medieval ships: a scout caravel, a cargo cog, a patrol carrack and the pirates' black galleon.
// They are big next to a person (a scout is about three tiles long) and drawn in 16 headings so a
// ship steered by hand turns smoothly. Frame names: ship_<k>, cargo_<k>, patrol_<k>, pirate_<k>,
// where heading k points `k * 22.5` degrees round from +x (the direction of the map's x axis).
import { Canvas } from "../canvas";
import { cloth, planks } from "../materials";
import { rampColor, shade, type RampName } from "../palette";
import { flat, lit, Scene, type Material } from "../raytrace";
import { renderSprite, type Sprite } from "../sprite";
import { strand } from "./nature";

export const SHIP_HEADINGS = 16;
export type ShipStyle = "scout" | "cargo" | "patrol" | "pirate";

interface Design {
  L: number;
  W: number;
  hullTop: number;
  hull: RampName;
  deck: RampName;
  /** Main mast x and height, then the smaller ones. */
  masts: { x: number; h: number; lateen?: boolean }[];
  sail: RampName;
  pennant: RampName;
  guns: number;
  crates: boolean;
  castles: boolean;
  cross?: RampName;
}

const DESIGNS: Record<ShipStyle, Design> = {
  scout: {
    L: 1.45,
    W: 0.36,
    hullTop: 10,
    hull: "timber",
    deck: "plank",
    masts: [
      { x: 0.2, h: 58 },
      { x: 0.85, h: 44 },
      { x: -0.75, h: 40, lateen: true },
    ],
    sail: "sail",
    pennant: "cloth",
    guns: 0,
    crates: true,
    castles: false,
  },
  cargo: {
    L: 1.55,
    W: 0.54,
    hullTop: 11,
    hull: "plank",
    deck: "plank",
    masts: [{ x: 0.05, h: 62 }],
    sail: "sail",
    pennant: "clothBlue",
    guns: 0,
    crates: true,
    castles: true,
    cross: "clothBlue",
  },
  patrol: {
    L: 1.6,
    W: 0.44,
    hullTop: 11,
    hull: "slate",
    deck: "plank",
    masts: [
      { x: 0.15, h: 64 },
      { x: 0.9, h: 48 },
      { x: -0.8, h: 42, lateen: true },
    ],
    sail: "plaster",
    pennant: "clothRed",
    guns: 4,
    crates: false,
    castles: true,
    cross: "clothRed",
  },
  pirate: {
    L: 1.6,
    W: 0.44,
    hullTop: 11,
    hull: "darkwood",
    deck: "darkwood",
    masts: [
      { x: 0.15, h: 64 },
      { x: 0.9, h: 48 },
      { x: -0.8, h: 42, lateen: true },
    ],
    sail: "basalt",
    pennant: "basalt",
    guns: 4,
    crates: false,
    castles: true,
  },
};

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

export function shipScene(k: number, style: ShipStyle, hullOnly = false): Scene {
  const d = DESIGNS[style];
  const pirate = style === "pirate";
  const s = new Scene();
  const { L, W, hullTop } = d;
  s.withYaw((k * Math.PI * 2) / SHIP_HEADINGS, [0, 0], () => {
    const m = (z: number) => z / 19.6;
    const hull: Material = (c) => {
      const z = c.lp[2];
      if (c.ln[2] > 0.8) return planks(d.deck, "x", 0.07)(c);
      // Below the waterline line the planks run on, a little darker: no keel shows, the sea hides it.
      if (z < 3.5) return shade(d.hull, lit(c, 0.02), c.px, c.py, 0.2);
      // Clinker planking: overlapping strakes, each with a dark lower edge.
      const strake = (z / 1.9) % 1 < 0.3 ? -0.2 : 0;
      if (z > hullTop - 1.6) return shade(d.deck, lit(c, 0.18), c.px, c.py, 0.2);
      if (style === "patrol" && z > hullTop - 4.5 && z < hullTop - 3)
        return shade("clothRed", lit(c, 0.15), c.px, c.py, 0.2);
      return shade(d.hull, lit(c, 0.12 + strake), c.px, c.py, 0.2);
    };
    // Hull: pointed bow (+x), flat stern, sides flaring out.
    s.convex(
      [
        { n: [0, 0, -1], d: 0 },
        { n: [0, 0, 1], d: m(hullTop) },
        { n: [-1, 0, 0], d: L * 0.92 },
        { n: [0, 1, -0.3], d: W },
        { n: [0, -1, -0.3], d: W },
        { n: [0.55, 1, 0], d: 0.55 * L + 0.02 },
        { n: [0.55, -1, 0], d: 0.55 * L + 0.02 },
      ],
      hull,
    );
    if (hullOnly) return;
    // The rail: a thin dark wale along both sides of the deck.
    for (const side of [-1, 1]) {
      s.box(
        [-L * 0.85, side * W - 0.02 + side * 0.0, hullTop],
        [L * 0.55, side * W + 0.02, hullTop + 1.6],
        flat(d.deck, -0.15),
      );
    }
    // Stern castle with windows, and a forecastle at the bow.
    const castleTop = hullTop + (d.castles ? 8 : 5);
    s.box([-L * 0.92, -W * 0.96, hullTop - 1], [-L * 0.45, W * 0.96, castleTop], hull);
    s.box([-L * 0.94, -W, castleTop], [-L * 0.43, W, castleTop + 1.2], flat(d.deck, 0.1));
    for (const y of [-0.6, 0, 0.6])
      s.box(
        [-L * 0.935, y * W - 0.04, hullTop + 2],
        [-L * 0.91, y * W + 0.04, hullTop + 4.4],
        flat("glass", 0.1),
      );
    if (d.castles) {
      s.box([L * 0.42, -W * 0.7, hullTop - 1], [L * 0.72, W * 0.7, hullTop + 6], hull);
      s.box(
        [L * 0.4, -W * 0.72, hullTop + 6],
        [L * 0.74, W * 0.72, hullTop + 7.2],
        flat(d.deck, 0.1),
      );
      // Crenellations along the stern castle.
      for (let i = 0; i < 5; i++)
        for (const side of [-1, 1])
          s.box(
            [-L * 0.92 + i * 0.16, side * W * 0.96 - 0.02, castleTop + 1.2],
            [-L * 0.92 + i * 0.16 + 0.08, side * W * 0.96 + 0.02, castleTop + 3],
            flat(d.deck, 0.05),
          );
    }
    // A bowsprit.
    s.prism("x", [L * 0.85, 0, hullTop + 3.4], 0.03, 0.42, flat("timber"), 6);
    // Cargo on deck, or guns at the ports.
    if (d.crates) {
      const crate = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) =>
        s.box([x0, y0, z0], [x1, y1, z1], crateMaterial([x0, y0, z0], [x1, y1, z1]));
      const w = W * 0.75;
      crate(-0.3, -w, -0.05, -w + 0.26, hullTop, hullTop + 5);
      crate(-0.3, w - 0.26, -0.08, w, hullTop, hullTop + 4.6);
      crate(-0.28, -w + 0.02, -0.12, -w + 0.22, hullTop + 5, hullTop + 9);
      if (style === "cargo") {
        crate(0.28, -w, 0.52, -w + 0.3, hullTop, hullTop + 5.5);
        crate(0.3, w - 0.3, 0.54, w, hullTop, hullTop + 4.5);
        crate(0.3, -w + 0.02, 0.5, -w + 0.26, hullTop + 5.5, hullTop + 9.5);
        for (const [x, y] of [
          [-0.05, -0.12],
          [0.1, 0.16],
          [-0.12, 0.1],
        ] as const)
          s.prism("z", [x, y, hullTop + 3], 0.09, 3, planks("plank", "z", 0.05), 10);
      } else {
        crate(0.3, w - 0.26, 0.5, w, hullTop, hullTop + 4.5);
      }
    }
    if (d.guns > 0) {
      const n = d.guns;
      for (let i = 0; i < n; i++) {
        const x = -0.3 + (i * 0.75) / Math.max(1, n - 1);
        for (const side of [-1, 1])
          s.prism("y", [x, side * (W - 0.02), hullTop - 3], 0.06, 0.18, flat("rock", -0.15), 6);
      }
      // A pair of cannons on the stern castle deck and the swivel gun at the bow.
      s.prism("x", [-L * 0.68, 0, castleTop + 2.2], 0.06, 0.2, flat("hull", 0.1), 8);
    }
    // Masts, yards and sails.
    d.masts.forEach((mast, i) => {
      s.prism("z", [mast.x, 0, hullTop + mast.h / 2], 0.04, mast.h / 2, flat("timber"), 6);
      const top = hullTop + mast.h;
      if (mast.lateen) {
        // A slanted triangular sail on a long yard, high at the front.
        const columns = 9;
        const x0 = mast.x - 0.75;
        const x1 = mast.x + 0.3;
        for (let c = 0; c < columns; c++) {
          const t = c / (columns - 1);
          const x = x0 + (x1 - x0) * t;
          const zTop = top - 4 - t * 4 - (1 - t) * 14;
          s.box(
            [x, -0.04, hullTop + 10],
            [x + (x1 - x0) / columns + 0.03, 0.04, Math.max(hullTop + 12, zTop)],
            cloth(d.sail),
          );
        }
        s.box([x0, -0.02, top - 14], [x1, 0.02, top - 12], flat("timber", 0.05));
        return;
      }
      const yardW = 0.3 + (i === 0 ? W * 0.75 : W * 0.55);
      const z0 = hullTop + 13 - i * 2;
      const z1 = top - 3;
      s.prism("y", [mast.x + 0.02, 0, z1 + 1], 0.022, yardW, flat("timber"), 6);
      const slabs = 9;
      for (let c = 0; c < slabs; c++) {
        const t = c / (slabs - 1);
        const zA = z0 + (z1 - z0) * t;
        const zB = z0 + (z1 - z0) * ((c + 1) / slabs);
        // The sail bellies out forwards and narrows a little towards the foot.
        const belly = Math.sin(Math.PI * (0.15 + 0.7 * t)) * 0.14;
        const half = yardW * (0.78 + 0.22 * t) * 0.95;
        s.box(
          [mast.x + 0.03 + belly, -half, zA],
          [mast.x + 0.12 + belly, half, Math.min(z1, zB + 1.6)],
          cloth(d.sail),
        );
      }
      if (d.cross) {
        // A broad cross down the middle of the sail, in the ship's colour.
        const belly = Math.sin(Math.PI * 0.5) * 0.14;
        s.box(
          [mast.x + 0.09 + belly, -0.05, z0 + 2],
          [mast.x + 0.11 + belly, 0.05, z1 - 2],
          flat(d.cross, 0.05),
        );
        s.box(
          [mast.x + 0.09 + belly, -yardW * 0.55, (z0 + z1) / 2 + 1],
          [mast.x + 0.11 + belly, yardW * 0.55, (z0 + z1) / 2 + 4],
          flat(d.cross, 0.05),
        );
      }
      if (pirate && i === 0) {
        const belly = Math.sin(Math.PI * 0.5) * 0.14;
        s.box(
          [mast.x + 0.09 + belly, -0.12, z0 + 10],
          [mast.x + 0.11 + belly, 0.12, z0 + 19],
          flat("stone", 0.3),
        );
      }
      // Shrouds from the masthead to the rail.
      for (const side of [-1, 1])
        strand(
          s,
          [mast.x, side * 0.03, top - 6],
          [mast.x - 0.06, side * (W - 0.02), hullTop + 1.5],
          0.012,
          0.5,
          flat("timber", 0.1),
          5,
        );
    });
    // Pennant streaming from the main masthead.
    const main = d.masts[0]!;
    s.box(
      [main.x - 0.42, -0.012, hullTop + main.h + 1],
      [main.x + 0.02, 0.012, hullTop + main.h + 5.5],
      pirate ? flat("basalt", 0.1) : flat(d.pennant, 0.15),
    );
  });
  s.groundShadow = null;
  return s;
}

export function shipSprite(style: ShipStyle, k: number): Sprite {
  const name = `${style === "scout" ? "ship" : style}_${k}`;
  return renderSprite(name, shipScene(k, style), 1, 1, 110, 80);
}

/**
 * Where the hull meets the sea: the lowest opaque pixel of each column of the hull alone. The
 * waterline layers (the wet band on the planks, the shadow on the water, the lapping foam) all
 * follow this profile, so they hug the hull whatever its heading.
 */
function waterProfile(hull: Sprite): { bottom: (number | null)[]; first: number; last: number } {
  const c = hull.canvas;
  const bottom: (number | null)[] = [];
  let first = -1;
  let last = -1;
  for (let x = 0; x < c.width; x++) {
    let yb: number | null = null;
    for (let y = c.height - 1; y >= 0; y--)
      if (c.alpha(x, y) > 128) {
        yb = y;
        break;
      }
    bottom.push(yb);
    if (yb !== null) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return { bottom, first, last };
}

const hash = (x: number, y: number, seed: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * The layers that put a ship in the water, from its hull alone: `wet` darkens and blurs the
 * lowest planks into the sea, `shadow` is a dark patch of water under the hull, and `foam` is a
 * broken ring of white lapping at the waterline in two frames.
 */
function waterlineSprites(style: ShipStyle, k: number): Sprite[] {
  const hull = renderSprite("hull", shipScene(k, style, true), 1, 1, 110, 80);
  const { bottom, first, last } = waterProfile(hull);
  const pad = 8;
  const w = hull.canvas.width + pad * 2;
  const h = hull.canvas.height + pad * 2;
  const profile = (x: number): number | null => {
    // Beyond the bow and stern the waterline carries on at the nearest column's level.
    const cx = Math.min(last, Math.max(first, x));
    return bottom[cx] ?? null;
  };
  const make = (name: string, paint: (c: Canvas) => void): Sprite => {
    const c = new Canvas(w, h);
    paint(c);
    return {
      name,
      canvas: c,
      anchorX: hull.anchorX + pad,
      anchorY: hull.anchorY + pad,
      meta: { res: 2 },
    };
  };
  const water = rampColor("deepWater", 3);
  const foam = rampColor("foam", 3);
  const out: Sprite[] = [];
  // The wet band: the lowest rows of the planks take on the colour of the sea, dithered upwards.
  out.push(
    make(`shipwet_${style}_${k}`, (c) => {
      for (let x = first; x <= last; x++) {
        const yb = bottom[x];
        if (yb === null || yb === undefined) continue;
        for (let dy = 0; dy < 10; dy++) {
          const y = yb - dy;
          const keep = dy < 4 ? 1 : dy < 7 ? 0.65 : 0.3;
          if (hash(x, y, 1) > keep) continue;
          c.set(x + pad, y + pad, [water[0], water[1], water[2], dy < 4 ? 205 : 130]);
        }
      }
    }),
  );
  // The shadow: dark water under and just beside the hull, fading downwards.
  out.push(
    make(`shipshadow_${style}_${k}`, (c) => {
      for (let x = first - 4; x <= last + 4; x++) {
        const yb = profile(x);
        if (yb === null) continue;
        const edge = x < first ? first - x : x > last ? x - last : 0;
        for (let dy = -3; dy < 9 - edge; dy++) {
          const y = yb + dy;
          const a = (1 - (dy + 3) / (12 - edge)) * 0.55;
          if (hash(x, y, 2) > a * 1.6) continue;
          c.set(x + pad, y + pad, [8, 40, 52, 110]);
        }
      }
    }),
  );
  // The foam: a thin broken line along the waterline, shifting between two frames as it laps.
  for (const f of [0, 1]) {
    out.push(
      make(`shipfoam_${style}_${k}_${f}`, (c) => {
        for (let x = first - 3; x <= last + 3; x++) {
          const yb = profile(x);
          if (yb === null) continue;
          const edge = x < first ? first - x : x > last ? x - last : 0;
          for (let dy = -1; dy < 4 - edge; dy++) {
            const y = yb + dy + (f === 1 && (x >> 2) % 2 === 0 ? 1 : 0);
            if (hash(x, y, 3 + f) > 0.7) continue;
            const col = hash(x, y, 9) > 0.5 ? foam : rampColor("foam", 2);
            c.set(x + pad, y + pad, [col[0], col[1], col[2], dy < 2 ? 230 : 150]);
          }
        }
      }),
    );
  }
  return out;
}

export function shipSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const style of ["scout", "cargo", "patrol", "pirate"] as const)
    for (let k = 0; k < SHIP_HEADINGS; k++) {
      out.push(shipSprite(style, k));
      out.push(...waterlineSprites(style, k));
    }
  out.push(...wakeSprites());
  return out;
}

/** Foam and ripples for a ship's wake: soft translucent blobs the game spawns, spreads and fades. */
export function wakeSprites(): Sprite[] {
  const out: Sprite[] = [];
  const foam = rampColor("foam", 4);
  const blob = (name: string, rx: number, ry: number, peak: number, hollow = 0) => {
    const w = Math.ceil(rx * 2) + 4;
    const h = Math.ceil(ry * 2) + 4;
    const c = new Canvas(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / rx;
        const dy = (y + 0.5 - h / 2) / ry;
        const r = Math.hypot(dx, dy);
        if (r > 1) continue;
        // A soft edge, dithered so it stays pixel art; a ring keeps only its rim.
        const edge =
          hollow > 0 ? Math.max(0, 1 - Math.abs(r - (1 - hollow / 2)) / (hollow / 2)) : 1 - r * r;
        const dither = ((x * 7 + y * 13) % 4) / 4;
        const a = edge * peak;
        if (a > 0.12 + dither * 0.2)
          c.set(x, y, [foam[0], foam[1], foam[2], Math.round(Math.min(1, a) * 255)]);
      }
    out.push({ name, canvas: c, anchorX: Math.floor(w / 2), anchorY: Math.floor(h / 2) });
  };
  blob("wake_foam_0", 5, 2.6, 0.95);
  blob("wake_foam_1", 8, 4, 0.85);
  blob("wake_foam_2", 12, 6, 0.7);
  blob("wake_ring", 26, 13, 0.9, 0.16);
  blob("wake_spray", 4, 3, 1);
  return out;
}

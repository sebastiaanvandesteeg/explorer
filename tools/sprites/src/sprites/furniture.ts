// Furniture for the rooms inside the buildings, modelled like everything else: boxes, prisms and
// ellipsoids ray-cast into palette pixels with outlines and cast shadows. Which pieces exist (and
// how big and which way round) comes from the rooms in @explorer/shared; each is built here with
// its front towards +y and turned to face +x when the room says so.
import {
  furniturePieces,
  type BuildingKind,
  type Furniture,
  type FurnitureKind,
} from "@explorer/shared";
import { bricks, cloth, planks } from "../materials";
import { hash3, noise3 } from "../noise3";
import { rampColor, shade, type RampName } from "../palette";
import { flat, lit, Scene, type Material } from "../raytrace";
import { renderSprite, type Sprite } from "../sprite";
import { withLights } from "./buildings";

/** `A` tiles along the front, `B` deep; returns the height of the top in pixels. */
type Model = (s: Scene, A: number, B: number, room: BuildingKind) => number;

const wood = (ramp: RampName, dir: "x" | "y" | "z" = "x", pitch = 0.09) => planks(ramp, dir, pitch);
const light = () => wood("plank", "x", 0.1);
const dark = () => wood("timber", "x", 0.09);
const iron = flat("slate", 0.12);
const ember: Material = (c) => {
  const n = noise3(c.p[0] * 30, c.p[1] * 30, c.p[2] / 2, 71);
  return rampColor("fire", n < 0.35 ? 1 : n < 0.75 ? 2 : n < 0.93 ? 3 : 4);
};
const flame: Material = (c) => rampColor("fire", c.light > 0.35 ? 4 : 3);
const cream: Material = (c) => shade("plaster", lit(c, 0.06), c.px, c.py, 0.25);

/** A row of books (or bottles' worth of colour) along a shelf board. */
function books(
  s: Scene,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  seed: number,
  palette: RampName[],
  maxHeight = 7,
): void {
  let x = x0;
  for (let i = 0; x < x1 - 0.06; i++) {
    const w = 0.06 + hash3(i, seed, 0, 91) * 0.07;
    const h = 4.5 + hash3(i, seed, 1, 91) * (maxHeight - 4.5);
    if (hash3(i, seed, 2, 91) > 0.88) {
      x += w * 1.5;
      continue;
    }
    const ramp = palette[Math.floor(hash3(i, seed, 3, 91) * palette.length)]!;
    s.box([x, y0, z], [Math.min(x + w, x1), y1, z + h], flat(ramp, 0.05));
    x += w + 0.008;
  }
}

function candle(s: Scene, x: number, y: number, z: number, h = 4): void {
  s.prism("z", [x, y, z + h / 2], 0.035, h / 2, cream, 6);
  s.ellipsoid([x, y, z + h + 1.6], [0.03, 0.03, 1.8], flame, { castsShadow: false });
}

// ---------------------------------------------------------------------------------------------

const bed: Model = (s, A, B) => {
  const frame = wood("timber", "z", 0.07);
  s.box([0.06, 0.06, 0], [A - 0.06, B - 0.06, 5], dark());
  s.box([0.06, 0.06, 5], [A - 0.06, 0.2, 24], frame);
  s.box([0.06, B - 0.2, 5], [A - 0.06, B - 0.06, 11], frame);
  for (const [x, y, h] of [
    [0.04, 0.04, 28],
    [A - 0.16, 0.04, 28],
    [0.04, B - 0.16, 15],
    [A - 0.16, B - 0.16, 15],
  ] as const)
    s.box([x, y, 0], [x + 0.12, y + 0.12, h], flat("timber", 0.08));
  s.box([0.14, 0.2, 5], [A - 0.14, B - 0.2, 8.5], cream);
  s.box([0.12, B * 0.42, 8], [A - 0.12, B - 0.16, 10.8], cloth("clothBlue", 0.3));
  s.box([0.12, B * 0.42 - 0.06, 8], [A - 0.12, B * 0.42 + 0.04, 11.2], flat("plaster", 0.12));
  s.ellipsoid([A * 0.5, 0.52, 10.5], [A * 0.3, 0.17, 2.2], flat("plaster", 0.18));
  return 28;
};

const shelf: Model = (s, A, B, room) => {
  const H = room === "magic_house" ? 42 : 34;
  const side = wood("timber", "z", 0.08);
  s.box([0.03, 0.03, 0], [A - 0.03, 0.17, H], side);
  s.box([0.03, 0.03, 0], [0.14, B - 0.08, H], side);
  s.box([A - 0.14, 0.03, 0], [A - 0.03, B - 0.08, H], side);
  s.box([0.02, 0.02, H - 1.6], [A - 0.02, B - 0.04, H], light());
  s.box([0.03, 0.03, 0], [A - 0.03, B - 0.06, 2.2], side);
  const levels = 3;
  const gap = (H - 1.6 - 2.2) / levels;
  for (let k = 0; k < levels; k++) {
    const z = 2.2 + k * gap;
    if (k > 0) s.box([0.14, 0.17, z], [A - 0.14, B - 0.1, z + 1.2], light());
    const top = z + (k > 0 ? 1.2 : 0);
    const seed = k * 7 + Math.round(A * 13);
    if (room === "town_hall" && k === 1) {
      // Rolled scrolls and ledgers.
      for (let x = 0.2; x < A - 0.25; x += 0.16)
        s.prism(
          "y",
          [x, 0.4, top + 2],
          0.06,
          0.12,
          flat(hash3(x * 9, k, 0, 5) > 0.5 ? "plaster" : "sand", 0.1),
          6,
        );
    } else if (room === "magic_house" && k === 2) {
      // Bottles of something that glows.
      for (let x = 0.3; x < A - 0.25; x += 0.26) {
        s.ellipsoid([x, 0.42, top + 3], [0.07, 0.07, 3], () => rampColor("glow", 3));
        s.prism("z", [x, 0.42, top + 7], 0.025, 1.6, flat("silver", 0.1), 6);
      }
    } else {
      const palette: RampName[] =
        room === "magic_house"
          ? ["arcane", "crystal", "clothBlue", "gold"]
          : ["clothRed", "clothBlue", "gold", "clothGreen", "plaster", "timber"];
      books(s, 0.16, A - 0.16, 0.3, B - 0.14, top, seed, palette, gap - 2.5);
    }
  }
  return H;
};

const hearth: Model = (s, A, B) => {
  const brick = bricks("stone", 3, 0.12);
  s.box([0, 0.02, 0], [0.34, B - 0.06, 24], brick);
  s.box([A - 0.34, 0.02, 0], [A, B - 0.06, 24], brick);
  s.box([0, 0.02, 20], [A, B - 0.06, 26], brick);
  s.box([0.12, 0.02, 26], [A - 0.12, B * 0.62, 44], brick);
  s.box([-0.04, 0.0, 26], [A + 0.04, B, 28.5], dark());
  s.box([0.34, 0.02, 0], [A - 0.34, 0.24, 20], flat("ash", -0.05));
  s.box([0.3, 0.1, 0], [A - 0.3, B - 0.02, 1.6], flat("slate", 0.05));
  s.prism("x", [A / 2, 0.52, 3.4], 0.09, 0.42, wood("timber", "x", 0.05), 8);
  s.prism("y", [A / 2 - 0.2, 0.55, 5.6], 0.08, 0.26, wood("timber", "y", 0.05), 8);
  s.ellipsoid([A / 2 - 0.12, 0.5, 8], [0.17, 0.1, 5.5], flame, { castsShadow: false });
  s.ellipsoid([A / 2 + 0.14, 0.54, 7], [0.13, 0.09, 4], flame, { castsShadow: false });
  s.ellipsoid([A / 2, 0.52, 4.5], [0.3, 0.14, 2.2], ember, { castsShadow: false });
  candle(s, 0.3, 0.42, 28.5, 4);
  s.prism("z", [A - 0.35, 0.42, 33], 0.07, 4.5, flat("clothGreen", 0.1), 8);
  return 44;
};

const table: Model = (s, A, B, room) => {
  for (const [x, y] of [
    [0.08, 0.1],
    [A - 0.2, 0.1],
    [0.08, B - 0.22],
    [A - 0.2, B - 0.22],
  ] as const)
    s.box([x, y, 0], [x + 0.12, y + 0.12, 10], dark());
  s.box([0, 0.04, 10], [A, B - 0.04, 12.6], light());
  s.box([0.06, 0.1, 9], [A - 0.06, B - 0.1, 10], dark());
  if (room === "house") {
    s.ellipsoid([0.6, 0.5, 14.2], [0.17, 0.11, 1.8], flat("wheat", 0.1));
    s.box([0.95, 0.35, 12.6], [1.3, 0.65, 13.2], cream);
    candle(s, A - 0.3, 0.5, 12.6, 3.5);
  } else {
    s.box([A * 0.3, 0.25, 12.6], [A * 0.3 + 0.36, 0.75, 13.2], cream);
    s.box([A * 0.3 + 0.4, 0.35, 12.6], [A * 0.3 + 0.62, 0.65, 13.4], flat("plaster", 0.05));
    s.prism("z", [A * 0.72, 0.5, 14.2], 0.06, 1.6, flat("rock", 0.05), 6);
  }
  return 18;
};

const chair: Model = (s) => {
  for (const [x, y] of [
    [0.22, 0.26],
    [0.68, 0.26],
    [0.22, 0.68],
    [0.68, 0.68],
  ] as const)
    s.box([x, y, 0], [x + 0.1, y + 0.1, 6], dark());
  s.box([0.18, 0.2, 6], [0.82, 0.8, 8], light());
  s.box([0.18, 0.2, 8], [0.26, 0.8, 20], wood("timber", "z", 0.08));
  s.box([0.16, 0.2, 18], [0.28, 0.8, 20.5], dark());
  return 21;
};

const desk: Model = (s, A, B) => {
  const top = wood("darkwood", "x", 0.09);
  s.box([0.05, 0.1, 0], [A - 0.05, B - 0.08, 11.5], wood("darkwood", "z", 0.08));
  s.box([-0.02, 0.04, 11.5], [A + 0.02, B, 13.6], top);
  for (let i = 0; i < Math.max(1, Math.round(A)); i++) {
    const x = 0.2 + i * ((A - 0.4) / Math.max(1, Math.round(A)));
    s.box(
      [x, B - 0.1, 2],
      [x + (A - 0.4) / Math.max(1, Math.round(A)) - 0.08, B - 0.06, 10.5],
      flat("timber", 0.12),
    );
    s.box([x + 0.16, B - 0.07, 6], [x + 0.26, B - 0.03, 7.2], flat("gold", 0.2));
  }
  s.box([A * 0.25, 0.25, 13.6], [A * 0.25 + 0.42, 0.75, 14.2], cream);
  s.box([A * 0.6, 0.3, 13.6], [A * 0.6 + 0.3, 0.7, 15.4], flat("clothRed", 0.1));
  s.prism("z", [A * 0.86, 0.45, 15], 0.05, 1.4, flat("rock", 0.0), 6);
  candle(s, A * 0.45, 0.3, 13.6, 4);
  return 22;
};

const counter: Model = (s, A, B) => {
  s.box([0, 0.08, 0], [A, B - 0.06, 13], wood("plank", "z", 0.1));
  for (let x = 0.5; x < A; x += 1) s.box([x - 0.03, B - 0.08, 0], [x + 0.03, B - 0.04, 13], dark());
  s.box([-0.05, 0.02, 13], [A + 0.05, B, 15.2], light());
  s.box([0.3, 0.3, 15.2], [0.9, 0.7, 19.5], wood("plank", "x", 0.07));
  for (const [x, ramp] of [
    [0.45, "fruit"],
    [0.65, "berry"],
    [0.8, "pumpkin"],
  ] as const)
    s.ellipsoid([x, 0.5, 20.5], [0.08, 0.08, 1.8], flat(ramp, 0.1));
  s.prism("z", [A * 0.55, 0.5, 18], 0.03, 3, flat("rock", 0.1), 6);
  s.box([A * 0.55 - 0.22, 0.47, 20.5], [A * 0.55 + 0.22, 0.53, 21.2], flat("gold", 0.1));
  s.box([A - 1.1, 0.25, 15.2], [A - 0.4, 0.75, 15.8], cloth("clothRed", 0.2));
  return 24;
};

const crate: Model = (s, A, B, room) => {
  const body = wood("plank", "x", 0.08);
  s.box([0.05, 0.05, 0], [A - 0.05, B - 0.05, 13], body);
  for (const x of [0.04, A - 0.12]) s.box([x, 0.03, 0], [x + 0.08, B - 0.03, 13.4], dark());
  s.box([0.03, 0.03, 10.5], [A - 0.03, B - 0.03, 12], dark());
  if (room === "market") {
    for (let i = 0; i < Math.round(A * 2); i++)
      s.ellipsoid(
        [0.25 + i * 0.33, 0.5, 14],
        [0.11, 0.11, 2.2],
        flat(i % 2 ? "fruit" : "pumpkin", 0.1),
      );
  } else {
    s.box([0.02, 0.02, 13], [A - 0.02, B - 0.02, 14.4], light());
  }
  return 16;
};

const barrel: Model = (s) => {
  s.prism("z", [0.5, 0.5, 9], 0.37, 9, wood("plank", "z", 0.05), 10);
  for (const z of [3.5, 14.5]) s.prism("z", [0.5, 0.5, z], 0.385, 0.9, iron, 10);
  s.prism("z", [0.5, 0.5, 17.4], 0.33, 0.7, wood("plank", "x", 0.06), 10);
  return 19;
};

const anvil: Model = (s) => {
  s.prism("z", [0.5, 0.5, 4.5], 0.3, 4.5, wood("timber", "z", 0.06), 9);
  s.box([0.32, 0.32, 9], [0.68, 0.68, 11.5], iron);
  s.box([0.14, 0.36, 11.5], [0.78, 0.64, 15.5], iron);
  s.box([0.78, 0.42, 13], [0.98, 0.58, 15.5], iron);
  s.box([0.2, 0.4, 15.5], [0.5, 0.6, 16.2], () => rampColor("fire", 3));
  return 17;
};

const forge: Model = (s, A, B) => {
  const brick = bricks("stone", 3, 0.12);
  // A brick body with a recessed coal bed, a hood on piers and a chimney up to the roof.
  s.box([0, 0.08, 0], [A, B - 0.02, 11], brick);
  s.box([0.3, 0.3, 11], [A - 0.3, B - 0.14, 11.6], flat("ash", 0.0));
  s.box([0.3, 0.3, 11.2], [A - 0.3, B - 0.14, 12.2], ember, { castsShadow: false });
  s.ellipsoid([A * 0.42, 0.55, 13], [0.42, 0.18, 2.4], ember, { castsShadow: false });
  s.box([0.06, 0.08, 11], [0.3, 0.38, 26], brick);
  s.box([A - 0.3, 0.08, 11], [A - 0.06, 0.38, 26], brick);
  s.box([0.06, 0.08, 11], [A - 0.06, 0.26, 28], brick);
  s.box([0.0, 0.06, 26], [A, 0.52, 30], brick);
  s.box([0.3, 0.1, 30], [A - 0.3, 0.42, 44], brick);
  s.box([A - 0.55, 0.3, 0], [A - 0.04, B - 0.04, 9], wood("plank", "x", 0.08));
  s.ellipsoid([A - 0.3, 0.6, 10], [0.25, 0.3, 3], flat("timber", 0.1));
  s.prism("y", [A - 0.3, 0.3, 6], 0.03, 0.3, iron, 6);
  return 44;
};

const rack: Model = (s, A, B) => {
  const post = wood("timber", "z", 0.08);
  s.box([0.04, 0.06, 0], [0.16, 0.22, 30], post);
  s.box([A - 0.16, 0.06, 0], [A - 0.04, 0.22, 30], post);
  s.box([0.04, 0.06, 22], [A - 0.04, 0.22, 25], dark());
  s.box([0.04, 0.06, 10], [A - 0.04, 0.22, 12], dark());
  // A hammer, tongs and an axe hanging on the rack.
  s.box([0.32, 0.26, 12], [0.38, 0.32, 24], wood("timber", "z", 0.05));
  s.box([0.26, 0.25, 22], [0.5, 0.34, 26], iron);
  s.box([0.78, 0.26, 10], [0.82, 0.3, 24], iron);
  s.box([0.9, 0.26, 10], [0.94, 0.3, 24], iron);
  s.box([1.2, 0.26, 12], [1.26, 0.32, 25], wood("timber", "z", 0.05));
  s.box([1.26, 0.25, 19], [1.5, 0.34, 25], iron);
  s.box([1.62, 0.26, 11], [1.66, 0.3, 25], iron);
  void B;
  return 30;
};

const altar: Model = (s, A, B) => {
  const stone = bricks("stone", 3, 0.16);
  s.box([0.05, 0.12, 0], [A - 0.05, B - 0.1, 14], stone);
  s.box([-0.02, 0.06, 14], [A + 0.02, B - 0.04, 16], flat("stone", 0.15));
  s.box([0.08, 0.14, 16], [A - 0.08, B - 0.12, 16.8], cloth("clothRed", 0.15));
  s.box([0.08, B - 0.16, 10], [A - 0.08, B - 0.11, 13], flat("gold", 0.0));
  candle(s, 0.35, 0.5, 16.8, 5);
  candle(s, A - 0.35, 0.5, 16.8, 5);
  s.prism("z", [A / 2, 0.5, 19], 0.05, 2.2, flat("gold", 0.2), 6);
  s.ellipsoid([A / 2, 0.5, 22], [0.09, 0.09, 1.6], flat("gold", 0.3));
  s.box([A / 2 - 0.03, 0.46, 22], [A / 2 + 0.03, 0.54, 33], flat("gold", 0.15));
  s.box([A / 2 - 0.16, 0.46, 29], [A / 2 + 0.16, 0.54, 31.5], flat("gold", 0.15));
  return 34;
};

const pew: Model = (s, A, B) => {
  const side = wood("timber", "z", 0.08);
  s.box([0.0, 0.2, 0], [0.12, B - 0.12, 15], side);
  s.box([A - 0.12, 0.2, 0], [A, B - 0.12, 15], side);
  s.box([0.1, 0.24, 6.5], [A - 0.1, B - 0.3, 8.6], light());
  s.box([0.1, B - 0.3, 8.6], [A - 0.1, B - 0.18, 14], wood("plank", "x", 0.1));
  s.box([0.1, B - 0.32, 13.2], [A - 0.1, B - 0.14, 14.6], dark());
  s.box([0.14, B - 0.06, 0], [A - 0.14, B - 0.0, 3], dark());
  return 15;
};

const brazier: Model = (s) => {
  for (const [x, y] of [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.5, 0.72],
  ] as const)
    s.prism("z", [x, y, 6], 0.035, 6, iron, 5);
  s.prism("z", [0.5, 0.5, 13], 0.25, 1.6, flat("basalt", 0.25), 9);
  s.ellipsoid([0.5, 0.5, 15.5], [0.17, 0.17, 2], ember, { castsShadow: false });
  s.ellipsoid([0.48, 0.5, 19.5], [0.11, 0.11, 4.5], flame, { castsShadow: false });
  return 25;
};

const cauldron: Model = (s) => {
  for (const [x, y] of [
    [0.3, 0.32],
    [0.7, 0.32],
    [0.5, 0.72],
  ] as const)
    s.prism("z", [x, y, 3], 0.04, 3, iron, 5);
  s.ellipsoid([0.5, 0.5, 9], [0.33, 0.33, 6.5], flat("slate", 0.15));
  s.prism("z", [0.5, 0.5, 13], 0.34, 1.2, flat("slate", 0.28), 12);
  s.ellipsoid(
    [0.5, 0.5, 14.3],
    [0.27, 0.27, 1.4],
    (c) => rampColor("glow", noise3(c.p[0] * 50, c.p[1] * 50, 1, 93) > 0.66 ? 5 : 3),
    { castsShadow: false },
  );
  s.ellipsoid([0.5, 0.88, 2.2], [0.14, 0.05, 1.8], ember, { castsShadow: false });
  return 15;
};

const plinth: Model = (s, A, B, room) => {
  if (room === "magic_house") {
    s.box([0.22, 0.22, 0], [0.78, 0.78, 12], bricks("stone", 3, 0.12));
    s.box([0.18, 0.18, 12], [0.82, 0.82, 14], flat("stone", 0.18));
    s.ellipsoid([0.5, 0.5, 21.5], [0.18, 0.18, 6.6], (c) =>
      shade(
        "arcane",
        0.35 + 0.75 * c.light + (noise3(c.p[0] * 40, c.p[1] * 40, c.p[2] / 3, 94) - 0.5) * 0.2,
        c.px,
        c.py,
        0.25,
      ),
    );
    s.prism("z", [0.5, 0.5, 15], 0.07, 1, flat("gold", 0.1), 8);
    return 30;
  }
  if (room === "great_work") {
    s.box([0.1, 0.1, 0], [A - 0.1, B - 0.1, 5], bricks("stone", 3, 0.16));
    s.box([0.22, 0.22, 5], [A - 0.22, B - 0.22, 8], flat("stone", 0.2));
    // A little model of the monument: ring of pillars round a crowned centre.
    const cx = A / 2;
    const cy = B / 2;
    for (const [dx, dy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ] as const)
      s.prism("z", [cx + dx, cy + dy, 14], 0.07, 6, flat("stone", 0.25), 8);
    s.box([cx - 0.36, cy - 0.36, 20], [cx + 0.36, cy + 0.36, 22], flat("stone", 0.3));
    s.box([cx - 0.22, cy - 0.22, 8], [cx + 0.22, cy + 0.22, 20], bricks("stone", 2.5, 0.1));
    s.pyramid(cx, cy, 0.3, 0.3, 22, 31, flat("gold", 0.15));
    return 32;
  }
  // The dock's harbour master keeps a model ship on a stand.
  s.box([0.3, 0.3, 0], [0.7, 0.7, 10], wood("plank", "z", 0.08));
  s.box([0.26, 0.26, 10], [0.74, 0.74, 11.6], light());
  s.ellipsoid([0.5, 0.5, 14], [0.36, 0.14, 3.4], flat("timber", 0.15));
  s.box([0.2, 0.44, 15.5], [0.8, 0.56, 16.6], flat("plank", 0.1));
  s.prism("z", [0.5, 0.5, 23], 0.02, 8, flat("timber", 0.1), 5);
  s.box([0.3, 0.47, 18], [0.7, 0.53, 30], (c) => shade("sail", lit(c, 0.15), c.px, c.py, 0.25));
  return 31;
};

const chart: Model = (s, A, B) => {
  for (const [x, y] of [
    [0.08, 0.1],
    [A - 0.2, 0.1],
    [0.08, B - 0.22],
    [A - 0.2, B - 0.22],
  ] as const)
    s.box([x, y, 0], [x + 0.12, y + 0.12, 10], dark());
  s.box([0, 0.04, 10], [A, B - 0.04, 12.6], wood("plank", "x", 0.1));
  const map: Material = (c) => {
    const u = c.lp[0];
    const v = c.lp[1];
    const land = noise3(u * 3.2, v * 4.5, 0.4, 95) > 0.55;
    if (land) return shade("sprout", lit(c, -0.05), c.px, c.py, 0.25);
    const coast = noise3(u * 3.2, v * 4.5, 0.4, 95) > 0.5;
    return coast ? rampColor("sand", 3) : shade("sail", lit(c, 0.08), c.px, c.py, 0.25);
  };
  s.box([0.22, 0.14, 12.6], [A - 0.22, B - 0.14, 13.3], map);
  s.prism("z", [A - 0.5, 0.5, 14.4], 0.07, 0.9, flat("gold", 0.15), 8);
  s.prism("x", [0.42, 0.78, 13.8], 0.05, 0.22, flat("plaster", 0.1), 6);
  return 17;
};

/** Field, border and accent ramps for the rugs of each room. */
const RUGS: Partial<Record<BuildingKind, [RampName, RampName, RampName]>> = {
  house: ["clothRed", "wheat", "plaster"],
  town_hall: ["clothBlue", "gold", "plaster"],
  market: ["cloth", "clothRed", "plaster"],
  church: ["clothRed", "gold", "plaster"],
  magic_house: ["arcane", "crystal", "glow"],
  great_work: ["clothBlue", "gold", "plaster"],
  dock: ["hull", "sail", "plaster"],
};

const rug: Model = (s, A, B, room) => {
  const [field, border, accent] = RUGS[room] ?? RUGS.house!;
  const mat: Material = (c) => {
    const u = c.lp[0];
    const v = c.lp[1];
    const d = Math.min(u, A - u, v, B - v);
    const weave = (Math.floor(u * 18) + Math.floor(v * 18)) % 2 === 0 ? 0.04 : -0.03;
    if (d < 0.07) return shade(border, lit(c, -0.2 + weave), c.px, c.py, 0.2);
    if (d < 0.14) return shade(accent, lit(c, -0.02 + weave), c.px, c.py, 0.2);
    if (d < 0.22) return shade(border, lit(c, -0.08 + weave), c.px, c.py, 0.2);
    // Medallions down the middle: as many as fit, evenly spaced along the long side.
    const long = A >= B;
    const short = Math.min(A, B);
    const length = long ? A : B;
    const count = Math.max(1, Math.round(length / (short * 0.9)));
    const cell = length / count;
    const cu = ((long ? u : v) % cell) - cell / 2;
    const cv = long ? v - B / 2 : u - A / 2;
    const radius = Math.min(cell, short) * 0.28;
    const m = (Math.abs(cu) + Math.abs(cv)) / radius;
    if (m < 1 && short >= 1)
      return shade(m < 0.5 ? accent : border, lit(c, weave), c.px, c.py, 0.2);
    const n = (noise3(u * 30, v * 30, 0.5, 96) - 0.5) * 0.06;
    return shade(field, lit(c, weave + n), c.px, c.py, 0.25);
  };
  s.box([0.04, 0.04, 0], [A - 0.04, B - 0.04, 0.9], mat, { castsShadow: false });
  return 1;
};

const MODELS: Partial<Record<FurnitureKind, Model>> = {
  bed,
  shelf,
  hearth,
  table,
  chair,
  desk,
  counter,
  crate,
  barrel,
  anvil,
  forge,
  rack,
  altar,
  pew,
  brazier,
  cauldron,
  plinth,
  chart,
  rug,
};

function build(room: BuildingKind, item: Furniture, name: string): Sprite {
  const model = MODELS[item.kind];
  if (!model) throw new Error(`no model for furniture ${item.kind}`);
  const turned = item.face === "+x";
  const A = turned ? item.h : item.w;
  const B = turned ? item.w : item.h;
  const s = new Scene();
  let top = 0;
  if (turned) s.withYaw(-Math.PI / 2, [A / 2, A / 2], () => void (top = model(s, A, B, room)));
  else top = model(s, A, B, room);
  const flatThing = item.kind === "rug";
  if (!flatThing) s.groundShadow = { x0: 0, y0: 0, x1: item.w + 0.9, y1: item.h };
  const sprite = renderSprite(
    name,
    s,
    item.w,
    item.h,
    top + 4,
    12,
    undefined,
    flatThing ? { outlines: false, depthEdges: false } : {},
  );
  return withLights(sprite);
}

export function furnitureSprites(): Sprite[] {
  return furniturePieces().map(({ room, item, name }) => build(room, item, name));
}

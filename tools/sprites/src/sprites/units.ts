// Villagers (hand-drawn pixel figures), ships (ray-cast in 8 headings), smoke and UI icons.
import { Canvas, outline } from "../canvas";
import { cloth, planks } from "../materials";
import { bayer, hexToRgba, RAMPS, rampColor, shade, type RampName, type Rgba } from "../palette";
import { flat, lit, Scene, type Material } from "../raytrace";
import { renderSprite, trimmed, type Sprite } from "../sprite";
import { TRIBES, type TribeId } from "@explorer/shared";
import { boulder } from "./nature";

export const TUNICS = [0, 1, 2] as const;
export type Tunic = (typeof TUNICS)[number];
export const VILLAGER_POSES = ["stand", "walk0", "walk1", "work0", "work1"] as const;
export type VillagerPose = (typeof VILLAGER_POSES)[number];
export const TOOLS = ["axe", "pick", "hammer", "hoe"] as const;
export type Tool = (typeof TOOLS)[number];

type Hat = "none" | "helmet" | "wrap" | "hood" | "mushroom" | "bandana" | "reed" | "cap" | "cowl";

/** Clothing per tribe: three tunic colours (dark, mid, light) and a headwear style. */
const OUTFITS: Record<TribeId, { tunics: [string, string, string][]; hat: Hat }> = {
  islanders: {
    tunics: [
      ["#2a3446", "#3e4d6a", "#5a6f94"],
      ["#2f4a26", "#4a6b30", "#6f8f42"],
      ["#5a2a1c", "#8a3d22", "#b85a34"],
    ],
    hat: "none",
  },
  northfolk: {
    tunics: [
      ["#3a2a1c", "#5a4430", "#7a5e44"],
      ["#3a3c40", "#5a5e64", "#7c8288"],
      ["#4a1a14", "#7a2a1e", "#a4402e"],
    ],
    hat: "helmet",
  },
  sunfolk: {
    tunics: [
      ["#8a8274", "#c8c0ae", "#eee8d8"],
      ["#8a6a3a", "#b89058", "#dcb880"],
      ["#1a3a6a", "#2a5a9a", "#4a7ec4"],
    ],
    hat: "wrap",
  },
  sylvan: {
    tunics: [
      ["#1e3a1e", "#2e5a2a", "#4a7e3c"],
      ["#16403e", "#1e605a", "#2e8a80"],
      ["#3a4a14", "#5a6e1e", "#7e9430"],
    ],
    hat: "hood",
  },
  glowkin: {
    tunics: [
      ["#2e1a4a", "#4a2a6e", "#6a44a0"],
      ["#12404a", "#1a6a78", "#2aa0a8"],
      ["#4a2a3a", "#6e3e56", "#94607a"],
    ],
    hat: "mushroom",
  },
  freebooters: {
    tunics: [
      ["#8d816e", "#d6cbb4", "#f7f1e1"],
      ["#5a1a2e", "#9a2e4e", "#d0507a"],
      ["#1c2230", "#26304a", "#3e4d6a"],
    ],
    hat: "bandana",
  },
  mirefolk: {
    tunics: [
      ["#22261a", "#3c4428", "#5a6438"],
      ["#26361e", "#445a30", "#6a8646"],
      ["#1e3a3a", "#2e5e58", "#4a8a80"],
    ],
    hat: "reed",
  },
  amberwrights: {
    tunics: [
      ["#5a3e18", "#9a6c28", "#d0a444"],
      ["#6a200c", "#9a3410", "#c85018"],
      ["#3a2a14", "#5a4028", "#7a5a3a"],
    ],
    hat: "cap",
  },
  cinderborn: {
    tunics: [
      ["#1a1414", "#2a2020", "#3a2c28"],
      ["#3a0e0e", "#6a1a18", "#9a2a22"],
      ["#2a2024", "#3a2c30", "#4c3a3c"],
    ],
    hat: "cowl",
  },
};

/** Villagers and what they carry are drawn at twice the world's pixel density. */
export const FIGURE_RES = 2;

/** Skin (shadow, base, light) and hair (dark, base, light) per tunic, for a varied crowd. */
const SKINS: [number, number, number][] = [
  [1, 2, 3],
  [0, 1, 2],
  [1, 2, 3],
];
const HAIRS: [RampName, [number, number, number]][] = [
  ["hair", [0, 1, 2]],
  ["outline", [0, 0, 1]],
  ["thatch", [0, 1, 2]],
];

/**
 * Draw a villager at double resolution: a 32×48 canvas whose figure stands about 34 pixels tall
 * with its feet on (16, 44). "front" faces the viewer's lower right (+x); the renderer mirrors it
 * for +y, and uses "back" (mirrored or not) for the other two headings.
 */
function villager(
  tribe: TribeId,
  facing: "front" | "back",
  pose: VillagerPose,
  tunic: Tunic,
  tool?: Tool,
): Canvas {
  const c = new Canvas(32, 48);
  const ox = 4; // room on the left for hats and bandana tails
  const oy = 8; // and on top for raised tools and tall hats
  const P = (x: number, y: number, col: Rgba) => c.set(x + ox, y + oy, col);
  const R = (x: number, y: number, w: number, h: number, col: Rgba) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(x + i, y + j, col);
  };
  const front = facing === "front";
  const outfit = OUTFITS[tribe];
  const trio = (f: (k: number) => Rgba) => [f(0), f(1), f(2)] as const;
  const [tDark, tMid, tLight] = trio((k) => hexToRgba(outfit.tunics[tunic]![k]!));
  const [skinShade, skin, skinLight] = trio((k) => rampColor("skin", SKINS[tunic]![k]!));
  const [hairRamp, hairIdx] = HAIRS[tunic]!;
  const [hairDark, hair, hairLight] = trio((k) => rampColor(hairRamp, hairIdx[k]!));
  const ink = rampColor("outline", 0);
  const trousers = rampColor("timber", 2);
  const trousersLight = rampColor("timber", 3);
  const trousersDark = rampColor("timber", 1);
  const boots = rampColor("timber", 0);
  const bootsLight = rampColor("timber", 1);
  const stride = pose === "walk0" ? 1 : pose === "walk1" ? -1 : 0;

  // Legs: hips together, shins apart; walking swings the shins and boots.
  R(8, 27, 8, 3, trousers);
  R(8, 27, 1, 3, trousersLight);
  R(15, 27, 1, 3, trousersDark);
  const legs = [8 - 2 * stride, 13 + 2 * stride];
  for (const [i, x] of legs.entries()) {
    R(x, 30, 3, 3, trousers);
    P(i === 0 ? x : x + 2, 30, i === 0 ? trousersLight : trousersDark);
    P(i === 0 ? x : x + 2, 31, i === 0 ? trousersLight : trousersDark);
    // Boots, their toes pointing the way the villager faces.
    R(front ? x : x - 1, 33, 4, 3, boots);
    R(front ? x : x - 1, 33, 4, 1, bootsLight);
  }

  // Tunic, lit from the left, with a belt and a darker hem.
  R(7, 14, 10, 1, tMid);
  R(6, 15, 12, 12, tMid);
  R(6, 15, 2, 12, tLight);
  P(7, 14, tLight);
  R(16, 15, 2, 12, tDark);
  R(13, 17, 1, 5, tDark);
  R(9, 16, 1, 6, tLight);
  R(6, 26, 12, 1, tDark);
  R(6, 23, 12, 2, rampColor("apron", 0));
  R(6, 23, 12, 1, rampColor("apron", 1));
  if (front) {
    R(11, 23, 2, 2, rampColor("gold", 3));
    P(11, 23, rampColor("gold", 5));
    // An open collar.
    R(10, 14, 4, 1, skinShade);
    R(11, 15, 2, 1, skinShade);
    P(12, 16, tDark);
  } else {
    R(11, 15, 1, 8, tDark);
  }

  // Arms: the near (left) arm swings as they walk; the far arm swings the tool at work.
  const swing = stride * 2;
  R(4, 15, 2, 8 + swing, tLight);
  R(5, 15, 1, 8 + swing, tMid);
  P(4, 15, tMid);
  R(4, 23 + swing, 2, 2, skin);
  P(4, 23 + swing, skinLight);
  if (pose === "work0") {
    // Tool arm raised above the head.
    R(18, 8, 2, 8, tDark);
    P(18, 15, tMid);
    R(18, 6, 2, 2, skin);
  } else if (pose === "work1") {
    // Tool arm swung down and forward.
    R(18, 15, 2, 3, tDark);
    R(19, 17, 2, 2, tDark);
    R(21, 18, 2, 2, tDark);
    R(22, 20, 2, 2, skin);
  } else {
    R(18, 15, 2, 8 - swing, tDark);
    P(18, 15, tMid);
    R(18, 23 - swing, 2, 2, skinShade);
  }

  // Neck and head.
  R(10, 12, 4, 2, skinShade);
  R(9, 2, 6, 1, skin);
  R(8, 3, 8, 8, skin);
  R(9, 11, 6, 1, skin);
  if (front) {
    R(8, 5, 1, 6, skinLight);
    R(15, 5, 1, 6, skinShade);
    // Hair: a crown, a fringe and the back of the head, which faces the upper left.
    R(9, 2, 6, 1, hair);
    R(8, 3, 8, 2, hair);
    R(8, 5, 3, 3, hair);
    R(8, 8, 2, 2, hair);
    P(11, 5, hair);
    P(13, 5, hair);
    P(15, 5, hairDark);
    R(10, 3, 3, 1, hairLight);
    P(9, 4, hairLight);
    P(14, 3, hairLight);
    P(10, 8, skinShade); // ear
    P(10, 9, skinShade);
    // Face: eyes, brows, nose and mouth.
    P(12, 7, ink);
    P(14, 7, ink);
    P(12, 6, hairDark);
    P(14, 6, hairDark);
    P(15, 8, skinShade);
    R(13, 10, 2, 1, skinShade);
  } else {
    R(9, 2, 6, 1, hair);
    R(8, 3, 8, 8, hair);
    R(9, 11, 6, 1, hairDark);
    R(10, 3, 4, 1, hairLight);
    R(9, 4, 1, 3, hairLight);
    P(12, 5, hairLight);
    P(11, 7, hairDark);
    P(13, 9, hairDark);
    P(10, 10, hairDark);
    P(8, 7, skinShade); // ears
    P(15, 7, skinShade);
  }

  drawHat(outfit.hat, front, P, R, [tDark, tMid, tLight]);
  if (tool && (pose === "work0" || pose === "work1")) drawTool(tool, pose, P, R);
  outline(c, 0.32);
  return c;
}

type Plot = (x: number, y: number, col: Rgba) => void;
type Fill = (x: number, y: number, w: number, h: number, col: Rgba) => void;

/** Headwear over a head that spans x 8..15 and y 2..11. */
function drawHat(
  hat: Hat,
  front: boolean,
  P: Plot,
  R: Fill,
  [tDark, tMid, tLight]: [Rgba, Rgba, Rgba],
): void {
  switch (hat) {
    case "none":
      return;
    case "helmet": {
      const steel = rampColor("stone", 3);
      R(9, -1, 6, 1, steel);
      R(8, 0, 8, 4, steel);
      R(15, 0, 1, 4, rampColor("stone", 2));
      R(9, 0, 3, 2, rampColor("stone", 5));
      R(7, 4, 10, 1, rampColor("stone", 1));
      for (const x of [9, 12, 15]) P(x, 3, rampColor("stone", 1));
      // Curved horns.
      const horn = rampColor("plaster", 4);
      const hornShade = rampColor("plaster", 2);
      for (const [x, y] of [
        [7, 2],
        [6, 1],
        [5, 0],
        [5, -1],
        [5, -2],
        [6, -3],
      ] as const) {
        P(x, y, horn);
        P(23 - x, y, hornShade);
      }
      return;
    }
    case "wrap": {
      // A turban wound in bands, with a jewel at the front and a tail at the back.
      R(9, -1, 6, 1, tMid);
      R(8, 0, 8, 4, tMid);
      for (let y = -1; y < 4; y++)
        for (let x = 8; x < 16; x++) if ((x - y + 20) % 3 === 0) P(x, y, tLight);
      R(15, 0, 1, 4, tDark);
      R(8, 4, 8, 1, tDark);
      if (front) {
        P(13, 1, rampColor("gold", 4));
        P(13, 2, rampColor("gold", 2));
      } else {
        R(10, 5, 4, 5, tMid);
        R(10, 5, 1, 5, tLight);
        R(13, 5, 1, 5, tDark);
      }
      return;
    }
    case "hood": {
      R(8, 0, 8, 4, tMid);
      R(9, -1, 6, 1, tMid);
      R(11, -3, 2, 2, tLight);
      R(7, 1, 2, 11, tMid);
      R(15, 1, 2, 11, tDark);
      R(9, 0, 3, 1, tLight);
      if (!front) R(8, 3, 8, 9, tMid);
      return;
    }
    case "mushroom": {
      // A broad spotted cap with glowing flecks and pale gills underneath.
      const cap = rampColor("arcane", 3);
      R(9, -4, 6, 1, cap);
      R(7, -3, 10, 1, cap);
      R(5, -2, 14, 1, cap);
      R(4, -1, 16, 3, cap);
      R(6, -3, 5, 2, rampColor("arcane", 4));
      R(4, 1, 16, 1, rampColor("arcane", 2));
      R(5, 2, 14, 1, rampColor("stalk", 3));
      for (let x = 6; x < 18; x += 2) P(x, 2, rampColor("stalk", 5));
      const glow = rampColor("glow", 4);
      for (const [x, y] of [
        [8, -2],
        [13, -3],
        [16, -1],
        [6, 0],
        [11, 0],
      ] as const) {
        P(x, y, glow);
        P(x + 1, y, rampColor("glow", 5));
      }
      return;
    }
    case "bandana": {
      const band = rampColor("berry", 2);
      R(9, 1, 6, 1, band);
      R(8, 2, 8, 3, band);
      R(8, 2, 8, 1, rampColor("berry", 3));
      for (const [x, y] of [
        [10, 3],
        [13, 2],
        [15, 4],
      ] as const)
        P(x, y, rampColor("plaster", 4));
      // The knot and its tails behind the head.
      const kx = front ? 7 : 11;
      R(kx - 1, 4, 2, 2, band);
      P(kx - 2, 6, band);
      P(kx - 2, 7, rampColor("berry", 1));
      P(kx - 1, 7, band);
      P(kx - 1, 8, rampColor("berry", 1));
      return;
    }
    case "reed": {
      // A wide conical hat of woven reeds.
      const rows: [number, number][] = [
        [-4, 2],
        [-3, 4],
        [-2, 6],
        [-1, 8],
        [0, 10],
        [1, 12],
        [2, 16],
        [3, 20],
      ];
      for (const [y, w] of rows) {
        const x0 = 12 - w / 2;
        for (let x = x0; x < x0 + w; x++) {
          const weave = (x + y) % 2 === 0 ? 3 : 4;
          P(x, y, rampColor("thatch", x < 11 ? weave + 1 : weave));
        }
      }
      R(2, 4, 20, 1, rampColor("thatch", 1));
      return;
    }
    case "cap": {
      // A flat craftsman's cap with its peak towards the facing side.
      R(9, 0, 6, 1, tMid);
      R(8, 1, 8, 3, tMid);
      R(8, 1, 3, 1, tLight);
      R(8, 3, 8, 1, tDark);
      P(12, -1, tLight);
      if (front) R(13, 4, 5, 1, tDark);
      return;
    }
    case "cowl": {
      // A soot-dark cowl edged with glowing embers.
      const soot = rampColor("basalt", 2);
      const sootLight = rampColor("basalt", 4);
      R(9, -1, 6, 1, soot);
      R(8, 0, 8, 4, soot);
      R(7, 1, 2, 11, soot);
      R(15, 1, 2, 11, rampColor("basalt", 1));
      R(9, 0, 3, 1, sootLight);
      R(11, -3, 2, 2, soot);
      P(11, -3, rampColor("lava", 4));
      if (front) {
        // Embers glow along the brow and the edge of the cowl, not on the face.
        R(9, 4, 6, 1, rampColor("lava", 3));
        P(8, 6, rampColor("lava", 3));
        P(8, 9, rampColor("lava", 2));
      } else {
        R(8, 3, 8, 9, soot);
        R(11, 2, 2, 9, rampColor("lava", 2));
      }
      return;
    }
  }
}

/** A tool held high (work0) or swung down in front (work1). */
function drawTool(tool: Tool, pose: "work0" | "work1", P: Plot, R: Fill): void {
  const handle = rampColor("timber", 3);
  const handleDark = rampColor("timber", 2);
  const metal = rampColor("stone", 4);
  const shine = rampColor("stone", 5);
  const metalDark = rampColor("stone", 2);
  if (pose === "work0") {
    // The handle rises from the hand at (19, 6) up and to the right.
    for (const [x, y] of [
      [20, 5],
      [20, 4],
      [21, 3],
      [21, 2],
      [22, 1],
      [22, 0],
    ] as const) {
      P(x, y, handle);
      P(x + 1, y, handleDark);
    }
    if (tool === "axe") {
      R(23, -3, 3, 5, metal);
      R(25, -4, 2, 7, metal);
      R(26, -4, 1, 7, shine);
      R(23, 1, 3, 1, metalDark);
    }
    if (tool === "pick") {
      R(17, -1, 11, 2, metal);
      R(17, -1, 11, 1, shine);
      P(16, 0, metalDark);
      P(28, 0, metalDark);
    }
    if (tool === "hammer") {
      R(20, -3, 6, 4, metalDark);
      R(20, -3, 6, 1, metal);
      R(20, -3, 1, 4, shine);
    }
    if (tool === "hoe") {
      R(22, -2, 5, 2, metal);
      R(26, -2, 1, 4, metalDark);
      R(22, -2, 5, 1, shine);
    }
  } else {
    // The handle runs on from the hand at (23, 21) down and to the right.
    for (const [x, y] of [
      [24, 22],
      [25, 23],
      [25, 24],
      [26, 25],
    ] as const) {
      P(x, y, handle);
      P(x, y + 1, handleDark);
    }
    if (tool === "axe") {
      R(25, 26, 3, 4, metal);
      R(27, 25, 1, 6, shine);
    }
    if (tool === "pick") {
      R(22, 26, 2, 4, metal);
      R(26, 22, 2, 5, metal);
      R(24, 25, 3, 2, metalDark);
    }
    if (tool === "hammer") {
      R(25, 26, 4, 4, metalDark);
      R(25, 26, 4, 1, metal);
    }
    if (tool === "hoe") {
      R(26, 26, 2, 5, metal);
      R(26, 30, 3, 1, metalDark);
    }
  }
}

function villagerSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const tribe of TRIBES) {
    for (const tunic of TUNICS) {
      for (const facing of ["front", "back"] as const) {
        for (const pose of VILLAGER_POSES) {
          const tools: (Tool | undefined)[] = pose.startsWith("work") ? [...TOOLS] : [undefined];
          for (const tool of tools) {
            const name = `villager_${tribe}_${tunic}_${facing}_${pose}${tool ? `_${tool}` : ""}`;
            const canvas = villager(tribe, facing, pose, tunic, tool);
            out.push({ name, canvas, anchorX: 16, anchorY: 44, meta: { res: FIGURE_RES } });
          }
        }
      }
    }
  }
  return out;
}

type CarriedKind =
  | "wood"
  | "stone"
  | "food"
  | "ore"
  | "gold"
  | "crystal"
  | "sunstone"
  | "rimeglass"
  | "mirepearl"
  | "glowcap"
  | "hellstone";

/** A shaded lump: lit from the upper left, darker to the lower right. */
function lump(c: Canvas, cx: number, cy: number, rx: number, ry: number, ramp: RampName): void {
  const n = RAMPS[ramp].length;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const light = -dx * 0.6 - dy * 0.8;
      const k = light > 0.55 ? n - 1 : light > 0.1 ? n - 2 : light > -0.4 ? n - 3 : n - 4;
      c.set(x, y, rampColor(ramp, Math.max(0, k)));
    }
}

/**
 * Items carried above the head while hauling, drawn at the villagers' double resolution.
 * Anchor = top of the villager's head.
 */
function carried(kind: CarriedKind): Sprite {
  const c = new Canvas(24, 16);
  if (kind === "wood") {
    // Three logs, their cut ends showing rings.
    for (const [i, y] of [4, 8, 11].entries()) {
      const x0 = i === 2 ? 4 : 2;
      c.fill(x0, y, 18, 4, rampColor("timber", 2));
      c.fill(x0, y, 18, 1, rampColor("timber", 3));
      c.fill(x0, y + 3, 18, 1, rampColor("timber", 1));
      for (let x = x0 + 3; x < x0 + 17; x += 5) c.set(x, y + 1, rampColor("timber", 1));
      c.fill(x0 + 17, y, 3, 4, rampColor("wheat", 2));
      c.fill(x0 + 18, y + 1, 1, 2, rampColor("wheat", 4));
    }
  } else if (kind === "stone") {
    // A cut block, its top face lit.
    c.fill(5, 5, 14, 10, rampColor("stone", 2));
    c.fill(5, 5, 14, 3, rampColor("stone", 4));
    c.fill(5, 5, 3, 10, rampColor("stone", 3));
    c.fill(6, 5, 6, 1, rampColor("stone", 5));
    c.set(13, 10, rampColor("stone", 1));
    c.set(9, 12, rampColor("stone", 1));
  } else if (kind === "food") {
    // A basket of wheat, apples and berries.
    for (let x = 6; x < 18; x += 2) c.fill(x, 1, 1, 7, rampColor("wheat", 3));
    for (let x = 6; x < 18; x += 2) c.fill(x - 1, 0, 2, 2, rampColor("wheat", 4));
    lump(c, 9, 7, 3, 3, "fruit");
    lump(c, 15, 7, 2.5, 2.5, "berry");
    c.fill(3, 8, 18, 7, rampColor("plank", 3));
    c.fill(3, 8, 18, 2, rampColor("plank", 4));
    for (let x = 4; x < 21; x += 3) c.fill(x, 10, 1, 5, rampColor("plank", 2));
  } else {
    const ramp = {
      ore: "rock",
      gold: "gold",
      crystal: "crystalGround",
      sunstone: "sunflower",
      rimeglass: "ice",
      mirepearl: "swampGround",
      glowcap: "stalk",
      hellstone: "basalt",
    }[kind] as RampName;
    lump(c, 12, 10, 7.5, 5.5, ramp);
    if (kind === "ore") {
      for (const [x, y] of [
        [9, 8],
        [14, 11],
        [11, 13],
      ])
        c.fill(x!, y!, 2, 1, rampColor("fruit", 2));
    }
    if (kind === "gold")
      (c.fill(8, 7, 2, 1, rampColor("gold", 5)), c.set(14, 9, rampColor("gold", 5)));
    if (kind === "crystal")
      for (const [x, h] of [
        [8, 7],
        [11, 10],
        [14, 8],
      ]) {
        c.fill(x!, 11 - h!, 3, h!, rampColor("crystal", 4));
        c.fill(x!, 11 - h!, 1, h!, rampColor("crystal", 6));
      }
    if (kind === "sunstone" || kind === "rimeglass") {
      const gem = kind === "sunstone" ? "sunflower" : "ice";
      c.fill(10, 5, 4, 5, rampColor(gem, 4));
      c.fill(10, 5, 2, 2, rampColor(gem, 5));
    }
    if (kind === "mirepearl")
      (lump(c, 12, 8, 3.5, 3.5, "glow"), c.set(11, 6, rampColor("glow", 5)));
    if (kind === "glowcap")
      for (const [x, y] of [
        [8, 7],
        [13, 5],
        [16, 8],
      ])
        lump(c, x!, y!, 2.5, 2, "glow");
    if (kind === "hellstone")
      for (const [x, y] of [
        [8, 9],
        [10, 10],
        [13, 12],
        [15, 9],
      ])
        c.fill(x!, y!, 2, 1, rampColor("lava", 4));
  }
  outline(c, 0.35);
  return { name: `carry_${kind}`, canvas: c, anchorX: 12, anchorY: 16, meta: { res: FIGURE_RES } };
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
type ShipStyle = "scout" | "cargo" | "patrol" | "pirate";

function shipScene(heading: number, style: ShipStyle = "scout"): Scene {
  const cargo = style === "cargo";
  const pirate = style === "pirate";
  const patrol = style === "patrol";
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
      if (c.ln[2] > 0.8) return planks(pirate ? "darkwood" : "plank", "x", 0.07)(c);
      if (z < 3.5) return shade("hull", lit(c, 0.15), c.px, c.py, 0.2);
      if (z > hullTop - 1.2)
        return shade(
          pirate ? "darkwood" : patrol ? "slate" : "plank",
          lit(c, 0.15),
          c.px,
          c.py,
          0.2,
        );
      const k = (z / 2) % 1 < 0.3 ? -0.16 : 0;
      return shade(
        pirate ? "darkwood" : patrol ? "slate" : "timber",
        lit(c, 0.12 + k),
        c.px,
        c.py,
        0.2,
      );
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
    // Cargo crates: a scout carries a few, a freighter is stacked with them.
    const crate = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) =>
      s.box(
        [cx + x0, cy + y0, z0],
        [cx + x1, cy + y1, z1],
        crateMaterial([cx + x0, cy + y0, z0], [cx + x1, cy + y1, z1]),
      );
    if (patrol || pirate) {
      // Gun ports and cannons along both sides of the deck.
      for (const x of [-0.3, 0, 0.3]) {
        for (const side of [-1, 1]) {
          s.prism(
            "y",
            [cx + x, cy + side * (W - 0.02), hullTop + 2.5],
            0.05,
            0.16,
            flat("rock", -0.1),
            6,
          );
        }
      }
      s.box(
        [cx - 0.36, cy - 0.16, hullTop],
        [cx - 0.16, cy + 0.16, hullTop + 3],
        flat("plank", -0.1),
      );
    } else {
      crate(-0.34, -0.2, -0.12, 0.02, hullTop, hullTop + 5);
      crate(-0.34, 0.04, -0.14, 0.22, hullTop, hullTop + 4.5);
      crate(0.22, -0.16, 0.42, 0.06, hullTop, hullTop + 4.5);
      crate(-0.32, -0.17, -0.15, 0, hullTop + 5, hullTop + 9);
    }
    if (cargo) {
      crate(0.46, -0.2, 0.66, 0, hullTop, hullTop + 5);
      crate(0.46, 0.02, 0.64, 0.22, hullTop, hullTop + 4);
      crate(0.24, 0.1, 0.42, 0.26, hullTop, hullTop + 5);
      crate(0.5, -0.17, 0.66, -0.02, hullTop + 5, hullTop + 9);
      crate(-0.1, -0.22, 0.1, -0.06, hullTop, hullTop + 4);
    }
    // Mast, yard and sail.
    s.prism("z", [cx + 0.05, cy, hullTop + 22], 0.035, 22, flat("timber"), 6);
    s.prism("y", [cx + 0.08, cy, hullTop + 38], 0.02, 0.36, flat("timber"), 6);
    s.box(
      [cx + 0.1, cy - 0.34, hullTop + 12],
      [cx + 0.13, cy + 0.34, hullTop + 37],
      cloth(pirate ? "basalt" : patrol ? "cloth" : "sail"),
      {
        castsShadow: true,
      },
    );
    if (pirate) {
      // A pale skull-and-crossbones patch on the black sail.
      s.box(
        [cx + 0.13, cy - 0.1, hullTop + 22],
        [cx + 0.15, cy + 0.1, hullTop + 30],
        flat("stone", 0.25),
      );
    }
    // Pennant.
    s.box(
      [cx - 0.2, cy - 0.01, hullTop + 44],
      [cx + 0.05, cy + 0.01, hullTop + 47],
      flat("cloth", 0.15),
    );
  });
  return s;
}

function ship(heading: number, style: ShipStyle = "scout"): Sprite {
  const s = shipScene(heading, style);
  return renderSprite(`${style === "scout" ? "ship" : style}_${heading}`, s, 1, 1, 70, 40);
}

/** A half-sunk hull with a snapped mast, listing in the swell. */
function shipwreck(variant: number): Sprite {
  const s = new Scene();
  s.withYaw((variant * Math.PI) / 2 + 0.4, [0, 0], () => {
    const L = 0.85;
    const W = 0.28;
    const hull: Material = (c) =>
      c.ln[2] > 0.8
        ? planks("darkwood", "x", 0.07)(c)
        : shade("darkwood", lit(c, 0.05 + ((c.lp[2] / 2) % 1 < 0.3 ? -0.14 : 0)), c.px, c.py, 0.2);
    s.convex(
      [
        { n: [0, 0, -1], d: 0 },
        { n: [0, 0, 1], d: 5 / 19.6 },
        { n: [-1, 0, 0], d: L * 0.6 },
        { n: [0, 1, -0.25], d: W },
        { n: [0, -1, -0.25], d: W },
        { n: [0.6, 1, 0], d: 0.6 * L },
        { n: [0.6, -1, 0], d: 0.6 * L },
      ],
      hull,
    );
    // Broken ribs, the stump of the mast and a fallen yard.
    for (const x of [-0.35, -0.1, 0.15]) {
      s.box([x, -W * 0.9, 4], [x + 0.04, -W * 0.7, 9 + (x > 0 ? 0 : 3)], flat("timber", -0.1));
      s.box([x, W * 0.7, 4], [x + 0.04, W * 0.9, 8], flat("timber", -0.1));
    }
    s.prism("z", [0.05, 0, 12], 0.04, 8, flat("darkwood"), 6);
    s.prism("y", [-0.2, 0.05, 6], 0.025, 0.4, flat("timber"), 6);
    s.box([0.02, -0.16, 12], [0.06, 0.12, 20], cloth("basalt"));
  });
  return renderSprite(`wreck_ship_${variant}`, s, 1, 1, 40, 20);
}

/** Bones and a rusty cutlass on the sand. Drawn straight onto a tile-sized canvas. */
function bones(): Sprite {
  const c = new Canvas(26, 20);
  const bone = rampColor("plaster", 4);
  const boneShade = rampColor("plaster", 2);
  const steel = rampColor("rock", 4);
  const rust = rampColor("thatch", 2);
  // A ribcage of curved bones, a skull, and scattered long bones.
  for (let i = 0; i < 4; i++) {
    c.fill(9 + i * 2, 10 + (i % 2), 1, 4, i % 2 ? boneShade : bone);
    c.set(10 + i * 2, 10, bone);
  }
  c.fill(8, 14, 9, 1, boneShade);
  c.fill(4, 9, 4, 4, bone);
  c.fill(5, 8, 2, 1, bone);
  c.set(5, 10, rampColor("outline", 0));
  c.set(7, 10, rampColor("outline", 0));
  c.fill(5, 13, 2, 1, boneShade);
  c.fill(17, 11, 5, 1, bone);
  c.set(16, 10, bone);
  c.set(22, 12, bone);
  c.fill(12, 4, 8, 1, steel);
  c.set(20, 5, steel);
  c.fill(11, 4, 2, 2, rust);
  outline(c, 0.35);
  return { name: "wreck_bones", canvas: c, anchorX: 13, anchorY: 2 };
}

/** Sunken ruins seen through the water: toppled columns, or a fortress of walls and towers. */
function sunkenSite(kind: "ruin" | "fortress"): Sprite {
  const s = new Scene();
  const stone: Material = (c) => shade("stone", lit(c, 0.05), c.px, c.py, 0.25);
  const mossy: Material = (c) =>
    c.ln[2] > 0.5 ? shade("moss", lit(c, 0.05), c.px, c.py, 0.25) : stone(c);
  if (kind === "ruin") {
    s.prism("z", [0.3, 0.3, 8], 0.11, 8, stone, 8);
    s.prism("z", [0.72, 0.36, 4.5], 0.11, 4.5, stone, 8);
    s.prism("x", [0.55, 0.75, 4], 0.1, 0.7, stone, 8);
    s.box([0.15, 0.55, 0], [0.4, 0.85, 4], mossy);
    s.box([0.62, 0.05, 0], [0.9, 0.22, 3], stone);
    return renderSprite("site_ruin", s, 1, 1, 24, 8);
  }
  const wall = (x0: number, y0: number, x1: number, y1: number, h: number) =>
    s.box([x0, y0, 0], [x1, y1, h], mossy);
  wall(0.1, 0.1, 1.9, 0.3, 8);
  wall(0.1, 1.7, 1.9, 1.9, 8);
  wall(0.1, 0.3, 0.3, 1.7, 8);
  wall(1.7, 0.3, 1.9, 1.7, 5);
  for (const [x, y] of [
    [0.25, 0.25],
    [1.75, 0.25],
    [0.25, 1.75],
    [1.75, 1.75],
  ] as const) {
    s.prism("z", [x, y, 11], 0.22, 11, stone, 10);
    s.cone([x, y, 22], 0.27, 9, flat("slate", -0.05), 10);
  }
  s.box([0.8, 0.8, 0], [1.2, 1.2, 14], stone);
  s.cone([1, 1, 14], 0.36, 10, flat("slate", -0.05), 10);
  return renderSprite("site_fortress", s, 2, 2, 44, 10);
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
    icon("ore", (c) => {
      c.fill(2, 4, 10, 8, rampColor("rock", 2));
      c.fill(2, 4, 7, 4, rampColor("rock", 3));
      c.fill(3, 4, 3, 1, rampColor("rock", 5));
      for (const [x, y] of [
        [5, 6],
        [8, 8],
        [4, 9],
        [9, 5],
      ] as const)
        c.set(x, y, rampColor("fruit", 2));
    }),
    icon("tools", (c) => {
      for (let i = 0; i < 9; i++) c.set(3 + i, 12 - i, rampColor("timber", 3));
      for (let i = 0; i < 9; i++) c.set(3 + i, 3 + i, rampColor("timber", 2));
      c.fill(8, 1, 4, 3, rampColor("stone", 2));
      c.fill(8, 1, 4, 1, rampColor("stone", 4));
      c.fill(1, 1, 4, 2, rampColor("stone", 4));
    }),
    icon("gold", (c) => {
      for (let i = 0; i < 4; i++) {
        c.fill(2 + (i % 2), 9 - i * 2, 9, 2, rampColor("gold", 3 - (i % 2)));
        c.fill(2 + (i % 2), 9 - i * 2, 9, 1, rampColor("gold", 4));
      }
      c.set(5, 3, rampColor("gold", 5));
    }),
    icon("faith", (c) => {
      c.fill(6, 1, 2, 12, rampColor("wheat", 4));
      c.fill(3, 4, 8, 2, rampColor("wheat", 4));
      c.fill(6, 1, 1, 12, rampColor("wheat", 5));
      c.set(5, 0, rampColor("sunflower", 4));
      c.set(8, 0, rampColor("sunflower", 4));
    }),
    icon("crystal", (c) => {
      for (let y = 0; y < 12; y++) {
        const w = y < 4 ? y + 1 : Math.max(1, 12 - y);
        c.fill(7 - Math.floor(w / 2), y + 1, w, 1, rampColor("crystal", y < 4 ? 5 : 3));
      }
      c.set(6, 3, rampColor("crystal", 6));
    }),
    icon("sunstone", (c) => {
      // A faceted amber gem: a wide crown over a pointed pavilion.
      const widths = [4, 6, 8, 10, 10, 9, 8, 6, 5, 3, 2];
      widths.forEach((w, y) =>
        c.fill(
          7 - Math.floor(w / 2),
          y + 1,
          w,
          1,
          rampColor("sunflower", y < 4 ? 4 : y < 6 ? 3 : 2),
        ),
      );
      c.fill(4, 2, 3, 2, rampColor("sunflower", 5));
      c.fill(3, 4, 8, 1, rampColor("wheat", 2));
    }),
    icon("rimeglass", (c) => {
      // A pale, tall shard with a bright edge.
      for (let y = 0; y < 12; y++) {
        const w = y < 3 ? 2 : y < 9 ? 4 : 3;
        c.fill(7 - Math.floor(w / 2), y + 1, w, 1, rampColor("ice", y % 3 === 0 ? 5 : 4));
      }
      c.fill(6, 2, 1, 8, rampColor("snow", 5));
      c.fill(9, 5, 2, 5, rampColor("ice", 2));
    }),
    icon("mirepearl", (c) => {
      // A pearl with a bright glint, in a dark setting.
      c.fill(3, 8, 8, 4, rampColor("willow", 1));
      c.fill(4, 3, 6, 6, rampColor("glow", 3));
      c.fill(5, 2, 4, 8, rampColor("glow", 3));
      c.fill(5, 3, 2, 2, rampColor("glow", 5));
      c.set(9, 8, rampColor("glow", 1));
    }),
    icon("glowcap", (c) => {
      // A glowing mushroom cap on a pale stalk.
      c.fill(6, 6, 2, 6, rampColor("stalk", 4));
      c.fill(2, 3, 10, 4, rampColor("glow", 3));
      c.fill(4, 1, 6, 3, rampColor("glow", 4));
      c.fill(5, 2, 2, 1, rampColor("glow", 5));
      c.set(4, 5, rampColor("glow", 5));
      c.set(9, 4, rampColor("glow", 5));
    }),
    icon("hellstone", (c) => {
      // Black rock split by glowing cracks.
      c.fill(2, 5, 10, 7, rampColor("basalt", 2));
      c.fill(4, 2, 6, 4, rampColor("basalt", 3));
      c.fill(3, 5, 8, 2, rampColor("basalt", 4));
      for (const [x, y] of [
        [6, 3],
        [7, 4],
        [6, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [8, 9],
        [4, 9],
        [9, 6],
      ] as const)
        c.set(x, y, rampColor("lava", y < 6 ? 5 : 4));
      c.set(6, 8, rampColor("lava", 3));
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
    icon("relic", (c) => {
      c.fill(4, 10, 6, 2, rampColor("gold", 2));
      c.fill(5, 5, 4, 5, rampColor("crystal", 3));
      c.fill(6, 3, 2, 2, rampColor("crystal", 4));
      c.fill(5, 5, 1, 4, rampColor("crystal", 5));
      c.set(6, 1, rampColor("gold", 5));
      c.fill(3, 11, 8, 1, rampColor("gold", 3));
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
    carried("ore"),
    carried("gold"),
    carried("crystal"),
    carried("sunstone"),
    carried("rimeglass"),
    carried("mirepearl"),
    carried("glowcap"),
    carried("hellstone"),
    ...particles(),
    ...Array.from({ length: 8 }, (_, h) => ship(h)),
    ...Array.from({ length: 8 }, (_, h) => ship(h, "cargo")),
    ...Array.from({ length: 8 }, (_, h) => ship(h, "patrol")),
    ...Array.from({ length: 8 }, (_, h) => ship(h, "pirate")),
    shipwreck(0),
    shipwreck(1),
    bones(),
    sunkenSite("ruin"),
    sunkenSite("fortress"),
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

/**
 * Atmosphere particles, one small sprite per frame: embers, snowflakes, dust, spores, fireflies,
 * petals, leaves, ash and arcane motes. The client animates and fades them.
 */
function particles(): Sprite[] {
  const px = (name: string, pixels: [number, number, Rgba][]) => {
    const c = new Canvas(5, 5);
    for (const [x, y, col] of pixels) c.set(x, y, col);
    return { name: `p_${name}`, canvas: c, anchorX: 2, anchorY: 2 };
  };
  const a = (col: Rgba, alpha: number): Rgba => [col[0], col[1], col[2], alpha];
  const ember = rampColor("lava", 4);
  const emberHot = rampColor("lava", 5);
  const snow = rampColor("snow", 5);
  const dust = rampColor("dune", 4);
  const spore = rampColor("glow", 4);
  const fly = rampColor("sunflower", 4);
  const petal = rampColor("petal", 4);
  const leaf = rampColor("autumnLeaf", 4);
  const ash = rampColor("stone", 2);
  const mote = rampColor("crystal", 5);
  return [
    px("ember_0", [
      [2, 2, emberHot],
      [2, 3, a(ember, 160)],
    ]),
    px("ember_1", [
      [2, 2, ember],
      [1, 2, a(ember, 120)],
    ]),
    px("snow_0", [[2, 2, snow]]),
    px("snow_1", [
      [2, 2, snow],
      [1, 2, a(snow, 150)],
      [3, 2, a(snow, 150)],
      [2, 1, a(snow, 150)],
      [2, 3, a(snow, 150)],
    ]),
    px("dust_0", [[2, 2, a(dust, 200)]]),
    px("dust_1", [
      [2, 2, a(dust, 170)],
      [3, 2, a(dust, 120)],
    ]),
    px("spore_0", [
      [2, 2, spore],
      [2, 1, a(spore, 90)],
      [1, 2, a(spore, 90)],
      [3, 2, a(spore, 90)],
      [2, 3, a(spore, 90)],
    ]),
    px("spore_1", [[2, 2, a(spore, 200)]]),
    px("firefly_0", [
      [2, 2, fly],
      [1, 2, a(fly, 110)],
      [3, 2, a(fly, 110)],
      [2, 1, a(fly, 110)],
      [2, 3, a(fly, 110)],
    ]),
    px("firefly_1", [[2, 2, a(fly, 150)]]),
    px("petal_0", [
      [2, 2, petal],
      [3, 2, a(petal, 200)],
    ]),
    px("petal_1", [
      [2, 2, petal],
      [2, 3, a(petal, 200)],
    ]),
    px("leaf_0", [
      [2, 2, leaf],
      [3, 2, rampColor("autumnLeaf", 3)],
    ]),
    px("leaf_1", [
      [2, 2, leaf],
      [2, 3, rampColor("autumnLeaf", 2)],
    ]),
    px("ash_0", [[2, 2, a(ash, 200)]]),
    px("ash_1", [
      [2, 2, a(ash, 150)],
      [3, 3, a(ash, 100)],
    ]),
    px("mote_0", [
      [2, 2, mote],
      [1, 2, a(mote, 100)],
      [3, 2, a(mote, 100)],
      [2, 1, a(mote, 100)],
      [2, 3, a(mote, 100)],
    ]),
    px("mote_1", [[2, 2, rampColor("crystal", 6)]]),
  ];
}

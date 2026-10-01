// The players' characters. A hero is a stack of layers (prop, outfit, skin, scarf, gear, face,
// iris, hair, hat, rim) so the game can dress everyone differently without baking every
// combination: skin, hair, eyes and the scarf are drawn in greys and multiplied by a colour when
// shown, while clothes, hats and held things keep their own colours. All layers of a figure share
// one canvas size and anchor, so they line up when stacked.
//
// Figures are drawn directly in texels (two per world pixel), feet on the origin with y going up
// as a negative number. "front" faces the viewer's lower right (+x); the client mirrors it for +y,
// and uses "back" (mirrored or not) for the other two headings, as it does for villagers.
import { BUILDS, CHARACTER_CLASSES, HERO_FRAME, type CharacterClass } from "@explorer/shared";
import { Canvas } from "../canvas";
import { hexToRgba, type Rgba } from "../palette";
import type { Sprite } from "../sprite";
import { trimmed } from "../sprite";

const HERO_POSES = ["stand", "walk0", "walk1"] as const;
export type HeroPose = (typeof HERO_POSES)[number];
const HERO_RES = 2;
export const HERO_LAYERS = [
  "prop",
  "outfit",
  "skin",
  "scarf",
  "gear",
  "face",
  "iris",
  "hair",
  "hat",
  "rim",
] as const;
export type HeroLayer = (typeof HERO_LAYERS)[number];

const W = HERO_FRAME.width;
const H = HERO_FRAME.height;
const AX = HERO_FRAME.anchorX;
const AY = HERO_FRAME.anchorY;

type Trio = readonly [Rgba, Rgba, Rgba];
const rgb = (hex: string): Rgba => hexToRgba(hex);
const trio = (dark: string, mid: string, light: string): Trio => [rgb(dark), rgb(mid), rgb(light)];
const grey = (v: number): Rgba => [v, v, v, 255];

// Greys for the tinted layers: the tint multiplies them, so the brightest is a touch above the
// colour's own tone, and shading only ever darkens.
const SKIN = { hi: 255, base: 240, shade: 200, dark: 152 };
const HAIR = { hi: 255, base: 236, shade: 190, dark: 138 };

const INK = rgb("#1b1a1f");
const GOLD = trio("#a8761e", "#e0b040", "#f8e080");
const WOOD = trio("#4a2f1c", "#7a4e2c", "#a87444");
const STEEL = trio("#525a6a", "#8e98aa", "#ccd4e2");
const LEATHER = trio("#3e2a1a", "#6b4726", "#94683a");

interface Build {
  /** Half the torso's width. */
  hw: number;
  arm: number;
  leg: number;
}
const BUILD_SHAPES: Build[] = [
  { hw: 4, arm: 2, leg: 2 },
  { hw: 6, arm: 3, leg: 3 },
  { hw: 8, arm: 3, leg: 4 },
];

class Figure {
  readonly layers = {} as Record<HeroLayer, Canvas>;

  constructor() {
    for (const l of HERO_LAYERS) this.layers[l] = new Canvas(W, H);
  }

  r(layer: HeroLayer, x: number, y: number, w: number, h: number, col: Rgba): void {
    const c = this.layers[layer];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(AX + x + i, AY + y + j, col);
  }

  p(layer: HeroLayer, x: number, y: number, col: Rgba): void {
    this.r(layer, x, y, 1, 1, col);
  }

  /** A filled ellipse around (cx, cy). */
  disc(layer: HeroLayer, cx: number, cy: number, rx: number, ry: number, col: Rgba): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.p(layer, x, y, col);
      }
  }

  /** A line of square dots `w` wide. */
  line(
    layer: HeroLayer,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w: number,
    col: Rgba,
  ): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++)
      this.r(
        layer,
        Math.round(x0 + ((x1 - x0) * i) / n),
        Math.round(y0 + ((y1 - y0) * i) / n),
        w,
        w,
        col,
      );
  }

  /** A block lit from the left: light edge, dark edge and a mid-tone in between. */
  block(layer: HeroLayer, x: number, y: number, w: number, h: number, t: Trio): void {
    this.r(layer, x, y, w, h, t[1]);
    const edge = w >= 5 ? 2 : 1;
    this.r(layer, x, y, edge, h, t[2]);
    this.r(layer, x + w - edge, y, edge, h, t[0]);
  }
}

// ---------------------------------------------------------------------------------------------
// The head (shared by every class)

/** Left and right edge of each row of the head, top to bottom: y -36 .. -22. */
const HEAD: [number, number][] = [
  [-5, 4],
  [-7, 6],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-8, 7],
  [-7, 6],
  [-6, 5],
  [-4, 3],
];
const HEAD_TOP = -36;
const headRow = (y: number): [number, number] => HEAD[y - HEAD_TOP] ?? [0, -1];

function skinHead(f: Figure, front: boolean): void {
  for (let y = HEAD_TOP; y < HEAD_TOP + HEAD.length; y++) {
    const [x0, x1] = headRow(y);
    f.r("skin", x0, y, x1 - x0 + 1, 1, grey(SKIN.base));
    f.r("skin", x0, y, 2, 1, grey(SKIN.hi));
    f.r("skin", x1 - 1, y, 2, 1, grey(SKIN.shade));
    if (y >= -24) f.r("skin", x0, y, x1 - x0 + 1, 1, grey(SKIN.shade));
  }
  // The chin and jaw catch the light a little.
  f.r("skin", -3, -25, 4, 1, grey(SKIN.base));
  // A neck.
  f.r("skin", -2, -22, 4, 3, grey(SKIN.shade));
  if (front) {
    f.p("skin", 8, -27, grey(SKIN.base)); // the nose
    f.p("skin", 8, -26, grey(SKIN.shade));
    f.r("skin", 4, -26, 3, 1, grey(SKIN.base));
  } else {
    f.r("skin", -9, -29, 1, 3, grey(SKIN.shade)); // ears
    f.r("skin", 8, -29, 1, 3, grey(SKIN.shade));
  }
}

function face(f: Figure): void {
  for (const ex of [-2, 3]) {
    f.r("face", ex, -30, 3, 1, rgb("#2a1f22")); // lashes
    f.r("face", ex, -29, 1, 2, rgb("#f6f3ea")); // the white of the eye
    f.r("iris", ex + 1, -29, 2, 2, grey(235));
    f.p("iris", ex + 2, -29, grey(120)); // pupil
    f.p("iris", ex + 1, -29, grey(255));
  }
  f.r("face", 3, -25, 2, 1, rgb("#b0524a")); // a mouth
  f.p("face", 2, -26, [226, 130, 130, 110]);
  f.p("face", 6, -26, [226, 130, 130, 110]);
}

function hair(f: Figure, front: boolean): void {
  const H2 = (x: number, y: number, w: number, h: number, v: number) =>
    f.r("hair", x, y, w, h, grey(v));
  if (front) {
    for (let y = -36; y <= -33; y++) {
      const [x0, x1] = headRow(y);
      H2(x0, y, x1 - x0 + 1, 1, HAIR.base);
    }
    H2(-8, -32, 5, 1, HAIR.base);
    H2(-3, -32, 1, 1, HAIR.shade); // fringe
    H2(1, -32, 1, 1, HAIR.base);
    H2(6, -32, 2, 1, HAIR.base);
    H2(-2, -32, 3, 1, HAIR.dark); // brows
    H2(3, -32, 3, 1, HAIR.dark);
    H2(-8, -31, 3, 8, HAIR.base); // the back of the head, which faces the upper left
    H2(-8, -23, 3, 1, HAIR.shade);
    H2(-7, -22, 4, 3, HAIR.base);
    H2(6, -31, 2, 3, HAIR.base); // sideburn
    // Light and shadow in the hair.
    H2(-6, -35, 6, 1, HAIR.hi);
    H2(-8, -33, 1, 8, HAIR.hi);
    H2(-4, -34, 1, 1, HAIR.shade);
    H2(2, -35, 1, 2, HAIR.shade);
    H2(5, -34, 2, 1, HAIR.shade);
    H2(-6, -29, 1, 5, HAIR.shade);
    H2(-4, -21, 1, 2, HAIR.shade);
  } else {
    for (let y = -36; y <= -23; y++) {
      const [x0, x1] = headRow(y);
      H2(x0, y, x1 - x0 + 1, 1, HAIR.base);
    }
    H2(-6, -22, 10, 3, HAIR.base);
    H2(-6, -36, 7, 1, HAIR.hi);
    H2(-8, -34, 2, 9, HAIR.hi);
    H2(6, -34, 2, 11, HAIR.shade);
    H2(-1, -34, 1, 10, HAIR.shade);
    H2(3, -33, 1, 8, HAIR.shade);
    H2(-4, -30, 1, 7, HAIR.shade);
    H2(-5, -22, 10, 1, HAIR.shade);
    H2(-3, -20, 1, 1, HAIR.shade);
  }
}

// ---------------------------------------------------------------------------------------------
// Bodies

interface Stance {
  stride: number;
  /** Where the hands hang (y of the top of the hand), left and right. */
  leftHand: number;
  rightHand: number;
}

type Garment = "robe" | "tunic" | "armor" | "fur";
interface ClassArt {
  garment: Garment;
  main: Trio;
  /** Trousers (or the robe's lining). */
  legs: Trio;
  boots: Trio;
  trim: Trio;
  belt: Trio;
  /** The right arm is held still on this (a staff, a sword). */
  holdsRight: boolean;
  holdsLeft: boolean;
  bareArms?: boolean;
}

const ART: Record<CharacterClass, ClassArt> = {
  mage: {
    garment: "robe",
    main: trio("#252a6e", "#3a43a6", "#5e6fd6"),
    legs: trio("#1c1f55", "#2b317f", "#4450b0"),
    boots: LEATHER,
    trim: GOLD,
    belt: trio("#3e2a1a", "#6b4726", "#94683a"),
    holdsRight: true,
    holdsLeft: false,
  },
  thief: {
    garment: "tunic",
    main: trio("#22292a", "#37444a", "#566a72"),
    legs: trio("#1c2122", "#2a3336", "#434f54"),
    boots: trio("#171a1c", "#262b2e", "#3c4348"),
    trim: LEATHER,
    belt: trio("#3e2a1a", "#6b4726", "#94683a"),
    holdsRight: true,
    holdsLeft: false,
  },
  knight: {
    garment: "armor",
    main: STEEL,
    legs: trio("#3c4350", "#626c7c", "#98a2b4"),
    boots: trio("#3c4350", "#626c7c", "#98a2b4"),
    trim: GOLD,
    belt: LEATHER,
    holdsRight: true,
    holdsLeft: true,
  },
  archer: {
    garment: "tunic",
    main: trio("#2a5224", "#3f7d34", "#6cae4c"),
    legs: trio("#4a3524", "#6b4d34", "#8e6a48"),
    boots: LEATHER,
    trim: LEATHER,
    belt: LEATHER,
    holdsRight: true,
    holdsLeft: false,
  },
  cleric: {
    garment: "robe",
    main: trio("#b4ab98", "#ebe4d2", "#fffbef"),
    legs: trio("#9c927c", "#d2c9b2", "#f0e8d2"),
    boots: LEATHER,
    trim: GOLD,
    belt: trio("#a8761e", "#e0b040", "#f8e080"),
    holdsRight: true,
    holdsLeft: false,
  },
  barbarian: {
    garment: "fur",
    main: trio("#4e321e", "#7e5232", "#b07e4a"),
    legs: trio("#3c2a1a", "#5e4228", "#86603a"),
    boots: LEATHER,
    trim: STEEL,
    belt: LEATHER,
    holdsRight: true,
    holdsLeft: false,
    bareArms: true,
  },
  bard: {
    garment: "tunic",
    main: trio("#8a2448", "#c23a66", "#ea6e92"),
    legs: trio("#1f5a66", "#2f8291", "#56aab8"),
    boots: trio("#3a2418", "#5e3c26", "#86583a"),
    trim: GOLD,
    belt: GOLD,
    holdsRight: true,
    holdsLeft: true,
  },
  druid: {
    garment: "robe",
    main: trio("#34451e", "#55752e", "#86a84c"),
    legs: trio("#2a3818", "#44602a", "#6a8a3c"),
    boots: WOOD,
    trim: WOOD,
    belt: WOOD,
    holdsRight: true,
    holdsLeft: false,
  },
};

function stanceFor(art: ClassArt, pose: HeroPose): Stance {
  const stride = pose === "walk0" ? 1 : pose === "walk1" ? -1 : 0;
  return {
    stride,
    leftHand: art.holdsLeft ? -11 : -10 + stride * 2,
    rightHand: art.holdsRight ? -12 : -10 - stride * 2,
  };
}

/** The x of the hand's outside edge for each arm, from a build. */
const armX = (b: Build) => ({ left: -b.hw - b.arm + 1, right: b.hw - 1 });

function legs(f: Figure, art: ClassArt, b: Build, st: Stance, front: boolean): void {
  const hem = art.garment === "robe" ? -3 : art.garment === "armor" ? -10 : -9;
  for (const side of [0, 1]) {
    const shift = side === 0 ? -2 * st.stride : 2 * st.stride;
    const x0 = (side === 0 ? -1 - b.leg : 1) + shift;
    // Trousers or greaves down to the boot.
    if (art.garment !== "robe") f.block("outfit", x0, hem, b.leg, -4 - hem, art.legs);
    // A boot whose toe points the way the hero faces.
    const bx = front ? x0 : x0 - 1;
    f.block("outfit", bx, -4, b.leg + 1, 4, art.boots);
    f.r("outfit", bx, -4, b.leg + 1, 1, art.boots[2]);
    f.r("outfit", bx, -1, b.leg + 1, 1, art.boots[0]);
  }
}

function arms(f: Figure, art: ClassArt, b: Build, st: Stance, front: boolean): void {
  const ax = armX(b);
  const drawArm = (x0: number, handY: number, hold: boolean) => {
    const w = b.arm;
    if (art.bareArms) {
      f.block("skin", x0, -20, w, handY + 20, [grey(SKIN.shade), grey(SKIN.base), grey(SKIN.hi)]);
      // A bracer at the wrist.
      f.block("gear", x0, handY - 3, w, 3, art.trim);
    } else {
      const flare = art.garment === "robe" ? 1 : 0;
      f.block("outfit", x0 - flare, -20, w + flare * 2, handY + 20 + flare, art.main);
      f.r("outfit", x0 - flare, handY + flare + 0, w + flare * 2, 1, art.trim[1]);
      if (art.garment === "armor") {
        f.block("outfit", x0, -20, w, handY + 20, art.main);
      }
    }
    // The hand.
    const hw = Math.max(w, 2);
    f.r("skin", x0, handY, hw, 3, grey(SKIN.base));
    f.r("skin", x0, handY, 1, 3, grey(SKIN.hi));
    f.r("skin", x0 + hw - 1, handY + 1, 1, 2, grey(SKIN.shade));
    void hold;
  };
  drawArm(ax.left, st.leftHand, art.holdsLeft);
  drawArm(ax.right, st.rightHand, art.holdsRight);
  void front;
}

function torso(f: Figure, art: ClassArt, b: Build, front: boolean): void {
  const { hw } = b;
  switch (art.garment) {
    case "robe": {
      // A long robe that flares towards the hem.
      for (let y = -21; y <= -4; y++) {
        const flare = y > -12 ? Math.min(2, Math.floor((y + 12) / 3) + 1) : 0;
        const x0 = -hw - flare + (y === -21 ? 1 : 0);
        const w = hw * 2 + flare * 2 - (y === -21 ? 2 : 0);
        f.r("outfit", x0, y, w, 1, art.main[1]);
        f.r("outfit", x0, y, 2, 1, art.main[2]);
        f.r("outfit", x0 + w - 2, y, 2, 1, art.main[0]);
      }
      f.r("outfit", -hw - 2, -4, hw * 2 + 4, 1, art.trim[1]); // hem
      f.r("outfit", -hw - 2, -3, hw * 2 + 4, 1, art.trim[0]);
      f.r("outfit", -hw - 1, -5, hw * 2 + 2, 1, art.main[0]);
      if (front) {
        f.r("outfit", 1, -12, 1, 8, art.main[0]); // the front seam
        f.r("outfit", 1, -21, 1, 3, art.trim[1]);
      }
      break;
    }
    case "tunic": {
      f.block("outfit", -hw, -21, hw * 2, 12, art.main);
      f.r("outfit", -hw + 1, -21, hw * 2 - 2, 1, art.main[2]);
      // The skirt, cut a little wider than the waist.
      f.block("outfit", -hw - 1, -10, hw * 2 + 2, 3, art.main);
      f.r("outfit", -hw - 1, -8, hw * 2 + 2, 1, art.main[0]);
      if (front) f.r("outfit", 1, -19, 1, 9, art.main[0]);
      break;
    }
    case "armor": {
      f.block("outfit", -hw, -21, hw * 2, 11, art.main);
      f.r("outfit", -hw + 1, -21, hw * 2 - 2, 1, STEEL[2]);
      // A tabard over the breastplate, and plates hanging from the belt.
      const tab = trio("#6e1c24", "#a4323a", "#d05a60");
      f.block("outfit", -3, -19, 7, 11, tab);
      f.r("outfit", -3, -9, 7, 1, art.trim[1]);
      f.block("outfit", -hw, -10, hw * 2, 3, art.legs);
      f.r("outfit", -hw, -8, hw * 2, 1, art.legs[0]);
      break;
    }
    case "fur": {
      f.block("outfit", -hw, -21, hw * 2, 10, art.main);
      for (let x = -hw; x < hw; x++) {
        f.r("outfit", x, -11, 1, x % 2 === 0 ? 2 : 1, art.main[x % 3 === 0 ? 0 : 1]);
      }
      f.r("outfit", -hw + 1, -21, hw * 2 - 2, 1, art.main[2]);
      // Shaggy fur on the shoulders.
      f.r("outfit", -hw - 1, -21, 3, 3, art.main[2]);
      f.r("outfit", hw - 2, -21, 3, 3, art.main[0]);
      // A fur kilt over leather trousers.
      f.block("outfit", -hw, -9, hw * 2, 3, art.main);
      for (let x = -hw; x < hw; x++)
        f.r("outfit", x, -6, 1, x % 2 === 0 ? 2 : 1, art.main[x % 2 === 0 ? 0 : 1]);
      break;
    }
  }
  // The belt.
  const beltY = art.garment === "robe" ? -13 : art.garment === "fur" ? -12 : -11;
  if (art.garment !== "armor") {
    f.r("outfit", -hw, beltY, hw * 2, 2, art.belt[1]);
    f.r("outfit", -hw, beltY, hw * 2, 1, art.belt[2]);
    if (front) {
      f.r("outfit", 0, beltY - 1, 3, 3, GOLD[1]);
      f.p("outfit", 0, beltY - 1, GOLD[2]);
    }
  } else {
    f.r("outfit", -hw, -10, hw * 2, 1, LEATHER[1]);
  }
  if (!front) {
    // From behind there are no seams or buckles, just the fall of the cloth.
    f.r("outfit", -1, -19, 1, 5, art.main[0]);
  }
}

function shoulders(f: Figure, art: ClassArt, b: Build): void {
  const { hw } = b;
  if (art.garment === "armor") {
    // Round steel pauldrons over the shoulders.
    for (const [cx, dark] of [
      [-hw - 1, false],
      [hw, true],
    ] as const) {
      f.disc("outfit", cx, -19, 3.4, 2.8, STEEL[1]);
      f.disc("outfit", cx - (dark ? 0 : 1), -20, 2, 1.4, STEEL[2]);
      if (dark) f.r("outfit", cx, -18, 3, 2, STEEL[0]);
    }
  }
  if (art.garment === "robe" && art === ART.druid) {
    // A mantle of leaves over the shoulders.
    for (let i = 0; i < hw * 2 + 2; i++) {
      const x = -hw - 1 + i;
      f.r("outfit", x, -21, 1, 3 + (i % 2), WOODLEAF[i % 3]!);
    }
  }
}
const WOODLEAF = [rgb("#3f6a2a"), rgb("#5a8c38"), rgb("#7cae4a")] as const;

function scarf(f: Figure, b: Build, st: Stance, front: boolean): void {
  const { hw } = b;
  const S = (x: number, y: number, w: number, h: number, v: number) =>
    f.r("scarf", x, y, w, h, grey(v));
  S(-hw + 1, -22, hw * 2 - 2, 2, 226);
  S(-hw + 1, -22, hw * 2 - 2, 1, 255);
  S(hw - 3, -21, 2, 1, 160);
  const sway = st.stride;
  if (front) {
    // A tail streaming out behind the shoulder.
    S(-hw - 1, -21, 2, 4, 210);
    S(-hw - 2 - sway, -17, 2, 4, 190);
    S(-hw - 3 - sway * 2, -13, 2, 3, 165);
    S(-hw - 1, -21, 1, 4, 255);
  } else {
    S(-2 + sway, -20, 4, 4, 215);
    S(-2 + sway, -16, 4, 4, 190);
    S(-1 + sway * 2, -12, 3, 3, 165);
    S(-2 + sway, -20, 1, 8, 250);
  }
}

// ---------------------------------------------------------------------------------------------
// Headwear

const HAT_BLUE = trio("#1f2468", "#323b9a", "#5668d0");
const FEATHER_RED = trio("#8a1c24", "#c8343c", "#f0707a");
const LEAF = WOODLEAF;

function hat(f: Figure, cls: CharacterClass, front: boolean): void {
  const hp = (x: number, y: number, w: number, h: number, c: Rgba) => f.r("hat", x, y, w, h, c);
  switch (cls) {
    case "mage": {
      // A wide brim, a tall cone that bends over at the tip, and a gold band with a star.
      f.block("hat", -12, -33, 24, 2, HAT_BLUE);
      hp(-11, -34, 22, 1, HAT_BLUE[2]);
      hp(-10, -32, 20, 1, HAT_BLUE[0]);
      hp(-12, -32, 3, 1, HAT_BLUE[1]);
      const rows = 20;
      for (let i = 0; i < rows; i++) {
        const y = -35 - i;
        const half = Math.max(1, Math.round(6.4 - i * 0.28));
        const bend = i > 9 ? Math.round((i - 9) * 0.45) : 0;
        f.block("hat", bend - half, y, half * 2, 1, HAT_BLUE);
      }
      // The tip flops to the right.
      f.r("hat", 4, -54, 3, 2, HAT_BLUE[1]);
      f.r("hat", 6, -53, 3, 2, HAT_BLUE[0]);
      f.r("hat", 8, -51, 2, 2, HAT_BLUE[0]);
      f.r("hat", -6, -37, 13, 2, GOLD[1]);
      f.r("hat", -6, -37, 13, 1, GOLD[2]);
      f.r("hat", 0, -38, 3, 4, GOLD[0]);
      f.p("hat", 1, -37, GOLD[2]);
      if (front) {
        // A star and a small moon on the cone.
        for (const [x, y] of [
          [-1, -45],
          [-2, -44],
          [0, -44],
          [-1, -43],
          [-1, -44],
        ] as const)
          f.p("hat", x, y, rgb("#fff6c8"));
        f.p("hat", 3, -41, rgb("#f4e4a0"));
        f.p("hat", -4, -48, rgb("#f4e4a0"));
      }
      break;
    }
    case "thief": {
      const hood = trio("#1b2122", "#2b373b", "#46585e");
      // A hood drawn up over the head, with the face in a dark opening.
      for (let y = -38; y <= -22; y++) {
        const [x0, x1] = y < HEAD_TOP ? [-5, 4] : headRow(y);
        const left = x0 - 1;
        const right = y < -32 ? x1 + 1 : x1;
        if (front) {
          f.r("hat", left, y, 4, 1, hood[1]); // the back of the hood
          f.r("hat", left, y, 1, 1, hood[2]);
          if (y < -32) f.r("hat", left + 4, y, right - left - 3, 1, hood[1]);
          else f.r("hat", right, y, 2, 1, hood[0]);
        } else {
          f.r("hat", left, y, right - left + 2, 1, hood[1]);
          f.r("hat", left, y, 2, 1, hood[2]);
          f.r("hat", right - 1, y, 3, 1, hood[0]);
        }
      }
      f.r("hat", -2, -40, 5, 2, hood[1]);
      f.r("hat", 0, -41, 3, 1, hood[0]);
      f.r("hat", -4, -34, 11, 1, hood[0]);
      if (front) {
        // A cloth mask over the lower face.
        f.block("hat", -4, -26, 12, 4, hood);
        f.r("hat", -4, -26, 12, 1, hood[0]);
        f.r("hat", -5, -34, 1, 12, hood[0]);
      }
      break;
    }
    case "knight": {
      // An open helm with a nasal bar and a red plume.
      const y0 = -37;
      for (let y = y0; y <= -31; y++) {
        const [x0, x1] = y < HEAD_TOP ? [-5, 4] : headRow(y);
        f.block("hat", x0 - 1, y, x1 - x0 + 3, 1, STEEL);
      }
      f.r("hat", -9, -31, 4, 8, STEEL[1]); // cheek and neck guard behind
      f.r("hat", -9, -31, 1, 8, STEEL[2]);
      f.r("hat", -6, -31, 1, 8, STEEL[0]);
      f.r("hat", -9, -32, 18, 1, STEEL[0]);
      if (front) {
        f.r("hat", 1, -32, 2, 6, STEEL[1]); // nasal
        f.p("hat", 1, -32, STEEL[2]);
        f.r("hat", 7, -34, 2, 4, STEEL[0]);
      } else {
        for (let y = -31; y <= -23; y++) {
          const [x0, x1] = headRow(y);
          f.r("hat", x0 - 1, y, x1 - x0 + 3, 1, y % 4 === 0 ? STEEL[0] : STEEL[1]);
        }
        f.r("hat", -9, -31, 2, 8, STEEL[2]);
      }
      f.r("hat", -6, -38, 11, 1, STEEL[2]);
      // The plume.
      const pl = FEATHER_RED;
      f.r("hat", -6, -41, 10, 3, pl[1]);
      f.r("hat", -7, -40, 4, 6, pl[1]);
      f.r("hat", -8, -36, 3, 6, pl[0]);
      f.r("hat", -5, -42, 7, 1, pl[2]);
      f.r("hat", -3, -39, 2, 1, pl[2]);
      break;
    }
    case "archer": {
      const cap = trio("#2a5224", "#3f7d34", "#6cae4c");
      for (let y = -38; y <= -33; y++) {
        const [x0, x1] = y < HEAD_TOP ? [-5, 4] : headRow(y);
        f.block("hat", x0 - 1, y, x1 - x0 + 3, 1, cap);
      }
      f.r("hat", -9, -34, 18, 2, cap[1]);
      f.r("hat", -9, -34, 18, 1, cap[2]);
      if (front) f.r("hat", 4, -35, 6, 2, cap[0]); // the brim turned up at the front
      f.r("hat", -4, -40, 8, 2, cap[1]);
      // A long feather.
      f.line("hat", 3, -38, 10, -47, 2, FEATHER_RED[1]);
      f.line("hat", 4, -38, 11, -47, 1, FEATHER_RED[2]);
      f.line("hat", 2, -38, 9, -46, 1, FEATHER_RED[0]);
      break;
    }
    case "cleric": {
      // A tall white mitre with a gold band and cross.
      const mitre = trio("#b4ab98", "#ebe4d2", "#fffbef");
      for (let i = 0; i < 14; i++) {
        const y = -35 - i;
        const half = Math.max(2, Math.round(6.4 - i * 0.3));
        f.block("hat", -half, y, half * 2, 1, mitre);
      }
      f.r("hat", 0, -48, 1, 2, mitre[0]);
      f.r("hat", -7, -37, 14, 3, GOLD[1]);
      f.r("hat", -7, -37, 14, 1, GOLD[2]);
      f.r("hat", -7, -35, 14, 1, GOLD[0]);
      if (front) {
        f.r("hat", -1, -47, 2, 7, GOLD[1]);
        f.r("hat", -3, -44, 6, 2, GOLD[1]);
        f.p("hat", -1, -47, GOLD[2]);
      }
      break;
    }
    case "barbarian": {
      // An iron cap with a fur band and two bone horns.
      for (let y = -38; y <= -33; y++) {
        const [x0, x1] = y < HEAD_TOP ? [-5, 4] : headRow(y);
        f.block("hat", x0 - 1, y, x1 - x0 + 3, 1, STEEL);
      }
      f.r("hat", -9, -34, 18, 2, WOOD[1]);
      for (let x = -9; x < 9; x++)
        f.r("hat", x, -34, 1, x % 2 === 0 ? 3 : 2, WOOD[x % 3 === 0 ? 0 : 2]);
      const bone = trio("#b8a98a", "#e8dcc0", "#fff8e8");
      for (const side of [-1, 1] as const) {
        const x = side < 0 ? -11 : 8;
        f.r("hat", x, -38, 3, 4, bone[1]);
        f.r("hat", x + side, -41, 3, 4, bone[1]);
        f.r("hat", x + side * 2, -44, 3, 4, bone[side < 0 ? 2 : 0]);
        f.r("hat", x + side * 2, -47, 2, 3, bone[1]);
        f.p("hat", x + side * 2, -48, bone[2]);
        f.r("hat", x, -38, 1, 4, bone[2]);
      }
      f.r("hat", -5, -39, 10, 1, STEEL[2]);
      break;
    }
    case "bard": {
      // A floppy beret with a long white feather.
      const b = trio("#8a2448", "#c23a66", "#ea6e92");
      f.disc("hat", 0, -36, 10.5, 3.6, b[1]);
      f.disc("hat", -2, -37, 7, 2.4, b[2]);
      f.r("hat", 3, -35, 7, 2, b[0]);
      f.r("hat", -8, -34, 16, 1, b[0]);
      f.disc("hat", -2, -40, 4.6, 2.2, b[1]);
      f.r("hat", -5, -41, 4, 1, b[2]);
      f.line("hat", 5, -37, 13, -46, 2, rgb("#f6f3ea"));
      f.line("hat", 5, -37, 12, -45, 1, rgb("#c8c4b8"));
      f.line("hat", 7, -37, 14, -45, 1, rgb("#ffffff"));
      break;
    }
    case "druid": {
      // A wreath of leaves and berries, with small antlers.
      for (let x = -9; x <= 8; x++) {
        const y = -34 - (x > -6 && x < 5 ? 1 : 0);
        f.r("hat", x, y, 1, 3, LEAF[(x + 9) % 3]!);
        if (x % 3 === 0) f.p("hat", x, y - 1, LEAF[2]);
      }
      for (const [x, y] of [
        [-3, -36],
        [2, -36],
        [6, -34],
      ] as const)
        f.r("hat", x, y, 2, 2, rgb("#c8343c"));
      const horn = WOOD;
      f.line("hat", -4, -36, -8, -46, 2, horn[1]);
      f.line("hat", -6, -41, -10, -43, 1, horn[2]);
      f.line("hat", -7, -44, -4, -48, 1, horn[2]);
      f.line("hat", 2, -36, 5, -46, 2, horn[1]);
      f.line("hat", 4, -41, 8, -42, 1, horn[2]);
      f.line("hat", 4, -45, 1, -49, 1, horn[2]);
      break;
    }
  }
  void front;
}

// ---------------------------------------------------------------------------------------------
// Held things: `prop` is drawn behind the clothes, `gear` over them

function things(f: Figure, cls: CharacterClass, b: Build, st: Stance, front: boolean): void {
  const ax = armX(b);
  const gx = ax.right + b.arm; // just right of the right hand
  const pr = (x: number, y: number, w: number, h: number, c: Rgba) => f.r("prop", x, y, w, h, c);
  const ge = (x: number, y: number, w: number, h: number, c: Rgba) => f.r("gear", x, y, w, h, c);
  switch (cls) {
    case "mage": {
      // A tall staff with a glowing orb in a gold claw.
      pr(gx - 1, -46, 2, 48, WOOD[1]);
      pr(gx - 1, -46, 1, 48, WOOD[2]);
      pr(gx, -46, 1, 48, WOOD[0]);
      f.disc("prop", gx, -51, 4, 4, rgb("#f08a20"));
      f.disc("prop", gx - 0.5, -51.5, 3, 3, rgb("#ffc840"));
      f.disc("prop", gx - 1, -52, 1.6, 1.6, rgb("#fff8c0"));
      pr(gx - 3, -47, 6, 1, GOLD[1]);
      pr(gx - 3, -48, 1, 2, GOLD[2]);
      pr(gx + 2, -48, 1, 2, GOLD[0]);
      // Sparks.
      for (const [x, y] of [
        [gx - 6, -56],
        [gx + 5, -55],
        [gx + 6, -49],
        [gx - 5, -47],
      ] as const)
        pr(x, y, 1, 1, rgb("#ffe070"));
      break;
    }
    case "thief": {
      // A dagger held point down by the leg.
      pr(gx - 1, -10, 2, 9, STEEL[1]);
      pr(gx - 1, -10, 1, 9, STEEL[2]);
      pr(gx, -4, 1, 4, STEEL[0]);
      pr(gx - 2, -11, 4, 1, GOLD[1]);
      pr(gx - 1, -13, 2, 2, LEATHER[1]);
      break;
    }
    case "knight": {
      // A sword held point up, and a round shield on the other arm.
      pr(gx - 1, -38, 2, 26, STEEL[1]);
      pr(gx - 1, -38, 1, 26, STEEL[2]);
      pr(gx, -38, 1, 26, STEEL[0]);
      pr(gx - 1, -40, 2, 2, STEEL[2]);
      pr(gx - 4, -13, 8, 2, GOLD[1]);
      pr(gx - 4, -13, 8, 1, GOLD[2]);
      pr(gx - 1, -11, 2, 4, LEATHER[1]);
      pr(gx - 2, -7, 4, 2, GOLD[1]);
      const cx = ax.left - 1;
      f.disc("gear", cx, -13, 6, 6.6, STEEL[1]);
      f.disc("gear", cx, -13, 4.6, 5.2, trio("#20307a", "#3048b0", "#5870d8")[1]);
      f.disc("gear", cx - 1, -14, 2.4, 2.6, trio("#20307a", "#3048b0", "#5870d8")[2]);
      ge(cx - 1, -16, 2, 7, GOLD[1]);
      ge(cx - 3, -14, 6, 2, GOLD[1]);
      ge(cx - 6, -16, 1, 6, STEEL[2]);
      break;
    }
    case "archer": {
      // A bow in the hand, a quiver on the back and a strap across the chest.
      for (let i = 0; i <= 30; i++) {
        const y = -30 + i;
        const bulge = Math.round(4 * Math.sin((Math.PI * i) / 30));
        pr(gx + 1 + bulge, y, 2, 1, WOOD[i < 15 ? 1 : 2]);
      }
      pr(gx + 1, -30, 1, 31, rgb("#e8e4d4"));
      pr(ax.left - 2, -30, 4, 12, LEATHER[1]);
      pr(ax.left - 2, -30, 1, 12, LEATHER[2]);
      pr(ax.left - 1, -34, 1, 5, FEATHER_RED[1]);
      pr(ax.left + 1, -33, 1, 4, rgb("#f6f3ea"));
      pr(ax.left, -35, 1, 2, FEATHER_RED[2]);
      for (let i = 0; i < 12; i++) ge(-b.hw + 1 + i, -20 + i, 2, 1, LEATHER[i < 6 ? 1 : 0]);
      break;
    }
    case "cleric": {
      // A flanged mace, and a golden sun on the chest.
      pr(gx - 1, -26, 2, 26, WOOD[1]);
      pr(gx - 1, -26, 1, 26, WOOD[2]);
      f.disc("prop", gx, -29, 3.2, 3.2, GOLD[1]);
      f.disc("prop", gx - 1, -30, 1.8, 1.8, GOLD[2]);
      pr(gx - 1, -34, 2, 2, GOLD[2]);
      pr(gx - 5, -30, 2, 2, GOLD[1]);
      pr(gx + 3, -30, 2, 2, GOLD[0]);
      ge(-1, -19, 2, 7, GOLD[1]);
      ge(-3, -17, 6, 2, GOLD[1]);
      ge(-1, -19, 1, 7, GOLD[2]);
      break;
    }
    case "barbarian": {
      // A huge axe on a long haft.
      pr(gx - 1, -40, 2, 42, WOOD[1]);
      pr(gx - 1, -40, 1, 42, WOOD[2]);
      pr(gx, -40, 1, 42, WOOD[0]);
      const blade = [
        [-42, 3],
        [-41, 5],
        [-40, 7],
        [-39, 8],
        [-38, 8],
        [-37, 8],
        [-36, 7],
        [-35, 6],
        [-34, 4],
        [-33, 2],
      ] as const;
      for (const [y, w] of blade) {
        pr(gx + 1, y, w, 1, STEEL[1]);
        pr(gx + 1, y, 2, 1, STEEL[2]);
        pr(gx + w - 1, y, 2, 1, STEEL[0]);
      }
      pr(gx + 1, -39, 1, 4, STEEL[2]);
      break;
    }
    case "bard": {
      // A lute held across the body.
      f.disc("gear", 1.5, -10, 6, 5.6, WOOD[1]);
      f.disc("gear", 0.5, -11, 4.6, 4.2, WOOD[2]);
      f.disc("gear", 2, -10, 1.8, 1.8, rgb("#1e130c"));
      f.line("gear", -1, -14, -8, -25, 2, WOOD[0]);
      f.line("gear", -2, -14, -9, -25, 1, WOOD[2]);
      ge(-11, -29, 4, 4, WOOD[0]);
      ge(-11, -29, 4, 1, WOOD[2]);
      f.p("gear", -12, -28, GOLD[1]);
      f.p("gear", -7, -30, GOLD[1]);
      ge(-4, -14, 10, 1, WOOD[0]);
      break;
    }
    case "druid": {
      // A crooked staff topped with leaves and a glowing seed.
      pr(gx - 1, -44, 2, 46, WOOD[1]);
      pr(gx - 1, -44, 1, 46, WOOD[2]);
      pr(gx, -44, 1, 46, WOOD[0]);
      pr(gx + 1, -46, 3, 2, WOOD[1]);
      pr(gx + 3, -45, 2, 3, WOOD[0]);
      f.disc("prop", gx - 3, -47, 3, 2, LEAF[1]);
      f.disc("prop", gx - 3, -48, 2, 1.2, LEAF[2]);
      f.disc("prop", gx + 1, -51, 2.6, 2, LEAF[2]);
      f.disc("prop", gx + 4, -43, 2, 2, rgb("#7af0a0"));
      f.p("prop", gx + 3, -44, rgb("#eafff0"));
      break;
    }
  }
  void st;
  void front;
}

// ---------------------------------------------------------------------------------------------

/** Darken the silhouette's edge (as the world's other figures do) where the stack has pixels. */
function rim(f: Figure): void {
  const union = new Canvas(W, H);
  for (const l of HERO_LAYERS) {
    if (l === "rim") continue;
    const c = f.layers[l];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (c.alpha(x, y) >= 200) union.set(x, y, [0, 0, 0, 255]);
  }
  const out = f.layers.rim;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (union.alpha(x, y) === 0) continue;
      const edge =
        union.alpha(x - 1, y) === 0 ||
        union.alpha(x + 1, y) === 0 ||
        union.alpha(x, y - 1) === 0 ||
        union.alpha(x, y + 1) === 0;
      if (edge) out.set(x, y, [INK[0], INK[1], INK[2], 140]);
    }
}

function figure(cls: CharacterClass, build: number, front: boolean, pose: HeroPose): Figure {
  const f = new Figure();
  const art = ART[cls];
  const b = BUILD_SHAPES[build]!;
  const st = stanceFor(art, pose);
  legs(f, art, b, st, front);
  torso(f, art, b, front);
  shoulders(f, art, b);
  arms(f, art, b, st, front);
  scarf(f, b, st, front);
  skinHead(f, front);
  if (front) face(f);
  hair(f, front);
  hat(f, cls, front);
  things(f, cls, b, st, front);
  rim(f);
  return f;
}

const facingName = (front: boolean) => (front ? "front" : "back");

/** Every frame of every hero: per class, build, facing and pose. */
export function heroSprites(): Sprite[] {
  const out: Sprite[] = [];
  const emit = (name: string, canvas: Canvas) => {
    if (!canvas.bounds()) return;
    out.push(trimmed(name, canvas, AX, AY, { res: HERO_RES }));
  };
  const seen = new Set<string>();
  const once = (name: string, canvas: Canvas) => {
    if (seen.has(name)) return;
    seen.add(name);
    emit(name, canvas);
  };
  for (const cls of CHARACTER_CLASSES) {
    for (let build = 0; build < BUILDS.length; build++) {
      for (const front of [true, false]) {
        for (const pose of HERO_POSES) {
          const f = figure(cls, build, front, pose);
          const dir = facingName(front);
          const key = `${cls}_${build}_${dir}`;
          emit(`hero_outfit_${key}_${pose}`, f.layers.outfit);
          emit(`hero_skin_${key}_${pose}`, f.layers.skin);
          emit(`hero_rim_${key}_${pose}`, f.layers.rim);
          once(`hero_scarf_${build}_${dir}_${pose}`, f.layers.scarf);
          // Props and gear don't move with the pose.
          if (pose === "stand") {
            emit(`hero_prop_${key}`, f.layers.prop);
            emit(`hero_gear_${key}`, f.layers.gear);
            once(`hero_hat_${cls}_${dir}`, f.layers.hat);
            once(`hero_hair_${dir}`, f.layers.hair);
            once(`hero_face_${dir}`, f.layers.face);
            once(`hero_iris_${dir}`, f.layers.iris);
          }
        }
      }
    }
  }
  return out;
}

/** One figure with every layer, for the contact sheet tool. */
export function heroFigure(
  cls: CharacterClass,
  build: number,
  front: boolean,
  pose: HeroPose,
): Record<HeroLayer, Canvas> {
  return figure(cls, build, front, pose).layers;
}

export const HERO_CANVAS = { width: W, height: H, anchorX: AX, anchorY: AY };

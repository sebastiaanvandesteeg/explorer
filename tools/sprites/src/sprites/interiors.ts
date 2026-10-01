// Inside the buildings: floors, walls, doorways and banners, in each tribe's architecture, drawn
// with the same ray-caster, palette ramps and materials as the buildings outside. Furniture is in
// furniture.ts. A room is assembled from these pieces by the client (see `roomPieces` in
// @explorer/shared, which also names them).
//
// - Floors are single tiles (no outlines, so they join up): planks in the tribe's wood, or
//   flagstones in its stone. The column along the left wall comes in three shadow classes, rendered
//   with the wall in the scene so the game's own cast shadow falls on the floor.
// - Walls are rendered once per tribe as a long L-shaped master (so shading, outlines and the
//   shadow in the corner are continuous) and sliced into one-tile-wide columns.
// - The floor's thickness along its two front edges is sliced the same way from a strip.
import {
  FLOOR_KEYS,
  HALF_H,
  HALF_W,
  ROOM_SLAB_PX,
  ROOM_WALL_PX,
  SLAB_VARIANTS,
  TRIBES,
  doorSprite,
  floorSprite,
  furnitureSprite,
  matSprite,
  slabSprite,
  wallSprite,
  type FloorKey,
  type FloorStyle,
  type TribeId,
  type WallKind,
} from "@explorer/shared";
import type { Canvas } from "../canvas";
import { FINE, faceOf, flagstones, planks, solid, type Opening } from "../materials";
import { hash3 } from "../noise3";
import { rampColor, shade, type RampName } from "../palette";
import { flat, lit, Scene, type Material } from "../raytrace";
import { renderSprite, SPRITE_RES, trimmed, type Sprite } from "../sprite";
import { STYLES, withLights } from "./buildings";
import { furnitureSprites } from "./furniture";

const RES = SPRITE_RES;
/** Height of the back walls in pixels, their thickness in tiles, and the floor slab's depth. */
export const WALL = ROOM_WALL_PX;
const THICK = 0.22;
const SLAB = ROOM_SLAB_PX;
/** Boards exactly 1/16 of a tile wide, so they line up from one floor tile to the next. */
const BOARD_PITCH = 1 / 16 / FINE;

/** What the floors are made of for each tribe: planks in one of its woods, flags in its stone. */
const FLOOR_LOOK: Record<TribeId, { wood: RampName; stone: RampName }> = {
  islanders: { wood: "plank", stone: "stone" },
  northfolk: { wood: "darkwood", stone: "stone" },
  sunfolk: { wood: "plank", stone: "sandstone" },
  sylvan: { wood: "bark", stone: "rock" },
  glowkin: { wood: "stalk", stone: "fungalGround" },
  freebooters: { wood: "plank", stone: "rock" },
  mirefolk: { wood: "logs", stone: "swampGround" },
  amberwrights: { wood: "plank", stone: "sandstone" },
  cinderborn: { wood: "charred", stone: "obsidian" },
};

/** Dark flags with a scatter of arcane sparks, for the magic house. */
function arcaneFlags(): Material {
  const base = flagstones("crystalGround", 0.5);
  return (c) => {
    if (faceOf(c) === "top") {
      const k = hash3(Math.floor(c.lp[0] * 26), Math.floor(c.lp[1] * 26), 0, 81);
      if (k > 0.992) return rampColor("arcane", 5);
      if (k > 0.984) return rampColor("arcane", 3);
    }
    return base(c);
  };
}

function floorMaterial(style: FloorStyle, tribe: TribeId): Material {
  if (style === "boards") return planks(FLOOR_LOOK[tribe].wood, "x", BOARD_PITCH);
  if (style === "flags") return flagstones(FLOOR_LOOK[tribe].stone);
  return arcaneFlags();
}

/** A material seen as if the floor were moved by whole tiles: tiles differ but still line up. */
function shifted(m: Material, dx: number, dy: number): Material {
  return (c) =>
    m({
      ...c,
      lp: [c.lp[0] + dx, c.lp[1] + dy, c.lp[2]],
      p: [c.p[0] + dx, c.p[1] + dy, c.p[2]],
    });
}

const SHIFT: Record<FloorKey, [number, number]> = {
  0: [0, 0],
  1: [3, 5],
  2: [7, 2],
  3: [11, 9],
  s0: [2, 7],
  s1: [5, 3],
  s2: [9, 6],
};

/** How far along the left wall, in tiles from the tile's own back corner, the wall still runs. */
const WALL_REACH: Record<"s0" | "s1" | "s2", number> = { s0: 12, s1: 2, s2: 1 };

/** Keep only the pixels whose centres lie on the tile's diamond (the wall and the slab's sides go). */
function maskTile(canvas: Canvas, ax: number, ay: number): void {
  for (let py = 0; py < canvas.height; py++) {
    for (let px = 0; px < canvas.width; px++) {
      const a = (px + 0.5 - ax) / RES / HALF_W;
      const b = (py + 0.5 - ay) / RES / HALF_H;
      const x = (a + b) / 2;
      const y = (b - a) / 2;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) canvas.set(px, py, [0, 0, 0, 0]);
    }
  }
}

function floorTile(name: string, material: Material, key: FloorKey): Sprite {
  const [dx, dy] = SHIFT[key];
  const s = new Scene();
  s.box([0, 0, -2], [1, 1, 0], shifted(material, dx, dy), { castsShadow: false });
  if (typeof key === "string") {
    // The left wall, casting its shadow over the tile's column of floor.
    const reach = WALL_REACH[key as "s0" | "s1" | "s2"];
    s.box([-THICK, -12, 0], [0, reach, WALL], solid([0, 0, 0, 255]));
  }
  const W = 36;
  const H = 26;
  const ax = 18 * RES;
  const ay = 5 * RES;
  const canvas = s.render(W * RES, H * RES, ax, ay, {
    outlines: false,
    depthEdges: false,
    scale: RES,
  });
  maskTile(canvas, ax, ay);
  return trimmed(name, canvas, ax, ay, { res: RES });
}

// ---------------------------------------------------------------------------------------------
// Walls and the floor's edge

/** The wall master's columns, in order: the vocabulary every room's walls are made of. */
const MASTER: readonly WallKind[] = [
  "start",
  "plain0",
  "window0",
  "plain1",
  "window1",
  "plain2",
  "end",
];
const NCOL = MASTER.length;

interface Strip {
  canvas: Canvas;
  /** World origin in texels. */
  ax: number;
  ay: number;
}

function renderStrip(
  scene: Scene,
  ext: { left: number; right: number; top: number; bottom: number },
): Strip {
  const ax = -ext.left;
  const ay = -ext.top;
  const canvas = scene.render(
    (ext.right - ext.left) * RES,
    (ext.bottom - ext.top) * RES,
    ax * RES,
    ay * RES,
    { scale: RES },
  );
  return { canvas, ax: ax * RES, ay: ay * RES };
}

function cut(
  strip: Strip,
  x0: number,
  x1: number,
  anchorX: number,
  anchorY: number,
  name: string,
): Sprite {
  return trimmed(
    name,
    strip.canvas.crop(x0, 0, x1 - x0, strip.canvas.height),
    anchorX - x0,
    anchorY,
    {
      res: RES,
    },
  );
}

/** One tile along a wall is this many texels wide on screen. */
const COL = HALF_W * RES;
/** How far past a wall's last column its end face and outline reach. */
const END = Math.ceil(THICK * HALF_W * RES) + 4;

function wallSprites(tribe: TribeId): Sprite[] {
  const st = STYLES[tribe];
  const openings: Opening[] = [];
  MASTER.forEach((kind, i) => {
    if (!kind.startsWith("window")) return;
    for (const face of ["+x", "+y"] as const)
      openings.push({
        face,
        u0: i + 0.26,
        u1: i + 0.74,
        z0: 18,
        z1: 35,
        kind: "lit-window",
      });
  });
  const posts = Array.from({ length: NCOL + 1 }, (_, i) => i);
  const mat = st.wall(WALL, openings, posts);
  const s = new Scene();
  // The back-right wall runs along x (its inner face looks towards +y), the back-left along y.
  s.box([-THICK, -THICK, 0], [NCOL, 0, WALL], mat);
  s.box([-THICK, 0, 0], [0, NCOL, WALL], mat);
  const cap = st.trim;
  s.box([-THICK - 0.03, -THICK - 0.03, WALL], [NCOL + 0.03, 0.03, WALL + 2], cap);
  s.box([-THICK - 0.03, 0.03, WALL], [0.03, NCOL + 0.03, WALL + 2], cap);
  const strip = renderStrip(s, {
    left: -(NCOL * HALF_W + 12),
    right: NCOL * HALF_W + 12,
    top: -(WALL + 14),
    bottom: NCOL * HALF_H + 8,
  });
  const out: Sprite[] = [];
  MASTER.forEach((kind, i) => {
    const last = i === NCOL - 1;
    // Back-right wall: column i covers world x from i to i+1 on the plane y = 0.
    const x0 = strip.ax + COL * i;
    out.push(
      cut(
        strip,
        x0,
        x0 + COL + (last ? END : 0),
        x0,
        strip.ay + HALF_H * RES * i,
        wallSprite("x", tribe, kind),
      ),
    );
    // Back-left wall: column j covers world y from j to j+1 on the plane x = 0, going left.
    const x1 = strip.ax - COL * i;
    out.push(
      cut(
        strip,
        x1 - COL - (last ? END : 0),
        x1,
        x1,
        strip.ay + HALF_H * RES * i,
        wallSprite("y", tribe, kind),
      ),
    );
  });
  return out;
}

const SLAB_COLS = 4;

/** The floor's thickness along its front edges: columns from two strips of the tribe's footing. */
function slabSprites(tribe: TribeId): Sprite[] {
  const st = STYLES[tribe];
  const out: Sprite[] = [];
  // The edge running along x (seen from the front-left): a face on the plane y = 0.
  {
    const s = new Scene();
    s.box([0, -0.05, -SLAB], [SLAB_COLS, 0, 0], st.base);
    const strip = renderStrip(s, {
      left: -8,
      right: SLAB_COLS * HALF_W + 8,
      top: -6,
      bottom: SLAB + SLAB_COLS * HALF_H + 6,
    });
    for (let v = 0; v < SLAB_VARIANTS; v++) {
      const x0 = strip.ax + COL * (v + 1);
      out.push(
        cut(strip, x0, x0 + COL, x0, strip.ay + HALF_H * RES * (v + 1), slabSprite("x", tribe, v)),
      );
    }
  }
  // The edge running along y (seen from the front-right): a face on the plane x = 0, going left.
  {
    const s = new Scene();
    s.box([-0.05, 0, -SLAB], [0, SLAB_COLS, 0], st.base);
    const strip = renderStrip(s, {
      left: -(SLAB_COLS * HALF_W + 8),
      right: 8,
      top: -6,
      bottom: SLAB + SLAB_COLS * HALF_H + 6,
    });
    for (let v = 0; v < SLAB_VARIANTS; v++) {
      const x1 = strip.ax - COL * (v + 1);
      out.push(
        cut(strip, x1 - COL, x1, x1, strip.ay + HALF_H * RES * (v + 1), slabSprite("y", tribe, v)),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The doorway, the mat and the banners

/** Posts and a lintel at the front edge, with a lantern on a chain; the room has no front wall. */
function doorFrame(tribe: TribeId): Sprite {
  const st = STYLES[tribe];
  const s = new Scene();
  const post = planks(st.wood, "z", 0.09);
  s.box([0.03, 0.88, 0], [0.2, 1.08, 40], post);
  s.box([0.8, 0.88, 0], [0.97, 1.08, 40], post);
  s.box([0.03, 0.88, 35], [0.97, 1.08, 42], planks(st.wood, "x", 0.08));
  s.box([0.05, 0.9, 0], [0.95, 1.1, 1.6], st.base);
  s.prism("z", [0.5, 1.0, 32.5], 0.012, 3, flat("rock", 0.1), 4);
  s.box([0.45, 0.95, 24], [0.55, 1.05, 30], () => rampColor("glass", 3));
  s.box([0.44, 0.94, 30], [0.56, 1.06, 31.5], flat("rock", 0.1));
  s.box([0.44, 0.94, 23], [0.56, 1.06, 24], flat("rock", 0.1));
  return withLights(renderSprite(doorSprite(tribe), s, 1, 1, 46, 8));
}

/** A woven mat on the door tile. */
function doorMat(): Sprite {
  const s = new Scene();
  const weave: Material = (c) => {
    const stripe = Math.floor(c.lp[1] * 12) % 2 === 0 ? 0.06 : -0.05;
    const edge = Math.min(c.lp[0], 1 - c.lp[0], c.lp[1], 1 - c.lp[1]) < 0.14 ? -0.12 : 0;
    return shade("thatch", lit(c, -0.05 + stripe + edge), c.px, c.py, 0.25);
  };
  s.box([0.1, 0.12, 0], [0.9, 0.88, 0.8], weave, { castsShadow: false });
  return renderSprite(matSprite(), s, 1, 1, 4, 4, undefined, {
    outlines: false,
    depthEdges: false,
  });
}

/** A tall banner on a stand, in the tribe's colours (see `banner` in buildings for the flag). */
function banner(tribe: TribeId): Sprite {
  const st = STYLES[tribe];
  const s = new Scene();
  s.groundShadow = { x0: 0, y0: 0, x1: 1.6, y1: 1 };
  s.prism("z", [0.5, 0.5, 2], 0.14, 2, flat("rock", 0.05), 8);
  s.prism("z", [0.5, 0.5, 24], 0.022, 24, st.trim, 6);
  s.box([0.14, 0.47, 42], [0.86, 0.53, 45], st.trim);
  s.prism("y", [0.14, 0.5, 43.5], 0.04, 0.05, flat("gold", 0.2), 6);
  s.prism("y", [0.86, 0.5, 43.5], 0.04, 0.05, flat("gold", 0.2), 6);
  const cloth: Material = (c) => {
    const u = c.lp[0];
    const z = c.lp[2];
    if (z < 17) return shade("gold", lit(c, 0.05), c.px, c.py, 0.2);
    // A simple device: a lozenge in the accent colour.
    const d = Math.abs(u - 0.5) / 0.22 + Math.abs(z - 31) / 9;
    const ramp = d < 1 ? st.accent : st.banner;
    const wave = Math.sin(u * 14 + z * 0.15) * 0.05;
    return shade(ramp, lit(c, 0.05 + wave), c.px, c.py, 0.25);
  };
  s.box([0.17, 0.485, 14], [0.83, 0.515, 42], cloth);
  return renderSprite(
    furnitureSprite("town_hall", { kind: "banner", x: 0, y: 0, w: 1, h: 1 }, tribe),
    s,
    1,
    1,
    48,
    8,
  );
}

export function interiorSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (const tribe of TRIBES) {
    for (const style of ["boards", "flags"] as const)
      for (const key of FLOOR_KEYS)
        out.push(floorTile(floorSprite(style, tribe, key), floorMaterial(style, tribe), key));
    out.push(...wallSprites(tribe), ...slabSprites(tribe), doorFrame(tribe), banner(tribe));
  }
  for (const key of FLOOR_KEYS)
    out.push(
      floorTile(floorSprite("arcane", "islanders", key), floorMaterial("arcane", "islanders"), key),
    );
  out.push(doorMat(), ...furnitureSprites());
  return out;
}

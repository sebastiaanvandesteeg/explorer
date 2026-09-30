// Inside a building: a small furnished room on a black background. The furniture comes from the
// shared room definitions (so everyone agrees where it stands) and is drawn here as shaded
// isometric boxes; the NPC and every player in the building are the usual sprites.
import {
  BUILDINGS,
  HALF_H,
  HALF_W,
  ROOMS,
  npcName,
  type BuildingEntity,
  type BuildingKind,
  type CharacterEntity,
  type Furniture,
  type GameState,
  type NpcRole,
  type RoomDef,
  type TribeId,
} from "@explorer/shared";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Atlas } from "../assets";
import { heroCapeSprite, heroSprite, villagerSprite } from "./names";

const WALL = 38;
const SLAB = 8;

interface Palette {
  floorA: number;
  floorB: number;
  wall: number;
  trim: number;
  glow: number;
}

const PALETTES: Partial<Record<BuildingKind, Palette>> = {
  house: { floorA: 0x7a5432, floorB: 0x6d4a2b, wall: 0x54402d, trim: 0x8a5f33, glow: 0xffc266 },
  town_hall: { floorA: 0x6c6258, floorB: 0x5f564d, wall: 0x4a4a52, trim: 0xc9a13a, glow: 0xffd27a },
  market: { floorA: 0x7d6238, floorB: 0x705631, wall: 0x5c4a33, trim: 0xc8552f, glow: 0xffc266 },
  blacksmith: {
    floorA: 0x4d4a48,
    floorB: 0x423f3e,
    wall: 0x35322f,
    trim: 0x6d5a52,
    glow: 0xff7a2f,
  },
  church: { floorA: 0x85847f, floorB: 0x777671, wall: 0x5d5e68, trim: 0xe4d9a0, glow: 0xfff0b0 },
  magic_house: {
    floorA: 0x443a5e,
    floorB: 0x3b3254,
    wall: 0x2f2946,
    trim: 0x8f7af0,
    glow: 0xa58cff,
  },
  great_work: {
    floorA: 0x7e755f,
    floorB: 0x6f6753,
    wall: 0x54503f,
    trim: 0xd6b34a,
    glow: 0xffe08a,
  },
  dock: { floorA: 0x6a5a45, floorB: 0x5d4e3b, wall: 0x3f4d52, trim: 0x3c8f94, glow: 0xffd27a },
};

interface Shade {
  top: number;
  front: number;
  side: number;
}

const shade = (base: number): Shade => {
  const mul = (k: number) =>
    (Math.min(255, Math.round(((base >> 16) & 255) * k)) << 16) |
    (Math.min(255, Math.round(((base >> 8) & 255) * k)) << 8) |
    Math.min(255, Math.round((base & 255) * k));
  return { top: mul(1.15), front: mul(0.88), side: mul(0.68) };
};

const WOOD = shade(0xa8763f);
const DARK_WOOD = shade(0x6b4a2b);
const STONE = shade(0x8d9096);
const DARK_STONE = shade(0x4a4c52);
const CLOTH_RED = shade(0xb23a3a);
const CLOTH_BLUE = shade(0x3d5fa8);
const CLOTH_CREAM = shade(0xe6d8b0);
const IRON = shade(0x3b3d44);
const GOLD = shade(0xd9b338);

const px = (x: number, y: number, z = 0): [number, number] => [
  (x - y) * HALF_W,
  (x + y) * HALF_H - z,
];

/** An isometric box over tile area (x, y, w, h), from height z0 to z1. */
function box(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  z0: number,
  z1: number,
  c: Shade,
): void {
  const flat = (...pts: [number, number][]) => pts.flat();
  g.poly(flat(px(x, y + h, z1), px(x + w, y + h, z1), px(x + w, y + h, z0), px(x, y + h, z0))).fill(
    c.front,
  );
  g.poly(flat(px(x + w, y, z1), px(x + w, y + h, z1), px(x + w, y + h, z0), px(x + w, y, z0))).fill(
    c.side,
  );
  g.poly(flat(px(x, y, z1), px(x + w, y, z1), px(x + w, y + h, z1), px(x, y + h, z1))).fill(c.top);
}

const tileDiamond = (g: Graphics, x: number, y: number, w: number, h: number, z = 0) =>
  g.poly([...px(x, y, z), ...px(x + w, y, z), ...px(x + w, y + h, z), ...px(x, y + h, z)]);

function flame(g: Graphics, x: number, y: number, z: number): void {
  const [sx, sy] = px(x, y, z);
  g.poly([sx, sy - 7, sx + 3, sy - 2, sx, sy, sx - 3, sy - 2]).fill(0xffa12b);
  g.poly([sx, sy - 4, sx + 1.5, sy - 1, sx, sy, sx - 1.5, sy - 1]).fill(0xfff2a0);
}

/** One piece of furniture, drawn as a stack of boxes and details. */
function drawFurniture(g: Graphics, f: Furniture, room: Palette, kind: BuildingKind): void {
  const { x, y, w, h } = f;
  switch (f.kind) {
    case "bed": {
      box(g, x, y, w, h, 0, 7, DARK_WOOD);
      box(g, x + 0.08, y + 0.08, w - 0.16, h - 0.16, 7, 10, CLOTH_CREAM);
      box(g, x + 0.08, y + h * 0.42, w - 0.16, h * 0.58 - 0.08, 10, 12, CLOTH_BLUE);
      box(g, x + 0.14, y + 0.12, w - 0.28, 0.36, 10, 14, CLOTH_CREAM);
      box(g, x, y, w, 0.12, 7, 20, DARK_WOOD);
      break;
    }
    case "table":
    case "desk": {
      const top = f.kind === "desk" ? DARK_WOOD : WOOD;
      for (const [lx, ly] of [
        [x + 0.08, y + 0.1],
        [x + w - 0.2, y + 0.1],
        [x + 0.08, y + h - 0.22],
        [x + w - 0.2, y + h - 0.22],
      ] as const)
        box(g, lx, ly, 0.12, 0.12, 0, 10, DARK_WOOD);
      box(g, x, y, w, h, 10, 13, top);
      if (f.kind === "desk") {
        tileDiamond(g, x + w * 0.3, y + 0.2, 0.5, 0.5, 13.2).fill(0xf1e7c8);
        tileDiamond(g, x + w * 0.65, y + 0.25, 0.3, 0.4, 13.2).fill(0xb23a3a);
        box(g, x + w * 0.75, y + 0.15, 0.1, 0.1, 13, 19, GOLD);
      } else {
        tileDiamond(g, x + 0.3, y + 0.25, 0.35, 0.35, 13.2).fill(0xd9b56a);
        tileDiamond(g, x + w - 0.75, y + 0.3, 0.3, 0.3, 13.2).fill(0xe6d8b0);
      }
      break;
    }
    case "chair":
      box(g, x + 0.15, y + 0.15, 0.7, 0.7, 0, 8, DARK_WOOD);
      box(g, x + 0.15, y + 0.15, 0.7, 0.12, 8, 18, DARK_WOOD);
      break;
    case "hearth": {
      box(g, x, y, w, h, 0, 26, DARK_STONE);
      const [sx, sy] = px(x + w / 2, y + h, 0);
      g.poly([sx - 10, sy, sx + 10, sy, sx + 10, sy - 14, sx - 10, sy - 14]).fill(0x1d1512);
      flame(g, x + w / 2 - 0.15, y + h, 3);
      flame(g, x + w / 2 + 0.2, y + h, 2);
      box(g, x - 0.05, y, w + 0.1, h + 0.05, 26, 29, STONE);
      break;
    }
    case "shelf": {
      box(g, x, y, w, h, 0, 30, DARK_WOOD);
      const colours = [0xb23a3a, 0x3d5fa8, 0xd9b338, 0x4f8f4a, 0x8f5ab0, 0xe6d8b0];
      for (let i = 0; i < 3; i++) {
        const z = 6 + i * 8;
        const n = Math.max(3, Math.round(w * 5));
        for (let k = 0; k < n; k++) {
          const bx = x + ((k + 0.3) / n) * w;
          box(
            g,
            bx,
            y + h - 0.12,
            (w / n) * 0.6,
            0.1,
            z,
            z + 6,
            shade(colours[(k + i * 2) % colours.length]!),
          );
        }
      }
      break;
    }
    case "counter": {
      box(g, x, y, w, h, 0, 14, DARK_WOOD);
      box(g, x - 0.04, y - 0.04, w + 0.08, h + 0.08, 14, 17, WOOD);
      box(g, x + 0.3, y + 0.15, 0.3, 0.3, 17, 22, shade(0xc8552f));
      box(g, x + w - 0.8, y + 0.2, 0.4, 0.3, 17, 20, CLOTH_CREAM);
      break;
    }
    case "crate":
      box(g, x + 0.05, y + 0.05, w - 0.1, h - 0.1, 0, 14, WOOD);
      box(g, x + 0.05, y + h - 0.12, w - 0.1, 0.08, 6, 8, DARK_WOOD);
      break;
    case "barrel": {
      box(g, x + 0.12, y + 0.12, w - 0.24, h - 0.24, 0, 18, DARK_WOOD);
      box(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 4, 6, IRON);
      box(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 12, 14, IRON);
      break;
    }
    case "anvil":
      box(g, x + 0.25, y + 0.25, 0.5, 0.5, 0, 9, DARK_WOOD);
      box(g, x + 0.1, y + 0.2, 0.8, 0.6, 9, 15, IRON);
      box(g, x + 0.75, y + 0.35, 0.3, 0.3, 11, 14, IRON);
      break;
    case "forge": {
      box(g, x, y, w, h, 0, 24, DARK_STONE);
      const [sx, sy] = px(x + w / 2, y + h, 0);
      g.poly([sx - 14, sy - 3, sx + 14, sy - 3, sx + 14, sy - 14, sx - 14, sy - 14]).fill(0xff7a2f);
      g.poly([sx - 10, sy - 6, sx + 10, sy - 6, sx + 10, sy - 12, sx - 10, sy - 12]).fill(0xffd27a);
      box(g, x + 0.2, y + 0.15, 0.4, 0.3, 24, 38, IRON);
      break;
    }
    case "rack": {
      box(g, x, y, w, h, 0, 26, DARK_WOOD);
      for (let i = 0; i < Math.round(w * 2); i++)
        box(g, x + 0.2 + i * 0.5, y + h - 0.1, 0.08, 0.06, 6, 22, IRON);
      break;
    }
    case "altar":
      box(g, x, y, w, h, 0, 16, STONE);
      box(g, x - 0.05, y - 0.05, w + 0.1, h + 0.1, 16, 19, CLOTH_CREAM);
      box(g, x + 0.2, y + 0.3, 0.12, 0.12, 19, 26, GOLD);
      box(g, x + w - 0.32, y + 0.3, 0.12, 0.12, 19, 26, GOLD);
      flame(g, x + 0.26, y + 0.36, 26);
      flame(g, x + w - 0.26, y + 0.36, 26);
      box(g, x + w / 2 - 0.05, y + 0.35, 0.1, 0.1, 19, 30, GOLD);
      break;
    case "pew": {
      box(g, x, y + 0.2, w, 0.6, 0, 9, WOOD);
      box(g, x, y + 0.2, w, 0.12, 9, 20, DARK_WOOD);
      break;
    }
    case "brazier": {
      box(g, x + 0.3, y + 0.3, 0.4, 0.4, 0, 14, IRON);
      box(g, x + 0.2, y + 0.2, 0.6, 0.6, 14, 18, DARK_STONE);
      flame(g, x + 0.5, y + 0.5, 18);
      flame(g, x + 0.4, y + 0.6, 17);
      break;
    }
    case "cauldron":
      box(g, x + 0.1, y + 0.1, 0.8, 0.8, 0, 14, IRON);
      tileDiamond(g, x + 0.2, y + 0.2, 0.6, 0.6, 14.2).fill(0x5fd07a);
      tileDiamond(g, x + 0.35, y + 0.35, 0.2, 0.2, 14.4).fill(0xc9ffd2);
      break;
    case "plinth": {
      const big = w > 1;
      box(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0, big ? 12 : 16, STONE);
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (kind === "magic_house") {
        const [sx, sy] = px(cx, cy, 16);
        g.poly([sx, sy - 14, sx + 5, sy - 6, sx, sy, sx - 5, sy - 6]).fill(0x8f7af0);
        g.poly([sx, sy - 14, sx - 5, sy - 6, sx, sy - 6]).fill(0xc8c0ff);
      } else if (kind === "great_work") {
        for (let i = 0; i < 3; i++)
          box(
            g,
            cx - 0.45 + i * 0.12,
            cy - 0.45 + i * 0.12,
            0.9 - i * 0.24,
            0.9 - i * 0.24,
            12 + i * 6,
            18 + i * 6,
            STONE,
          );
        box(g, cx - 0.06, cy - 0.06, 0.12, 0.12, 30, 40, GOLD);
      } else {
        box(g, cx - 0.3, cy - 0.12, 0.6, 0.24, 16, 20, WOOD);
        box(g, cx - 0.04, cy - 0.04, 0.08, 0.08, 20, 32, DARK_WOOD);
        tileDiamond(g, cx + 0.04, cy - 0.3, 0.3, 0.05, 28).fill(0xe6d8b0);
      }
      break;
    }
    case "banner": {
      box(g, x + 0.4, y + 0.4, 0.14, 0.14, 0, 44, DARK_WOOD);
      box(g, x + 0.05, y + 0.42, 0.9, 0.08, 34, 38, DARK_WOOD);
      box(
        g,
        x + 0.12,
        y + 0.44,
        0.76,
        0.04,
        14,
        34,
        kind === "great_work" ? CLOTH_BLUE : CLOTH_RED,
      );
      break;
    }
    case "chart": {
      box(g, x, y, w, h, 0, 11, DARK_WOOD);
      box(g, x - 0.03, y - 0.03, w + 0.06, h + 0.06, 11, 13, WOOD);
      tileDiamond(g, x + 0.25, y + 0.15, w - 0.5, h - 0.3, 13.2).fill(0xe6d8b0);
      tileDiamond(g, x + 0.5, y + 0.25, 0.5, 0.25, 13.4).fill(0x6fae8a);
      tileDiamond(g, x + w - 1, y + 0.3, 0.4, 0.2, 13.4).fill(0x3c8f94);
      break;
    }
    case "rug": {
      const rug = room.trim;
      tileDiamond(g, x + 0.05, y + 0.05, w - 0.1, h - 0.1, 0.5).fill(shade(rug).front);
      tileDiamond(g, x + 0.3, y + 0.3, w - 0.6, h - 0.6, 0.6).fill(shade(rug).top);
      if (w >= 3 && h >= 3)
        tileDiamond(g, x + w / 2 - 0.4, y + h / 2 - 0.4, 0.8, 0.8, 0.7).fill(room.glow);
      break;
    }
  }
}

/** The furniture and walls, drawn once per building. */
function drawRoom(def: RoomDef, kind: BuildingKind): { floor: Container; things: Container } {
  const pal = PALETTES[kind]!;
  const floor = new Container();
  const slab = new Graphics();
  // The floor slab's thick front edges, then the boards.
  slab
    .poly([
      ...px(0, def.h),
      ...px(def.w, def.h),
      ...px(def.w, def.h, -SLAB),
      ...px(0, def.h, -SLAB),
    ])
    .fill(shade(pal.floorA).side);
  slab
    .poly([
      ...px(def.w, 0),
      ...px(def.w, def.h),
      ...px(def.w, def.h, -SLAB),
      ...px(def.w, 0, -SLAB),
    ])
    .fill(0x1f1a16);
  floor.addChild(slab);
  const boards = new Graphics();
  for (let y = 0; y < def.h; y++)
    for (let x = 0; x < def.w; x++)
      tileDiamond(boards, x, y, 1, 1).fill((x + y) % 2 ? pal.floorA : pal.floorB);
  floor.addChild(boards);
  // Back walls along the two far edges, with a trim and a couple of windows.
  const walls = new Graphics();
  const wallPoly = (a: [number, number], b: [number, number], z: number) => [
    ...px(a[0], a[1], 0),
    ...px(b[0], b[1], 0),
    ...px(b[0], b[1], z),
    ...px(a[0], a[1], z),
  ];
  walls.poly(wallPoly([0, 0], [def.w, 0], WALL)).fill(pal.wall);
  walls.poly(wallPoly([0, 0], [0, def.h], WALL)).fill(shade(pal.wall).side);
  walls.poly(wallPoly([0, 0], [def.w, 0], 6)).fill(shade(pal.wall).side);
  walls.poly(wallPoly([0, 0], [0, def.h], 6)).fill(0x161210);
  walls.poly(wallPoly([0, 0], [def.w, 0], WALL)).stroke({
    width: 1,
    color: pal.trim,
    alpha: 0.6,
  });
  const window = (x: number, y: number, alongX: boolean) => {
    const a = alongX ? px(x, 0, 18) : px(0, y, 18);
    const b = alongX ? px(x + 0.9, 0, 18) : px(0, y + 0.9, 18);
    const c = alongX ? px(x + 0.9, 0, 32) : px(0, y + 0.9, 32);
    const d = alongX ? px(x, 0, 32) : px(0, y, 32);
    walls
      .poly([...a, ...b, ...c, ...d])
      .fill(pal.glow)
      .stroke({ width: 1.5, color: pal.trim });
  };
  for (let x = 1.5; x < def.w - 1; x += 3) window(x, 0, true);
  if (def.h > 6) window(0, def.h / 2 - 0.4, false);
  floor.addChild(walls);
  // A doorway in the front edge: two posts and a lintel around a warm light.
  const door = new Graphics();
  const dx = def.door.x;
  const [lx, ly] = px(dx + 0.5, def.h, 0);
  door.ellipse(lx, ly - 2, 22, 9).fill({ color: pal.glow, alpha: 0.25 });
  box(door, dx + 0.05, def.h - 0.05, 0.1, 0.1, 0, 36, DARK_WOOD);
  box(door, dx + 0.85, def.h - 0.05, 0.1, 0.1, 0, 36, DARK_WOOD);
  box(door, dx, def.h - 0.05, 1, 0.1, 36, 40, DARK_WOOD);
  floor.addChild(door);
  door.zIndex = 1e3;

  const things = new Container();
  things.sortableChildren = true;
  const glow = new Graphics();
  glow.blendMode = "add";
  for (const f of def.furniture) {
    const g = new Graphics();
    drawFurniture(g, f, pal, kind);
    g.zIndex = f.kind === "rug" ? -1 : f.x + f.w / 2 + f.y + f.h / 2;
    things.addChild(g);
    if (["hearth", "brazier", "forge", "altar", "cauldron"].includes(f.kind)) {
      const [gx, gy] = px(f.x + f.w / 2, f.y + f.h / 2 + 0.6, 0);
      for (const [rx, a] of [
        [90, 0.05],
        [60, 0.06],
        [34, 0.08],
      ] as const)
        glow
          .ellipse(gx, gy, rx, rx / 2)
          .fill({ color: f.kind === "cauldron" ? 0x5fd07a : pal.glow, alpha: a });
    }
  }
  floor.addChild(glow);
  floor.addChild(things);
  // Everything in the room is sorted together with the people: one container for both.
  return { floor, things };
}

interface Figure {
  root: Container;
  body: Sprite;
  capeUnder: Sprite | null;
  capeOver: Sprite | null;
  tag: Text;
  x: number;
  y: number;
  moving: boolean;
  seen: boolean;
}

const tunics: Record<NpcRole, number> = {
  steward: 1,
  resident: 0,
  merchant: 2,
  smith: 1,
  priest: 0,
  sage: 2,
  architect: 1,
  harbourmaster: 2,
};

export class RoomScene {
  /** Goes on the stage: a black backdrop and the room itself. */
  readonly layer = new Container();
  private readonly bg = new Graphics();
  private readonly scene = new Container();
  private readonly tags = new Container();
  private current: number | null = null;
  private def: RoomDef | null = null;
  private things: Container | null = null;
  private npc: Figure | null = null;
  private readonly figures = new Map<number, Figure>();
  private scale = 3;

  constructor(
    private readonly atlas: Atlas,
    private readonly tribe: TribeId,
    private readonly colourOf: (playerId: string) => number,
    private readonly nameOf: (playerId: string) => string,
  ) {
    this.layer.addChild(this.bg, this.scene, this.tags);
    this.layer.visible = false;
  }

  get visible(): boolean {
    return this.layer.visible;
  }

  get buildingId(): number | null {
    return this.current;
  }

  /** Put the room of a building on screen. */
  show(state: GameState, b: BuildingEntity): void {
    if (this.current === b.id) {
      this.layer.visible = true;
      return;
    }
    this.clear();
    const def = ROOMS[b.kind];
    if (!def) return;
    this.current = b.id;
    this.def = def;
    const { floor, things } = drawRoom(def, b.kind);
    this.things = things;
    this.scene.addChild(floor);
    this.npc = this.makeFigure(`${npcName(state, b)} · ${def.npc.title}`, 0xf3d08f, false);
    this.npc.x = def.npc.x + 0.5;
    this.npc.y = def.npc.y + 0.5;
    things.addChild(this.npc.root);
    this.layer.visible = true;
  }

  hide(): void {
    this.layer.visible = false;
    this.clear();
  }

  private clear(): void {
    for (const f of this.figures.values()) f.tag.destroy();
    this.figures.clear();
    this.npc?.tag.destroy();
    this.npc = null;
    this.scene.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.current = null;
    this.def = null;
    this.things = null;
  }

  private makeFigure(name: string, colour: number, hero: boolean): Figure {
    const root = new Container();
    const body = this.atlas.sprite(
      hero
        ? heroSprite(this.tribe, 0, false, "stand")
        : villagerSprite(this.tribe, 0, false, "stand"),
    );
    const capeUnder = hero ? this.atlas.sprite(heroCapeSprite(false, "under", "stand")) : null;
    const capeOver = hero ? this.atlas.sprite(heroCapeSprite(false, "over", "stand")) : null;
    if (capeUnder) root.addChild(capeUnder);
    root.addChild(body);
    if (capeOver) root.addChild(capeOver);
    const tag = new Text({
      text: name,
      style: {
        fontFamily: "Pixelify Sans, sans-serif",
        fontSize: 13,
        fill: colour,
        stroke: { color: "#1b1a1f", width: 3 },
      },
    });
    tag.anchor.set(0.5, 1);
    this.tags.addChild(tag);
    return { root, body, capeUnder, capeOver, tag, x: 0, y: 0, moving: false, seen: false };
  }

  private pose(
    f: Figure,
    facing: number,
    moving: boolean,
    now: number,
    id: number,
    tunic: number,
    playerColour?: number,
  ) {
    const back = facing === 2 || facing === 3;
    const flip = facing === 1 || facing === 2;
    const phase = Math.floor(now / 160 + id) % 2;
    const pose = moving ? (phase ? "walk0" : "walk1") : "stand";
    const show = (sprite: Sprite, name: string) => {
      this.atlas.setFrame(sprite, name);
      const k = Math.abs(sprite.scale.x);
      sprite.scale.x = flip ? -k : k;
    };
    if (f.capeOver) {
      show(f.body, heroSprite(this.tribe, tunic, back, pose));
      if (f.capeUnder) {
        f.capeUnder.visible = !back;
        if (!back) show(f.capeUnder, heroCapeSprite(false, "under", pose));
      }
      show(f.capeOver, heroCapeSprite(back, "over", pose));
      const tint = playerColour ?? 0xffffff;
      if (f.capeUnder) f.capeUnder.tint = tint;
      f.capeOver.tint = tint;
    } else {
      show(f.body, villagerSprite(this.tribe, tunic, back, pose));
    }
  }

  /** Update the people, fit the room to the screen and keep the backdrop black. */
  frame(
    now: number,
    dt: number,
    state: GameState,
    width: number,
    height: number,
    reserveRight = 0,
  ): void {
    const def = this.def;
    if (!def || !this.things) return;
    this.bg.clear().rect(0, 0, width, height).fill(0x000000);
    const span = { w: (def.w + def.h) * HALF_W, h: (def.w + def.h) * HALF_H + WALL + SLAB };
    const free = width - reserveRight;
    let s = Math.min((free * 0.84) / span.w, (height * 0.7) / span.h);
    s = s >= 2 ? Math.min(6, Math.floor(s)) : Math.max(1, s);
    this.scale = s;
    const cx = ((def.w - def.h) * HALF_W) / 2;
    const cy = ((def.w + def.h) * HALF_H) / 2 - (WALL - SLAB) / 2;
    this.scene.scale.set(s);
    this.scene.position.set(Math.round(free / 2 - cx * s), Math.round(height / 2 - cy * s - 24));

    // The NPC looks towards whoever is nearest.
    const npc = this.npc;
    const here: CharacterEntity[] = [];
    for (const e of state.entities.values())
      if (e.type === "character" && e.inside === this.current) here.push(e);
    if (npc) {
      let facing = 1;
      let best = Infinity;
      for (const c of here) {
        const d = Math.hypot(c.room.x - npc.x, c.room.y - npc.y);
        if (d < best) {
          best = d;
          facing =
            Math.abs(c.room.x - npc.x) >= Math.abs(c.room.y - npc.y)
              ? c.room.x > npc.x
                ? 0
                : 2
              : c.room.y > npc.y
                ? 1
                : 3;
        }
      }
      this.pose(npc, facing, false, now, 0, tunics[def.npc.role]);
      this.place(npc, npc.x, npc.y, 0.01);
    }
    for (const f of this.figures.values()) f.seen = false;
    for (const c of here) {
      let f = this.figures.get(c.id);
      if (!f) {
        f = this.makeFigure(this.nameOf(c.playerId), this.colourOf(c.playerId), true);
        f.x = c.room.x;
        f.y = c.room.y;
        this.figures.set(c.id, f);
        this.things.addChild(f.root);
      }
      f.seen = true;
      const k = 1 - Math.exp(-dt * 16);
      const dx = c.room.x - f.x;
      const dy = c.room.y - f.y;
      f.moving = Math.hypot(dx, dy) > 0.04;
      f.x += dx * k;
      f.y += dy * k;
      this.pose(f, c.facing, f.moving, now, c.id, c.tunic, this.colourOf(c.playerId));
      this.place(f, f.x, f.y, 0.02);
    }
    for (const [id, f] of this.figures) {
      if (f.seen) continue;
      f.tag.destroy();
      f.root.destroy({ children: true });
      this.figures.delete(id);
    }
  }

  private place(f: Figure, x: number, y: number, bias: number): void {
    const [sx, sy] = px(x, y);
    f.root.position.set(Math.round(sx), Math.round(sy));
    f.root.zIndex = x + y + bias;
    const p = this.scene.toGlobal({ x: sx, y: sy - 38 });
    f.tag.position.set(Math.round(p.x), Math.round(p.y));
  }

  /** The middle of the NPC on screen (for tests). */
  npcPoint(): { x: number; y: number } | null {
    if (!this.npc) return null;
    const b = this.npc.body.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** What is under a screen point: the NPC, or a tile of the floor. */
  pick(sx: number, sy: number): { npc: true } | { x: number; y: number } | null {
    const def = this.def;
    if (!def) return null;
    if (this.npc?.body.getBounds().containsPoint(sx, sy)) return { npc: true };
    const lx = (sx - this.scene.x) / this.scale;
    const ly = (sy - this.scene.y) / this.scale;
    const a = lx / HALF_W;
    const b = ly / HALF_H;
    const x = Math.floor((a + b) / 2);
    const y = Math.floor((b - a) / 2);
    if (x < 0 || y < 0 || x >= def.w || y >= def.h) return null;
    return { x, y };
  }
}

export const roomTitle = (kind: BuildingKind): string => BUILDINGS[kind].name;

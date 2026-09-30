// Which sprites make up a room, and what they are called. The sprite generator (tools/sprites)
// and the client's room view both use these, so a room's look is decided in one place: the
// layout in `interiors.ts` plus the choices below (which floor tile where, which wall column).
import { TRIBES, type TribeId } from "../tribes";
import type { BuildingKind } from "./catalogue";
import { ROOMS, type FloorStyle, type Furniture, type RoomDef } from "./interiors";

/** Floor tiles: four plain variants, and three for the column along the left wall, which sits in the wall's shadow (far from the wall's end, one tile short of it, the last one). */
export const FLOOR_KEYS = [0, 1, 2, 3, "s0", "s1", "s2"] as const;
export type FloorKey = (typeof FLOOR_KEYS)[number];

export type WallArm = "x" | "y";
/** One tile-wide piece of a back wall: the first and last columns, and plain or window pieces. */
export const WALL_KINDS = [
  "start",
  "plain0",
  "plain1",
  "plain2",
  "window0",
  "window1",
  "end",
] as const;
export type WallKind = (typeof WALL_KINDS)[number];

export const FLOOR_STYLES: readonly FloorStyle[] = ["boards", "flags", "arcane"];
export const SLAB_VARIANTS = 2;

/** How tall a room's back walls stand and how deep its floor slab is, in pixels. */
export const ROOM_WALL_PX = 44;
export const ROOM_SLAB_PX = 9;

const PREFIX = "in_";

/** Arcane floors are the same for every tribe. */
export const floorSprite = (style: FloorStyle, tribe: TribeId, key: FloorKey): string =>
  style === "arcane" ? `${PREFIX}floor_arcane_${key}` : `${PREFIX}floor_${style}_${tribe}_${key}`;

/** The thickness of the floor along its two front edges: `x` runs along x (the front-left edge). */
export const slabSprite = (arm: WallArm, tribe: TribeId, variant: number): string =>
  `${PREFIX}slab_${arm}_${tribe}_${variant % SLAB_VARIANTS}`;

export const wallSprite = (arm: WallArm, tribe: TribeId, kind: WallKind): string =>
  `${PREFIX}wall_${arm}_${tribe}_${kind}`;

export const doorSprite = (tribe: TribeId): string => `${PREFIX}door_${tribe}`;
export const matSprite = (): string => `${PREFIX}mat`;

/** Banners wear the tribe's colours; everything else is the same for every tribe. */
export function furnitureSprite(room: BuildingKind, item: Furniture, tribe: TribeId): string {
  if (item.kind === "banner") return `${PREFIX}fur_banner_${tribe}`;
  return `${PREFIX}fur_${room}_${item.kind}_${item.w}x${item.h}${item.face === "+x" ? "_x" : ""}`;
}

const mix = (x: number, y: number): number =>
  Math.abs(Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663)) >>> 0;

/** Which floor tile sits at (x, y): plain tiles vary by position, the left column is shadowed. */
export function floorKey(def: RoomDef, x: number, y: number): FloorKey {
  if (x === 0) return y <= def.h - 3 ? "s0" : y === def.h - 2 ? "s1" : "s2";
  return (mix(x, y) % 4) as 0 | 1 | 2 | 3;
}

/** The pieces of a back wall, column by column (windows where the room says so). */
export function wallKinds(def: RoomDef, arm: WallArm): WallKind[] {
  const n = arm === "x" ? def.w : def.h;
  const out: WallKind[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push("start");
    else if (i === n - 1) out.push("end");
    else if (def.windows.some((w) => w.wall === arm && w.at === i))
      out.push(`window${mix(i, n) % 2}` as WallKind);
    else out.push(`plain${mix(i, n + 5) % 3}` as WallKind);
  }
  return out;
}

/** The slab piece under each tile of a front edge. */
export const slabVariant = (i: number): number => mix(i, 3) % SLAB_VARIANTS;

/** Every sprite the rooms of a tribe need. */
export function roomSpriteNames(tribe: TribeId): string[] {
  const names = new Set<string>();
  const add = (n: string) => names.add(n);
  for (const style of FLOOR_STYLES)
    for (const key of FLOOR_KEYS) add(floorSprite(style, tribe, key));
  for (const arm of ["x", "y"] as const) {
    for (const kind of WALL_KINDS) add(wallSprite(arm, tribe, kind));
    for (let v = 0; v < SLAB_VARIANTS; v++) add(slabSprite(arm, tribe, v));
  }
  add(doorSprite(tribe));
  add(matSprite());
  for (const [room, def] of Object.entries(ROOMS) as [BuildingKind, RoomDef][])
    for (const item of def.furniture) add(furnitureSprite(room, item, tribe));
  return [...names];
}

/** Every tribe-independent furniture sprite: (room, piece) pairs without duplicates. */
export function furniturePieces(): { room: BuildingKind; item: Furniture; name: string }[] {
  const out = new Map<string, { room: BuildingKind; item: Furniture; name: string }>();
  for (const [room, def] of Object.entries(ROOMS) as [BuildingKind, RoomDef][])
    for (const item of def.furniture) {
      if (item.kind === "banner") continue;
      const name = furnitureSprite(room, item, TRIBES[0]!);
      if (!out.has(name)) out.set(name, { room, item, name });
    }
  return [...out.values()];
}

export type PieceLayer = "floor" | "rug" | "wall" | "object" | "door";

/** One sprite of a room: what it is, where its anchor goes, and how it sorts. */
export interface RoomPiece {
  sprite: string;
  /** Tile coordinates of the sprite's anchor: the top vertex of its footprint (or of the wall's foot). */
  x: number;
  y: number;
  layer: PieceLayer;
  /** Objects only: the footprint in tiles, for sorting against people and other objects. */
  box?: { x0: number; y0: number; x1: number; y1: number };
  /** Objects only: the furniture this is. */
  item?: Furniture;
}

/**
 * Everything that is drawn for a room, floor to furniture. The client draws it (objects sorted
 * together with the people), and the sprite generator's preview draws it the same way.
 */
export function roomPieces(room: BuildingKind, def: RoomDef, tribe: TribeId): RoomPiece[] {
  const out: RoomPiece[] = [];
  for (let y = 0; y < def.h; y++)
    for (let x = 0; x < def.w; x++)
      out.push({
        sprite: floorSprite(def.floor, tribe, floorKey(def, x, y)),
        x,
        y,
        layer: "floor",
      });
  for (let i = 0; i < def.w; i++)
    out.push({ sprite: slabSprite("x", tribe, slabVariant(i)), x: i, y: def.h, layer: "floor" });
  for (let j = 0; j < def.h; j++)
    out.push({
      sprite: slabSprite("y", tribe, slabVariant(j + 9)),
      x: def.w,
      y: j,
      layer: "floor",
    });
  wallKinds(def, "x").forEach((kind, i) =>
    out.push({ sprite: wallSprite("x", tribe, kind), x: i, y: 0, layer: "wall" }),
  );
  wallKinds(def, "y").forEach((kind, j) =>
    out.push({ sprite: wallSprite("y", tribe, kind), x: 0, y: j, layer: "wall" }),
  );
  out.push({ sprite: matSprite(), x: def.door.x, y: def.door.y, layer: "rug" });
  for (const item of def.furniture) {
    const sprite = furnitureSprite(room, item, tribe);
    if (item.kind === "rug") out.push({ sprite, x: item.x, y: item.y, layer: "rug", item });
    else
      out.push({
        sprite,
        x: item.x,
        y: item.y,
        layer: "object",
        box: { x0: item.x, y0: item.y, x1: item.x + item.w, y1: item.y + item.h },
        item,
      });
  }
  out.push({ sprite: doorSprite(tribe), x: def.door.x, y: def.door.y, layer: "door" });
  return out;
}

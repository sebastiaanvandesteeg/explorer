// Inside the buildings: a small furnished room for each town-like building, with one NPC who does
// the building's business. Rooms are plain data (the client draws them, the simulation walks in
// them), so everyone agrees on where the furniture is and who stands where.
import { createRng } from "../rng";
import { CHARACTER, type BuildingKind } from "./catalogue";
import { characterOf } from "./characters";
import { landPath } from "./navigation";
import { buildingAround } from "./rules";
import {
  lookAround,
  markDirty,
  walkable,
  type BuildingEntity,
  type CharacterEntity,
  type GameState,
} from "./state";
import { setFacing, tileOf } from "./walk";

export type FurnitureKind =
  | "bed"
  | "table"
  | "chair"
  | "hearth"
  | "rug"
  | "shelf"
  | "counter"
  | "crate"
  | "barrel"
  | "anvil"
  | "forge"
  | "rack"
  | "altar"
  | "pew"
  | "brazier"
  | "cauldron"
  | "plinth"
  | "banner"
  | "desk"
  | "chart";

/** Things you can walk over. Everything else blocks. */
const FLAT: ReadonlySet<FurnitureKind> = new Set(["rug"]);

export interface Furniture {
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Which way it faces, for pieces with a front: `+y` (the default, against the back-right wall
   * or looking at the camera's right) or `+x` (against the back-left wall, or a chair turned
   * towards its table). Purely visual.
   */
  face?: "+x" | "+y";
}

export type NpcRole =
  "steward" | "resident" | "merchant" | "smith" | "priest" | "sage" | "architect" | "harbourmaster";

/** What the floor is made of: planks, flagstones in the tribe's stone, or dark arcane flags. */
export type FloorStyle = "boards" | "flags" | "arcane";

/** A window in a back wall: `x` is the back-right wall (run along x), `y` the back-left wall. */
export interface RoomWindow {
  wall: "x" | "y";
  /** The wall column (a tile along the wall). Never the first or last column. */
  at: number;
}

export interface RoomDef {
  w: number;
  h: number;
  /** The door is in the bottom row; stepping onto it leaves the building. */
  door: { x: number; y: number };
  furniture: Furniture[];
  npc: { x: number; y: number; role: NpcRole; title: string };
  /** How the room looks (the simulation does not care). */
  floor: FloorStyle;
  windows: RoomWindow[];
}

const f = (
  kind: FurnitureKind,
  x: number,
  y: number,
  w = 1,
  h = 1,
  face?: "+x" | "+y",
): Furniture => ({
  kind,
  x,
  y,
  w,
  h,
  ...(face ? { face } : {}),
});

/** The buildings you can go into, and their rooms. */
export const ROOMS: Partial<Record<BuildingKind, RoomDef>> = {
  house: {
    w: 7,
    h: 6,
    door: { x: 3, y: 5 },
    floor: "boards",
    windows: [
      { wall: "x", at: 3 },
      { wall: "y", at: 4 },
    ],
    furniture: [
      f("bed", 0, 0, 2, 2),
      f("shelf", 0, 3, 1, 1, "+x"),
      f("hearth", 5, 0, 2, 1),
      f("table", 3, 2, 2, 1),
      f("chair", 2, 2, 1, 1, "+x"),
      f("rug", 2, 3, 3, 2),
    ],
    npc: { x: 5, y: 3, role: "resident", title: "Resident" },
  },
  town_hall: {
    w: 11,
    h: 8,
    door: { x: 5, y: 7 },
    floor: "flags",
    windows: [
      { wall: "x", at: 3 },
      { wall: "x", at: 7 },
      { wall: "y", at: 5 },
    ],
    furniture: [
      f("banner", 1, 0),
      f("banner", 9, 0),
      f("desk", 4, 1, 3, 1),
      f("shelf", 0, 2, 1, 2, "+x"),
      f("table", 2, 4, 2, 1),
      f("table", 7, 4, 2, 1),
      f("rug", 4, 3, 3, 3),
    ],
    npc: { x: 5, y: 0, role: "steward", title: "Steward" },
  },
  market: {
    w: 10,
    h: 7,
    door: { x: 4, y: 6 },
    floor: "boards",
    windows: [
      { wall: "x", at: 2 },
      { wall: "x", at: 7 },
      { wall: "y", at: 2 },
      { wall: "y", at: 5 },
    ],
    furniture: [
      f("counter", 3, 1, 4, 1),
      f("crate", 0, 0, 2, 1),
      f("barrel", 8, 0),
      f("barrel", 9, 0),
      f("crate", 8, 3),
      f("crate", 0, 3),
      f("rug", 3, 3, 4, 2),
    ],
    npc: { x: 4, y: 0, role: "merchant", title: "Merchant" },
  },
  blacksmith: {
    w: 9,
    h: 7,
    door: { x: 4, y: 6 },
    floor: "flags",
    windows: [
      { wall: "x", at: 4 },
      { wall: "y", at: 3 },
    ],
    furniture: [
      f("forge", 0, 0, 3, 1),
      f("rack", 6, 0, 2, 1),
      f("anvil", 4, 2),
      f("barrel", 8, 4),
      f("barrel", 8, 3),
      f("crate", 0, 4),
    ],
    npc: { x: 5, y: 2, role: "smith", title: "Smith" },
  },
  church: {
    w: 9,
    h: 9,
    door: { x: 4, y: 8 },
    floor: "flags",
    windows: [
      { wall: "x", at: 1 },
      { wall: "x", at: 6 },
      { wall: "y", at: 2 },
      { wall: "y", at: 5 },
    ],
    furniture: [
      f("altar", 3, 0, 3, 1),
      f("brazier", 0, 0),
      f("brazier", 8, 0),
      f("pew", 1, 4, 3, 1),
      f("pew", 5, 4, 3, 1),
      f("pew", 1, 6, 3, 1),
      f("pew", 5, 6, 3, 1),
      f("rug", 4, 2, 1, 6),
    ],
    npc: { x: 4, y: 1, role: "priest", title: "Priest" },
  },
  magic_house: {
    w: 8,
    h: 8,
    door: { x: 3, y: 7 },
    floor: "arcane",
    windows: [
      { wall: "x", at: 3 },
      { wall: "y", at: 4 },
    ],
    furniture: [
      f("shelf", 0, 0, 3, 1),
      f("shelf", 5, 0, 3, 1),
      f("rug", 2, 2, 4, 4),
      f("cauldron", 6, 4),
      f("plinth", 1, 5),
    ],
    npc: { x: 3, y: 1, role: "sage", title: "Sage" },
  },
  great_work: {
    w: 10,
    h: 8,
    door: { x: 4, y: 7 },
    floor: "flags",
    windows: [
      { wall: "x", at: 2 },
      { wall: "x", at: 7 },
      { wall: "y", at: 2 },
      { wall: "y", at: 5 },
    ],
    furniture: [
      f("banner", 0, 0),
      f("banner", 9, 0),
      f("plinth", 4, 1, 2, 2),
      f("desk", 1, 3, 2, 1),
      f("rug", 3, 4, 4, 2),
    ],
    npc: { x: 7, y: 2, role: "architect", title: "Architect" },
  },
  dock: {
    w: 9,
    h: 6,
    door: { x: 4, y: 5 },
    floor: "boards",
    windows: [
      { wall: "x", at: 2 },
      { wall: "x", at: 4 },
      { wall: "y", at: 2 },
    ],
    furniture: [
      f("chart", 1, 1, 3, 1),
      f("plinth", 6, 0),
      f("barrel", 7, 3),
      f("crate", 0, 3),
      f("rug", 3, 3, 3, 1),
    ],
    npc: { x: 5, y: 2, role: "harbourmaster", title: "Harbourmaster" },
  },
};

export const isEnterable = (kind: BuildingKind): boolean => kind in ROOMS;

/** How close, in room tiles, you must stand to an NPC to talk to them. */
export const TALK_REACH = 2.2;

export function roomOf(state: GameState, buildingId: number): RoomDef | null {
  const b = state.entities.get(buildingId);
  return b?.type === "building" ? (ROOMS[b.kind] ?? null) : null;
}

export function roomWalkable(def: RoomDef, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= def.w || y >= def.h) return false;
  if (x === def.npc.x && y === def.npc.y) return false;
  for (const item of def.furniture) {
    if (FLAT.has(item.kind)) continue;
    if (x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h) return false;
  }
  return true;
}

/** Where you stand when you come in: the tile in front of the door. */
export const roomEntry = (def: RoomDef): { x: number; y: number } => ({
  x: def.door.x,
  y: def.door.y - 1,
});

/** Shortest walk between two tiles of a room (diagonals only where both sides are clear). */
export function roomPath(
  def: RoomDef,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] | null {
  if (!roomWalkable(def, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const key = (x: number, y: number) => y * def.w + x;
  const prev = new Map<number, number>([[key(from.x, from.y), -1]]);
  const queue = [from];
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    for (const [dx, dy] of steps) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (prev.has(key(nx, ny)) || !roomWalkable(def, nx, ny)) continue;
      if (
        dx !== 0 &&
        dy !== 0 &&
        !(roomWalkable(def, cur.x + dx, cur.y) && roomWalkable(def, cur.x, cur.y + dy))
      )
        continue;
      prev.set(key(nx, ny), key(cur.x, cur.y));
      if (nx === to.x && ny === to.y) {
        const out: { x: number; y: number }[] = [];
        for (let k = key(nx, ny); k !== key(from.x, from.y); k = prev.get(k)!)
          out.push({ x: k % def.w, y: Math.floor(k / def.w) });
        return out.reverse();
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

const FIRST = [
  "Alda",
  "Bram",
  "Cora",
  "Dunn",
  "Edda",
  "Finn",
  "Greta",
  "Hale",
  "Ivo",
  "Juna",
  "Kell",
  "Lysa",
  "Marn",
  "Nell",
  "Orin",
  "Pell",
  "Quill",
  "Rhea",
  "Sorn",
  "Tove",
  "Ulla",
  "Varn",
  "Wren",
  "Yara",
];
const LAST = [
  "Ashby",
  "Brook",
  "Cairn",
  "Dale",
  "Fenn",
  "Gale",
  "Hearn",
  "Marsh",
  "Reed",
  "Stone",
  "Thorn",
  "Wick",
];

/** The NPC's name: the same for everyone, and fixed for a building's lifetime. */
export function npcName(state: GameState, b: BuildingEntity): string {
  const rng = createRng(`${state.world.seed}:npc:${b.id}`);
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

// ---------------------------------------------------------------------------------------------
// Going in and out

type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });

/** The tiles a character can go in by: beside the building, or on it when it can be walked on. */
function doorTiles(state: GameState, b: BuildingEntity): { x: number; y: number }[] {
  const out = buildingAround(state, b);
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) if (walkable(state, x, y)) out.push({ x, y });
  return out;
}

const atDoor = (b: BuildingEntity, c: CharacterEntity): boolean => {
  const t = tileOf(c);
  return t.x >= b.x - 1 && t.x <= b.x + b.w && t.y >= b.y - 1 && t.y <= b.y + b.h;
};

function goIn(state: GameState, c: CharacterEntity, b: BuildingEntity): void {
  const def = ROOMS[b.kind]!;
  c.inside = b.id;
  c.enter = null;
  c.fetch = null;
  c.path = [];
  c.dest = null;
  c.action = "idle";
  const entry = roomEntry(def);
  c.room = { x: entry.x + 0.5, y: entry.y + 0.5 };
  c.rpath = [];
  c.facing = 3;
  markDirty(state, c.id);
}

/** Walk up to a building and go in. */
export function enterBuilding(state: GameState, actor: string | null, buildingId: number): Result {
  const c = actor === null ? undefined : characterOf(state, actor);
  if (!c) return fail("You have no character here");
  if (c.inside !== null) return fail("You are already inside");
  if (c.aboard !== null) return fail("You are at sea");
  const b = state.entities.get(buildingId);
  if (b?.type !== "building") return fail("No such building");
  if (!isEnterable(b.kind)) return fail("There is nothing to go into there");
  if (!b.complete) return fail("It isn't finished yet");
  c.fetch = null;
  if (atDoor(b, c)) {
    goIn(state, c, b);
    return { ok: true };
  }
  const path = landPath(state, tileOf(c), doorTiles(state, b));
  if (!path || path.length === 0) return fail("There's no way there on foot");
  c.path = path;
  c.dest = { ...path[path.length - 1]! };
  c.action = "walk";
  c.enter = b.id;
  markDirty(state, c.id);
  return { ok: true };
}

/** Called every tick for a character heading for a door. */
export function checkEntered(state: GameState, c: CharacterEntity): void {
  if (c.enter === null) return;
  const b = state.entities.get(c.enter);
  if (b?.type !== "building" || !b.complete) {
    c.enter = null;
    markDirty(state, c.id);
    return;
  }
  if (atDoor(b, c) && c.path.length === 0) goIn(state, c, b);
  else if (c.action !== "walk") {
    c.enter = null;
    markDirty(state, c.id);
  }
}

/** Put a character back outside, on a free tile beside the building. */
export function leaveBuilding(state: GameState, c: CharacterEntity): void {
  const b = c.inside === null ? undefined : state.entities.get(c.inside);
  if (b?.type === "building") {
    const spots = doorTiles(state, b)
      .filter(
        (t) => !b.complete || !(t.x >= b.x && t.x < b.x + b.w && t.y >= b.y && t.y < b.y + b.h),
      )
      .sort((a, z) => z.y + z.x - (a.y + a.x));
    const taken = (t: { x: number; y: number }) => {
      for (const e of state.entities.values())
        if (e.type === "character" && e.inside === null && e.id !== c.id)
          if (Math.floor(e.x) === t.x && Math.floor(e.y) === t.y) return true;
      return false;
    };
    const free = spots.find((t) => !taken(t));
    const at = free ?? spots[0];
    if (at) {
      c.x = at.x + 0.5;
      c.y = at.y + 0.5;
    }
  }
  c.inside = null;
  c.room = { x: 0, y: 0 };
  c.rpath = [];
  c.action = "idle";
  c.dest = null;
  lookAround(state, c.x, c.y, CHARACTER.reveal);
  markDirty(state, c.id);
}

export function leaveCommand(state: GameState, actor: string | null): Result {
  const c = actor === null ? undefined : characterOf(state, actor);
  if (!c) return fail("You have no character here");
  if (c.inside === null) return fail("You are not inside anything");
  leaveBuilding(state, c);
  return { ok: true };
}

/** Walk to a tile of the room you are in; clicking furniture or the NPC walks up beside it. */
export function moveInRoom(
  state: GameState,
  actor: string | null,
  target: { x: number; y: number },
): Result {
  const c = actor === null ? undefined : characterOf(state, actor);
  if (!c) return fail("You have no character here");
  if (c.inside === null) return fail("You are not inside anything");
  const def = roomOf(state, c.inside);
  if (!def) return fail("No such room");
  if (target.x < 0 || target.y < 0 || target.x >= def.w || target.y >= def.h)
    return fail("Outside the room");
  const here = { x: Math.floor(c.room.x), y: Math.floor(c.room.y) };
  let goal = target;
  if (!roomWalkable(def, goal.x, goal.y)) {
    let best: { x: number; y: number } | null = null;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const t = { x: target.x + dx, y: target.y + dy };
        if (!roomWalkable(def, t.x, t.y)) continue;
        const d = Math.hypot(dx, dy) * 10 + Math.hypot(t.x - here.x, t.y - here.y);
        if (
          !best ||
          d <
            Math.hypot(best.x - target.x, best.y - target.y) * 10 +
              Math.hypot(best.x - here.x, best.y - here.y)
        )
          best = t;
      }
    if (!best) return fail("Can't walk there");
    goal = best;
  }
  const path = roomPath(def, here, goal);
  if (!path) return fail("Can't walk there");
  c.rpath = path;
  c.action = path.length > 0 ? "walk" : "idle";
  markDirty(state, c.id);
  return { ok: true };
}

/** One tick of walking about inside a building. */
export function updateInRoom(state: GameState, c: CharacterEntity, dt: number): void {
  const b = c.inside === null ? undefined : state.entities.get(c.inside);
  if (b?.type !== "building" || !b.complete) {
    leaveBuilding(state, c);
    return;
  }
  const def = ROOMS[b.kind]!;
  if (c.action !== "walk" || c.rpath.length === 0) {
    if (c.action === "walk") {
      c.action = "idle";
      markDirty(state, c.id);
    }
    return;
  }
  let budget = CHARACTER.speed * dt;
  while (budget > 1e-6 && c.rpath.length > 0) {
    const next = c.rpath[0]!;
    if (!roomWalkable(def, next.x, next.y)) {
      c.rpath = [];
      break;
    }
    const dx = next.x + 0.5 - c.room.x;
    const dy = next.y + 0.5 - c.room.y;
    const dist = Math.hypot(dx, dy);
    setFacing(c, dx, dy);
    if (dist <= budget) {
      c.room = { x: next.x + 0.5, y: next.y + 0.5 };
      budget -= dist;
      c.rpath.shift();
    } else {
      c.room = { x: c.room.x + (dx / dist) * budget, y: c.room.y + (dy / dist) * budget };
      budget = 0;
    }
  }
  markDirty(state, c.id);
  if (c.rpath.length > 0) return;
  c.action = "idle";
  // Stepping onto the door leaves the building.
  if (Math.floor(c.room.x) === def.door.x && Math.floor(c.room.y) === def.door.y)
    leaveBuilding(state, c);
}

/** Whether a character is inside this building and close enough to its NPC to talk. */
export function atNpc(
  state: GameState,
  actor: string,
  kinds: readonly BuildingKind[],
  buildingId?: number,
): Result {
  const c = characterOf(state, actor);
  const b = c && c.inside !== null ? state.entities.get(c.inside) : undefined;
  if (
    !c ||
    b?.type !== "building" ||
    !kinds.includes(b.kind) ||
    (buildingId !== undefined && b.id !== buildingId)
  )
    return fail("Go inside and talk to the people there");
  const def = ROOMS[b.kind]!;
  if (Math.hypot(def.npc.x + 0.5 - c.room.x, def.npc.y + 0.5 - c.room.y) > TALK_REACH)
    return fail("Step closer to talk");
  return { ok: true };
}

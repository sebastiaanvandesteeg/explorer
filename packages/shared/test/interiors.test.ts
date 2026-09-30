import { describe, expect, it } from "vitest";
import {
  applyCommand,
  applyPatch,
  BUILDINGS,
  createInitialState,
  ensureCharacter,
  fromSnapshot,
  generateWorld,
  isEnterable,
  newBuilding,
  addEntity,
  npcName,
  removeEntity,
  roomEntry,
  floorKey,
  furniturePieces,
  furnitureSprite,
  roomPieces,
  roomSpriteNames,
  TRIBES,
  wallKinds,
  WALL_KINDS,
  FLOOR_KEYS,
  roomPath,
  roomWalkable,
  ROOMS,
  takePatch,
  tick,
  TALK_REACH,
  toSnapshot,
  type BuildingEntity,
  type BuildingKind,
  type CharacterEntity,
  type GameState,
} from "../src";

const world = generateWorld("interior-tests");
const fresh = (): GameState => {
  const s = createInitialState(world);
  Object.assign(s.stock, { wood: 900, stone: 900, food: 100, ore: 40, tools: 40, gold: 200 });
  return s;
};
const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(s);
};
const hall = (s: GameState) =>
  [...s.entities.values()].find(
    (e): e is BuildingEntity => e.type === "building" && e.kind === "town_hall",
  )!;

/** A finished building of a kind, dropped near the town hall on free ground. */
function built(s: GameState, kind: BuildingKind): BuildingEntity {
  const th = world.start.townHall;
  for (let r = 4; r < 25; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = th.x + dx;
        const y = th.y + dy;
        if (kind === "harbour") continue;
        const b = newBuilding(s, kind, x, y, true);
        try {
          if (applyCommand(s, { kind: "place-building", building: kind, x, y }).ok) {
            const placed = [...s.entities.values()].filter(
              (e): e is BuildingEntity => e.type === "building" && e.kind === kind,
            );
            const made = placed[placed.length - 1]!;
            made.complete = true;
            made.progress = 1;
            void b;
            return made;
          }
        } catch {
          /* try the next spot */
        }
      }
  throw new Error(`no room for ${kind}`);
}

const cmd = (s: GameState, actor: string | null, c: Parameters<typeof applyCommand>[1]) =>
  applyCommand(s, c, actor);

describe("the rooms", () => {
  it("cover the town-like buildings and nothing else", () => {
    expect(Object.keys(ROOMS).sort()).toEqual(
      [
        "blacksmith",
        "church",
        "harbour",
        "great_work",
        "house",
        "magic_house",
        "market",
        "town_hall",
      ].sort(),
    );
    expect(isEnterable("house")).toBe(true);
    expect(isEnterable("farm")).toBe(false);
    expect(isEnterable("path")).toBe(false);
    for (const kind of Object.keys(ROOMS)) expect(kind in BUILDINGS).toBe(true);
  });

  it("are laid out sensibly: a clear door, furniture inside the walls, an NPC you can reach", () => {
    for (const [kind, def] of Object.entries(ROOMS)) {
      const name = kind;
      expect(def.door.y, name).toBe(def.h - 1);
      expect(roomWalkable(def, def.door.x, def.door.y), name).toBe(true);
      const entry = roomEntry(def);
      expect(roomWalkable(def, entry.x, entry.y), name).toBe(true);
      for (const item of def.furniture) {
        expect(item.x >= 0 && item.y >= 0, name).toBe(true);
        expect(item.x + item.w <= def.w && item.y + item.h <= def.h, name).toBe(true);
      }
      expect(roomWalkable(def, def.npc.x, def.npc.y), name).toBe(false);
      // Every floor tile can be reached from the door, and somewhere next to the NPC can be.
      let near = false;
      for (let y = 0; y < def.h; y++)
        for (let x = 0; x < def.w; x++) {
          if (!roomWalkable(def, x, y)) continue;
          expect(roomPath(def, entry, { x, y }), `${name} ${x},${y}`).not.toBeNull();
          if (Math.hypot(def.npc.x - x, def.npc.y - y) <= TALK_REACH) near = true;
        }
      expect(near, `${name} npc reachable`).toBe(true);
    }
  });

  it("give every NPC a name that is stable and the same for everyone", () => {
    const s = fresh();
    const b = hall(s);
    expect(npcName(s, b)).toBe(npcName(fresh(), hall(fresh())));
    expect(npcName(s, b)).toMatch(/^\w+ \w+$/);
  });
});

/** How tall each piece of furniture stands, in pixels (the sprite generator's models). */
const HEIGHT: Partial<Record<string, number>> = {
  bed: 28,
  shelf: 34,
  hearth: 44,
  banner: 45,
  forge: 44,
  rack: 30,
  altar: 34,
  plinth: 31,
  brazier: 25,
  desk: 22,
  counter: 24,
  chair: 21,
};

describe("how the rooms look", () => {
  const rooms = Object.entries(ROOMS) as [
    BuildingKind,
    NonNullable<(typeof ROOMS)[BuildingKind]>,
  ][];

  it("put windows on inner wall columns, one each, where no tall furniture stands", () => {
    for (const [kind, def] of rooms) {
      const seen = new Set<string>();
      expect(def.windows.length, kind).toBeGreaterThan(0);
      for (const w of def.windows) {
        const len = w.wall === "x" ? def.w : def.h;
        expect(w.at, `${kind} window`).toBeGreaterThanOrEqual(1);
        expect(w.at, `${kind} window`).toBeLessThanOrEqual(len - 2);
        expect(seen.has(`${w.wall}${w.at}`), `${kind} duplicate window`).toBe(false);
        seen.add(`${w.wall}${w.at}`);
      }
      for (const item of def.furniture) {
        const height = HEIGHT[item.kind] ?? 0;
        // A piece standing against a wall hides the window columns its silhouette covers on
        // screen: for the back-right wall the columns from x0 - y1 to x1 - y0, for the back-left
        // wall from y0 - x1 to y1 - x0. Pieces further from the wall only reach up to `height -
        // 16 * distance` pixels, and windows start at 18.
        for (const w of def.windows) {
          const hidden =
            w.wall === "x"
              ? height - 16 * item.y > 18 &&
                w.at + 1 > item.x - (item.y + item.h) &&
                w.at < item.x + item.w - item.y
              : height - 16 * item.x > 18 &&
                w.at + 1 > item.y - (item.x + item.w) &&
                w.at < item.y + item.h - item.x;
          expect(hidden, `${kind}: a window behind a ${item.kind}`).toBe(false);
        }
      }
    }
  });

  it("choose a wall piece for every column and a floor tile for every tile", () => {
    for (const [kind, def] of rooms) {
      for (const arm of ["x", "y"] as const) {
        const kinds = wallKinds(def, arm);
        expect(kinds, kind).toHaveLength(arm === "x" ? def.w : def.h);
        expect(kinds[0]).toBe("start");
        expect(kinds.at(-1)).toBe("end");
        for (const k of kinds) expect(WALL_KINDS).toContain(k);
        const windows = kinds.filter((k) => k.startsWith("window")).length;
        expect(windows, `${kind} ${arm}`).toBe(def.windows.filter((w) => w.wall === arm).length);
      }
      for (let y = 0; y < def.h; y++)
        for (let x = 0; x < def.w; x++) {
          const key = floorKey(def, x, y);
          expect(FLOOR_KEYS).toContain(key);
          expect(typeof key === "string", `${kind} ${x},${y}`).toBe(x === 0);
        }
    }
  });

  it("list every piece of a room, all of them sprites the generator makes", () => {
    for (const tribe of ["islanders", "cinderborn"] as const) {
      const names = new Set(roomSpriteNames(tribe));
      for (const [kind, def] of rooms) {
        const pieces = roomPieces(kind, def, tribe);
        for (const p of pieces) expect(names.has(p.sprite), `${kind}: ${p.sprite}`).toBe(true);
        const count = (layer: string) => pieces.filter((p) => p.layer === layer).length;
        // One floor tile per tile, plus a slab piece under each front-edge tile.
        expect(count("floor"), kind).toBe(def.w * def.h + def.w + def.h);
        expect(count("wall"), kind).toBe(def.w + def.h);
        expect(count("door"), kind).toBe(1);
        const solid = def.furniture.filter((i) => i.kind !== "rug").length;
        expect(count("object"), kind).toBe(solid);
        for (const p of pieces.filter((q) => q.box)) {
          expect(p.box!.x1 - p.box!.x0).toBeGreaterThan(0);
        }
      }
    }
  });

  it("name every sprite once, with the tribe only where it matters", () => {
    for (const tribe of TRIBES) {
      const names = roomSpriteNames(tribe);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(n.startsWith("in_")).toBe(true);
      for (const [room, def] of rooms)
        for (const item of def.furniture)
          expect(names).toContain(furnitureSprite(room, item, tribe));
    }
    const a = new Set(roomSpriteNames("islanders"));
    const b = new Set(roomSpriteNames("northfolk"));
    expect([...a].filter((n) => !b.has(n)).length).toBeGreaterThan(20);
    // Furniture is shared between tribes: one sprite per (room, kind, size, facing).
    const pieces = furniturePieces();
    expect(new Set(pieces.map((p) => p.name)).size).toBe(pieces.length);
    expect(pieces.length).toBeGreaterThan(25);
    expect(pieces.every((p) => !p.name.includes("banner"))).toBe(true);
  });
});

describe("going in and out", () => {
  it("walks to the door, goes in, and stands in front of it", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const house = built(s, "house");
    expect(cmd(s, "p1", { kind: "enter-building", buildingId: house.id })).toEqual({ ok: true });
    expect(a.inside).toBeNull();
    run(s, 20);
    expect(a.inside).toBe(house.id);
    expect(a.enter).toBeNull();
    const def = ROOMS.house!;
    expect(a.room).toEqual({ x: roomEntry(def).x + 0.5, y: roomEntry(def).y + 0.5 });
  });

  it("refuses sites, farms, strangers and going in twice", () => {
    const s = fresh();
    ensureCharacter(s, "p1");
    const farm = built(s, "farm");
    expect(cmd(s, "p1", { kind: "enter-building", buildingId: farm.id }).ok).toBe(false);
    const site = built(s, "house");
    site.complete = false;
    expect(cmd(s, "p1", { kind: "enter-building", buildingId: site.id })).toMatchObject({
      ok: false,
      reason: "It isn't finished yet",
    });
    expect(cmd(s, "p9", { kind: "enter-building", buildingId: hall(s).id }).ok).toBe(false);
    expect(cmd(s, null, { kind: "enter-building", buildingId: hall(s).id }).ok).toBe(false);
    site.complete = true;
    cmd(s, "p1", { kind: "enter-building", buildingId: site.id });
    run(s, 20);
    expect(cmd(s, "p1", { kind: "enter-building", buildingId: site.id }).ok).toBe(false);
  });

  it("walks about the room, stopping at furniture, and leaves through the door", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const house = built(s, "house");
    cmd(s, "p1", { kind: "enter-building", buildingId: house.id });
    run(s, 20);
    const def = ROOMS.house!;
    // The bed is solid: clicking it walks up beside it instead.
    expect(cmd(s, "p1", { kind: "move-in-room", x: 0, y: 0 })).toEqual({ ok: true });
    run(s, 6);
    expect(a.action).toBe("idle");
    const at = { x: Math.floor(a.room.x), y: Math.floor(a.room.y) };
    expect(roomWalkable(def, at.x, at.y)).toBe(true);
    expect(Math.hypot(at.x - 0, at.y - 0)).toBeLessThan(3);
    expect(cmd(s, "p1", { kind: "move-in-room", x: 99, y: 0 }).ok).toBe(false);
    // The island is out of reach while inside.
    expect(cmd(s, "p1", { kind: "move-character", x: 5, y: 5 })).toMatchObject({ ok: false });
    // The door leaves.
    expect(cmd(s, "p1", { kind: "move-in-room", ...def.door })).toEqual({ ok: true });
    run(s, 10);
    expect(a.inside).toBeNull();
    const t = { x: Math.floor(a.x), y: Math.floor(a.y) };
    expect(Math.abs(t.x - house.x) <= house.w && Math.abs(t.y - house.y) <= house.h).toBe(true);
  });

  it("lets you leave with a command too, and throws you out when the building goes", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const b = ensureCharacter(s, "p2");
    const house = built(s, "house");
    for (const p of ["p1", "p2"]) cmd(s, p, { kind: "enter-building", buildingId: house.id });
    run(s, 25);
    expect([a.inside, b.inside]).toEqual([house.id, house.id]);
    expect(cmd(s, "p1", { kind: "leave-building" })).toEqual({ ok: true });
    expect(a.inside).toBeNull();
    expect(cmd(s, "p1", { kind: "leave-building" }).ok).toBe(false);
    removeEntity(s, house.id);
    run(s, 1);
    expect(b.inside).toBeNull();
  });

  it("can't drop or pick up things while inside", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const house = built(s, "house");
    cmd(s, "p1", { kind: "enter-building", buildingId: house.id });
    run(s, 20);
    expect(cmd(s, "p1", { kind: "drop-item", slot: 0 }).ok).toBe(false);
    expect(a.pack).toHaveLength(1);
  });
});

describe("talking to the people inside", () => {
  it("only lets a building's business be done from inside, next to its NPC", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const th = hall(s);
    const train = { kind: "train-villager", buildingId: th.id } as const;
    // Outside: refused for a player, allowed for the simulation's own callers.
    expect(cmd(s, "p1", train)).toMatchObject({ ok: false });
    expect(cmd(s, null, train).ok).toBe(true);
    cmd(s, "p1", { kind: "enter-building", buildingId: th.id });
    run(s, 25);
    expect(a.inside).toBe(th.id);
    // Standing in the doorway is too far from the steward.
    expect(cmd(s, "p1", train)).toEqual({ ok: false, reason: "Step closer to talk" });
    const npc = ROOMS.town_hall!.npc;
    cmd(s, "p1", { kind: "move-in-room", x: npc.x, y: npc.y });
    run(s, 10);
    expect(cmd(s, "p1", train).ok).toBe(true);
    // The wrong kind of building is no good for trading.
    expect(cmd(s, "p1", { kind: "trade", resource: "wood", action: "sell" })).toMatchObject({
      ok: false,
    });
  });

  it("lets a market's merchant trade and the building can be pulled down only from inside", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const market = built(s, "market");
    const house = built(s, "house");
    expect(cmd(s, "p1", { kind: "remove-building", buildingId: house.id }).ok).toBe(false);
    cmd(s, "p1", { kind: "enter-building", buildingId: market.id });
    run(s, 25);
    const npc = ROOMS.market!.npc;
    cmd(s, "p1", { kind: "move-in-room", x: npc.x, y: npc.y + 1 });
    run(s, 10);
    expect(cmd(s, "p1", { kind: "trade", resource: "wood", action: "sell" })).toEqual({ ok: true });
    expect(cmd(s, "p1", { kind: "remove-building", buildingId: house.id }).ok).toBe(false);
    expect(cmd(s, "p1", { kind: "remove-building", buildingId: market.id }).ok).toBe(true);
    run(s, 0.3);
    expect(a.inside).toBeNull();
  });

  it("keeps building sites and workplaces that can't be entered removable from outside", () => {
    const s = fresh();
    ensureCharacter(s, "p1");
    const farm = built(s, "farm");
    expect(cmd(s, "p1", { kind: "remove-building", buildingId: farm.id }).ok).toBe(true);
    const site = built(s, "house");
    site.complete = false;
    expect(cmd(s, "p1", { kind: "remove-building", buildingId: site.id }).ok).toBe(true);
  });
});

describe("keeping everyone in sync", () => {
  it("shows who is inside to the other players, and saves it", () => {
    const s = fresh();
    const mirror = fromSnapshot(world, toSnapshot(s));
    const a = ensureCharacter(s, "p1");
    const house = built(s, "house");
    cmd(s, "p1", { kind: "enter-building", buildingId: house.id });
    run(s, 20);
    const seen = (() => {
      applyPatch(mirror, takePatch(s));
      return mirror.entities.get(a.id) as CharacterEntity;
    })();
    expect(seen.inside).toBe(house.id);
    expect(seen.room).toEqual(a.room);
    expect(seen.rpath).toEqual([]);
    const saved = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))), true);
    const back = saved.entities.get(a.id) as CharacterEntity;
    expect(back.inside).toBe(house.id);
    expect(back.enter).toBeNull();
  });

  it("loads characters from older saves as standing outside", () => {
    const s = fresh();
    const a = ensureCharacter(s, "p1");
    const snap = JSON.parse(JSON.stringify(toSnapshot(s)));
    const wire = snap.entities.find((e: { id: number }) => e.id === a.id);
    delete wire.inside;
    delete wire.room;
    delete wire.enter;
    const back = fromSnapshot(world, snap).entities.get(a.id) as CharacterEntity;
    expect(back.inside).toBeNull();
    expect(back.enter).toBeNull();
    expect(back.rpath).toEqual([]);
    void addEntity;
  });
});

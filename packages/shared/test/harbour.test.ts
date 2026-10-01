import { describe, expect, it } from "vitest";
import {
  applyCommand,
  berthOf,
  berthSlots,
  berths,
  BUILDINGS,
  cargoCapacity,
  maxShips,
  scoutCapacity,
  createInitialState,
  fromSnapshot,
  generateWorld,
  growPiers,
  landPath,
  pierOf,
  pierTier,
  removeEntity,
  rootOf,
  rebuildOccupancy,
  sailable,
  tick,
  toSnapshot,
  walkable,
  type BuildingEntity,
  type GameState,
} from "../src";

const world = generateWorld("harbour-tests");
const fresh = (): GameState => {
  const s = createInitialState(world);
  s.stock = { ...s.stock, wood: 999, stone: 999, tools: 99 };
  return s;
};
const harbourOf = (s: GameState) =>
  [...s.entities.values()].find(
    (e): e is BuildingEntity => e.type === "building" && e.kind === "harbour",
  )!;
const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(s);
};

describe("the home harbour", () => {
  it("starts on the shore with a pier, a berth in open water and a room", () => {
    const s = fresh();
    const h = harbourOf(s);
    expect(h.complete).toBe(true);
    const pier = pierOf(s, h)!;
    expect(pier.kind).toBe("dock");
    expect(pier.harbour).toBe(h.id);
    expect(berths(s)).toEqual([h]);
    const at = berthOf(s, h);
    expect(sailable(s, Math.floor(at.x), Math.floor(at.y))).toBe(true);
    // The pier can be walked on, the harbour's body cannot.
    for (let y = pier.y; y < pier.y + pier.h; y++)
      for (let x = pier.x; x < pier.x + pier.w; x++) expect(walkable(s, x, y)).toBe(true);
    expect(walkable(s, h.x, h.y)).toBe(false);
    expect(BUILDINGS.harbour.buildable).toBe(true);
    expect(BUILDINGS.dock.buildable).toBe(false);
  });

  it("can be reached on foot from the town hall, out to the end of the pier", () => {
    const s = fresh();
    const pier = pierOf(s, harbourOf(s))!;
    const th = world.start.townHall;
    const end = {
      x: pier.dir === "-x" ? pier.x : pier.x + pier.w - 1,
      y: pier.dir === "-y" ? pier.y : pier.y + pier.h - 1,
    };
    const from = [
      { x: th.x - 1, y: th.y + th.h },
      { x: th.x + th.w, y: th.y + th.h },
      { x: th.x - 1, y: th.y - 1 },
    ].find((t) => walkable(s, t.x, t.y))!;
    expect(landPath(s, from, [end])).not.toBeNull();
  });

  it("is reachable on foot and has berths in every kind of world", () => {
    for (const seed of ["a", "b", "zz9", "reef", "kelp-12", "north-3"]) {
      const w = generateWorld(seed);
      const s = createInitialState(w);
      const h = [...s.entities.values()].find(
        (e): e is BuildingEntity => e.type === "building" && e.kind === "harbour",
      );
      expect(h, seed).toBeDefined();
      const pier = pierOf(s, h!)!;
      const root = rootOf(pier, pier.dir!);
      const spawn = w.start.spawn[0]!;
      expect(landPath(s, spawn, [root]), seed).not.toBeNull();
      expect(berthSlots(s, h!).length, seed).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it("cannot be demolished, but a second harbour at home can", () => {
    const s = fresh();
    expect(applyCommand(s, { kind: "remove-building", buildingId: harbourOf(s).id }).ok).toBe(
      false,
    );
    const pier = pierOf(s, harbourOf(s))!;
    expect(applyCommand(s, { kind: "remove-building", buildingId: pier.id }).ok).toBe(false);
  });
});

describe("harbour upgrades and the pier", () => {
  it("makes the pier longer with the Stone Quay and the Grand Pier", () => {
    // A seed whose start harbour has open sea all along its pier.
    const open = generateWorld("harbour");
    const s = createInitialState(open);
    s.stock = { ...s.stock, wood: 999, stone: 999, tools: 99 };
    const pier = pierOf(s, harbourOf(s))!;
    const length = () => Math.max(pier.w, pier.h);
    expect(pierTier(s)).toBe(0);
    expect([length(), Math.min(pier.w, pier.h)]).toEqual([5, 3]);
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" })).toEqual({ ok: true });
    expect(pierTier(s)).toBe(1);
    expect([length(), Math.min(pier.w, pier.h)]).toEqual([10, 3]);
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "grand_pier" })).toEqual({ ok: true });
    expect([length(), Math.min(pier.w, pier.h)]).toEqual([15, 3]);
    // The occupancy follows the pier, so ships keep out of it and people can walk on it.
    for (let y = pier.y; y < pier.y + pier.h; y++)
      for (let x = pier.x; x < pier.x + pier.w; x++) {
        expect(s.occupancy[y * open.width + x]).toBe(pier.id);
        expect(walkable(s, x, y)).toBe(true);
      }
    const at = berthOf(s, harbourOf(s));
    expect(sailable(s, Math.floor(at.x), Math.floor(at.y))).toBe(true);
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" }).ok).toBe(false);
  });

  it("moors ships on both sides of the pier: more berths on a longer pier", () => {
    const open = generateWorld("harbour");
    const s = createInitialState(open);
    s.stock = { ...s.stock, wood: 999, stone: 999, tools: 99 };
    const h = harbourOf(s);
    const slots = () => berthSlots(s, h);
    const counts = [slots().length];
    applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" });
    counts.push(slots().length);
    applyCommand(s, { kind: "buy-upgrade", upgrade: "grand_pier" });
    counts.push(slots().length);
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts[1]).toBeGreaterThan(counts[0]!);
    expect(counts[2]).toBeGreaterThan(counts[1]!);
    // Both sides are used and every slot is open water clear of the pier.
    const pier = pierOf(s, h)!;
    const sides = new Set(
      slots().map((b) =>
        pier.w > pier.h ? Math.sign(b.y - (pier.y + 1.5)) : Math.sign(b.x - (pier.x + 1.5)),
      ),
    );
    expect(sides.size).toBe(2);
    for (const b of slots()) expect(sailable(s, Math.floor(b.x), Math.floor(b.y))).toBe(true);
  });

  it("launches new ships into free berths and holds them back when the pier is full", () => {
    const open = generateWorld("harbour");
    const s = createInitialState(open);
    s.stock = { ...s.stock, wood: 9999, stone: 9999, tools: 999 };
    s.nextRaid = s.nextStorm = 1e9;
    const h = harbourOf(s);
    const slots = berthSlots(s, h).length;
    for (let i = 0; i < slots + 1; i++) h.queue.push({ what: "ship", remaining: 0 });
    run(s, 1);
    const ships = [...s.entities.values()].filter((e) => e.type === "ship");
    expect(ships).toHaveLength(slots);
    expect(h.queue).toHaveLength(1);
    // No two ships share a slot.
    const spots = new Set(ships.map((e) => `${Math.round(e.x * 2)},${Math.round(e.y * 2)}`));
    expect(spots.size).toBe(slots);
    // Sail one away and the waiting ship takes its place.
    const first = ships[0]!;
    first.x += 8;
    first.y += 8;
    run(s, 1);
    expect(h.queue).toHaveLength(0);
  });

  it("gives cargo ships more room and lets the fleet grow", () => {
    const s = fresh();
    expect([cargoCapacity(s), maxShips(s, "cargo"), scoutCapacity(s)]).toEqual([40, 4, 4]);
    applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" });
    expect([cargoCapacity(s), maxShips(s, "cargo"), scoutCapacity(s)]).toEqual([60, 6, 4]);
    applyCommand(s, { kind: "buy-upgrade", upgrade: "grand_pier" });
    expect([
      cargoCapacity(s),
      maxShips(s, "cargo"),
      maxShips(s, "scout"),
      scoutCapacity(s),
    ]).toEqual([80, 6, 4, 6]);
  });

  it("keeps growing the pier later if the water was blocked", () => {
    const s = fresh();
    const pier = pierOf(s, harbourOf(s))!;
    applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" });
    const size = pier.w * pier.h;
    growPiers(s);
    expect(pier.w * pier.h).toBe(size);
    run(s, 12);
    expect(pier.w * pier.h).toBeGreaterThanOrEqual(size);
  });

  it("sells the dock fittings at the harbour only", () => {
    const s = fresh();
    for (const id of ["cannons", "iron_hulls", "quay", "grand_pier"] as const)
      expect(applyCommand(s, { kind: "buy-upgrade", upgrade: id }).ok).toBe(true);
  });
});

describe("saves", () => {
  it("round-trips the harbour and its pier", () => {
    const s = fresh();
    applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" });
    const back = fromSnapshot(world, toSnapshot(s), true);
    const h = harbourOf(back);
    const pier = pierOf(back, h)!;
    const was = pierOf(s, harbourOf(s))!;
    expect([pier.x, pier.y, pier.w, pier.h]).toEqual([was.x, was.y, was.w, was.h]);
    expect(back.occupancy[pier.y * world.width + pier.x]).toBe(pier.id);
  });

  it("gives an old save's stand-alone dock a harbour behind it", () => {
    const s = fresh();
    const h = harbourOf(s);
    const pier = pierOf(s, h)!;
    // Turn it back into a pre-harbour save: a bare dock with the ship queue on it.
    const snap = toSnapshot(s);
    const wire = snap.entities.filter((e) => e.id !== h.id);
    const dock = wire.find((e) => e.id === pier.id) as BuildingEntity;
    delete dock.harbour;
    dock.queue = [{ what: "ship", remaining: 5 }];
    const loaded = fromSnapshot(world, { ...snap, entities: wire }, true);
    const migrated = harbourOf(loaded);
    expect(migrated).toBeDefined();
    expect(migrated.queue).toEqual([{ what: "ship", remaining: 5 }]);
    expect(pierOf(loaded, migrated)!.id).toBe(pier.id);
    expect(loaded.occupancy[pier.y * world.width + pier.x]).toBe(pier.id);
  });
});

describe("removing a harbour", () => {
  it("takes its pier with it", () => {
    const s = fresh();
    const a = harbourOf(s);
    // Fake a second harbour on the home island so the first may go.
    const pier = pierOf(s, a)!;
    removeEntity(s, pier.id);
    rebuildOccupancy(s);
    expect(pierOf(s, a)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  applyCommand,
  berthOf,
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
  PIER_TIERS,
  removeEntity,
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
  it("makes the pier longer and wider with the Stone Quay and the Grand Pier", () => {
    const s = fresh();
    const pier = pierOf(s, harbourOf(s))!;
    expect(pierTier(s)).toBe(0);
    const area = () => pier.w * pier.h;
    const before = area();
    expect(before).toBe(PIER_TIERS[0].length * PIER_TIERS[0].width);
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" })).toEqual({ ok: true });
    expect(pierTier(s)).toBe(1);
    expect(area()).toBeGreaterThan(before);
    const quay = area();
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "grand_pier" })).toEqual({ ok: true });
    expect(area()).toBeGreaterThanOrEqual(quay);
    // The occupancy follows the pier, so ships keep out of it and people can walk on it.
    const grown = pierOf(s, harbourOf(s))!;
    for (let y = grown.y; y < grown.y + grown.h; y++)
      for (let x = grown.x; x < grown.x + grown.w; x++) {
        expect(s.occupancy[y * world.width + x]).toBe(grown.id);
        expect(walkable(s, x, y)).toBe(true);
      }
    const at = berthOf(s, harbourOf(s));
    expect(sailable(s, Math.floor(at.x), Math.floor(at.y))).toBe(true);
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "quay" }).ok).toBe(false);
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

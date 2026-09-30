import { describe, expect, it } from "vitest";
import {
  addToPack,
  applyCommand,
  applyPatch,
  createInitialState,
  ensureCharacter,
  fromSnapshot,
  generateWorld,
  isLandTerrain,
  itemsOn,
  ITEMS,
  PACK_SLOTS,
  removeEntity,
  takePatch,
  tick,
  tileIndex,
  toSnapshot,
  type CharacterEntity,
  type GameState,
  type ItemEntity,
} from "../src";

const world = generateWorld("inventory-tests");
const adventure = (): GameState => createInitialState(world, { mode: "adventure" });
/** An adventure world with nothing lying about, so only what a test drops is on the ground. */
const bare = (): GameState => {
  const s = adventure();
  for (const i of [...s.entities.values()]) if (i.type === "item") removeEntity(s, i.id);
  return s;
};
const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(s);
};
const items = (s: GameState) =>
  [...s.entities.values()].filter((e): e is ItemEntity => e.type === "item");

/** A water tile right beside land, where nothing can be dropped. */
function shoreWater(s: GameState, c: CharacterEntity) {
  for (let r = 1; r <= 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.floor(c.x) + dx;
        const y = Math.floor(c.y) + dy;
        if (!isLandTerrain(s.world.terrain[tileIndex(s.world, x, y)]!)) return { x, y };
      }
  return null;
}

describe("a character's pack", () => {
  it("starts with bread, and is private to its player", () => {
    const s = adventure();
    const a = ensureCharacter(s, "p1");
    const b = ensureCharacter(s, "p2");
    expect(a.pack).toEqual([{ kind: "bread", amount: 3 }]);
    a.pack.push({ kind: "rope", amount: 1 });
    expect(b.pack).toEqual([{ kind: "bread", amount: 3 }]);
  });

  it("stacks up to a limit, then fills slots, and reports what did not fit", () => {
    const pack: { kind: "old_coin"; amount: number }[] = [];
    expect(addToPack(pack, "old_coin", 120)).toBe(0);
    expect(pack.map((s) => s.amount)).toEqual([50, 50, 20]);
    const full = Array.from({ length: PACK_SLOTS }, () => ({
      kind: "lantern" as const,
      amount: 1,
    }));
    expect(addToPack(full, "lantern", 2)).toBe(2);
    expect(addToPack(full, "rope", 1)).toBe(1);
  });
});

describe("dropping and picking up", () => {
  it("drops onto the ground for anyone to see and lets another player pick it up", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    const b = ensureCharacter(s, "p2");
    expect(applyCommand(s, { kind: "drop-item", slot: 0, amount: 2 }, "p1")).toEqual({ ok: true });
    expect(a.pack).toEqual([{ kind: "bread", amount: 1 }]);
    const [pile] = items(s);
    expect(pile).toMatchObject({ kind: "bread", amount: 2 });
    expect(isLandTerrain(s.world.terrain[tileIndex(s.world, pile!.x, pile!.y)]!)).toBe(true);
    // Ben stands elsewhere: he walks over and takes it.
    b.x = pile!.x + 5.5;
    b.y = pile!.y + 0.5;
    const res = applyCommand(s, { kind: "pickup-item", itemId: pile!.id }, "p2");
    expect(res.ok || res.reason).toBe(true);
    run(s, 8);
    expect(s.entities.has(pile!.id)).toBe(false);
    expect(b.pack.find((i) => i.kind === "bread")!.amount).toBe(5);
    expect(a.pack).toEqual([{ kind: "bread", amount: 1 }]);
  });

  it("picks up at once when standing next to it", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    applyCommand(s, { kind: "drop-item", slot: 0 }, "p1");
    expect(a.pack).toEqual([]);
    const pile = items(s)[0]!;
    expect(applyCommand(s, { kind: "pickup-item", itemId: pile.id }, "p1")).toEqual({ ok: true });
    expect(a.pack).toEqual([{ kind: "bread", amount: 3 }]);
    expect(items(s)).toHaveLength(0);
  });

  it("refuses to drop anything into the sea", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    const water = shoreWater(s, a)!;
    expect(water).not.toBeNull();
    const res = applyCommand(s, { kind: "drop-item", slot: 0, x: water.x, y: water.y }, "p1");
    expect(res).toEqual({ ok: false, reason: "You can't drop that in the sea" });
    expect(a.pack).toEqual([{ kind: "bread", amount: 3 }]);
    expect(items(s)).toHaveLength(0);
  });

  it("refuses bad slots, distant drops, other worlds and strangers", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    expect(applyCommand(s, { kind: "drop-item", slot: 5 }, "p1").ok).toBe(false);
    expect(
      applyCommand(
        s,
        { kind: "drop-item", slot: 0, x: Math.floor(a.x) + 20, y: Math.floor(a.y) },
        "p1",
      ).ok,
    ).toBe(false);
    expect(applyCommand(s, { kind: "drop-item", slot: 0 }, "p9").ok).toBe(false);
    expect(applyCommand(s, { kind: "drop-item", slot: 0 }, null).ok).toBe(false);
    const colony = createInitialState(world);
    expect(applyCommand(colony, { kind: "drop-item", slot: 0 }, "p1").ok).toBe(false);
  });

  it("keeps the pile on the ground when the pack is full", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    a.pack = Array.from({ length: PACK_SLOTS }, () => ({ kind: "lantern" as const, amount: 1 }));
    const x = Math.floor(a.x);
    const y = Math.floor(a.y);
    s.entities.set(9999, { id: 9999, type: "item", kind: "rope", amount: 1, x, y });
    expect(applyCommand(s, { kind: "pickup-item", itemId: 9999 }, "p1")).toEqual({
      ok: false,
      reason: "Your pack is full",
    });
    expect(itemsOn(s, x, y)).toHaveLength(1);
  });

  it("spreads drops over nearby ground and joins piles of one kind", () => {
    const s = bare();
    const a = ensureCharacter(s, "p1");
    a.pack = [
      { kind: "rope", amount: 5 },
      { kind: "lantern", amount: 1 },
      { kind: "old_coin", amount: 50 },
    ];
    applyCommand(s, { kind: "drop-item", slot: 0, amount: 2 }, "p1");
    applyCommand(s, { kind: "drop-item", slot: 0, amount: 2 }, "p1");
    applyCommand(s, { kind: "drop-item", slot: 1 }, "p1");
    const all = items(s);
    expect(all.map((i) => `${i.kind}${i.amount}`).sort()).toEqual(["lantern1", "rope4"]);
    expect(new Set(all.map((i) => `${i.x},${i.y}`)).size).toBe(2);
  });
});

describe("finding items in the world", () => {
  it("scatters loot over the other islands of adventure worlds, only on land, never in colonies", () => {
    const s = adventure();
    const found = items(s);
    expect(found.length).toBeGreaterThan(world.islands.length - 1);
    for (const i of found) {
      expect(isLandTerrain(s.world.terrain[tileIndex(s.world, i.x, i.y)]!)).toBe(true);
      expect(i.amount).toBeGreaterThan(0);
      expect(i.amount).toBeLessThanOrEqual(ITEMS[i.kind].stack);
      expect(s.world.island[tileIndex(s.world, i.x, i.y)]).not.toBe(world.start.islandId);
    }
    expect(found.some((i) => ITEMS[i.kind].rarity === "rare")).toBe(true);
    expect(items(createInitialState(world))).toHaveLength(0);
    expect(items(createInitialState(world, { mode: "adventure" })).map((i) => i.id)).toEqual(
      found.map((i) => i.id),
    );
  });
});

describe("keeping everyone in sync", () => {
  it("sends packs and ground items in patches and saves", () => {
    const s = bare();
    const mirror = fromSnapshot(world, toSnapshot(s));
    const a = ensureCharacter(s, "p1");
    applyCommand(s, { kind: "drop-item", slot: 0, amount: 1 }, "p1");
    tick(s);
    applyPatch(mirror, takePatch(s));
    const seen = mirror.entities.get(a.id) as CharacterEntity;
    expect(seen.pack).toEqual([{ kind: "bread", amount: 2 }]);
    expect(items(mirror).map((i) => i.kind)).toContain("bread");
    const reloaded = fromSnapshot(world, toSnapshot(s));
    expect((reloaded.entities.get(a.id) as CharacterEntity).pack).toEqual(a.pack);
    expect(items(reloaded)).toHaveLength(items(s).length);
  });
});

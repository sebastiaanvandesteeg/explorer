import { describe, expect, it } from "vitest";
import {
  applyCommand,
  applyPatch,
  BUILDINGS,
  canPlaceBuilding,
  createInitialState,
  fromSnapshot,
  generateWorld,
  harvestSeconds,
  population,
  populationCap,
  shipCost,
  takePatch,
  tick,
  toSnapshot,
  toWire,
  type BuildingEntity,
  type BuildingKind,
  type GameState,
  type NodeEntity,
  type ShipEntity,
  type VillagerEntity,
} from "../src";

const world = generateWorld("sim-tests");

function fresh(): GameState {
  return createInitialState(world);
}

function run(state: GameState, seconds: number, each?: () => void): void {
  const ticks = Math.round(seconds / 0.1);
  for (let i = 0; i < ticks; i++) {
    tick(state);
    each?.();
  }
}

const of = <T extends { type: string }>(state: GameState, type: T["type"]) =>
  [...state.entities.values()].filter((e) => e.type === type) as unknown as T[];

function hall(state: GameState): BuildingEntity {
  return of<BuildingEntity>(state, "building").find((b) => b.kind === "town_hall")!;
}

/** Nearest valid placement for a building, spiralling out from the town hall. */
function spotFor(state: GameState, kind: BuildingKind): { x: number; y: number } {
  const h = hall(state);
  for (let r = 3; r < 20; r++) {
    for (let y = h.y - r; y <= h.y + r; y++)
      for (let x = h.x - r; x <= h.x + r; x++) {
        if (canPlaceBuilding(state, kind, x, y).ok) return { x, y };
      }
  }
  throw new Error(`no spot for ${kind}`);
}

function nearestNode(state: GameState, kinds: string[]): NodeEntity {
  const h = hall(state);
  return of<NodeEntity>(state, "node")
    .filter(
      (n) =>
        kinds.includes(n.kind) && world.island[n.y * world.width + n.x] === world.start.islandId,
    )
    .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]!;
}

describe("initial state", () => {
  it("starts with a hall, a dock, three villagers and the home island explored", () => {
    const s = fresh();
    const buildings = of<BuildingEntity>(s, "building");
    expect(buildings.map((b) => b.kind).sort()).toEqual(["dock", "town_hall"]);
    expect(population(s)).toBe(3);
    expect(populationCap(s)).toBe(5);
    expect(s.stock).toEqual({
      wood: 50,
      stone: 30,
      food: 40,
      ore: 0,
      tools: 0,
      gold: 0,
      faith: 0,
      crystal: 0,
    });
    expect(of(s, "node").length).toBe(world.nodes.length);
    const th = world.start.townHall;
    expect(s.explored[th.y * world.width + th.x]).toBe(1);
    expect(s.explored.reduce((a, b) => a + b, 0)).toBeLessThan(s.explored.length / 4);
  });
});

describe("placement", () => {
  it("accepts flat free land and charges the cost", () => {
    const s = fresh();
    const at = spotFor(s, "house");
    expect(applyCommand(s, { kind: "place-building", building: "house", ...at })).toEqual({
      ok: true,
    });
    expect(s.stock.wood).toBe(50 - BUILDINGS.house.cost.wood!);
    expect(s.stock.stone).toBe(30 - BUILDINGS.house.cost.stone!);
  });

  it("rejects water, occupied tiles and unaffordable buildings", () => {
    const s = fresh();
    const d = world.start.dock;
    expect(canPlaceBuilding(s, "house", d.x, d.y).ok).toBe(false);
    const th = world.start.townHall;
    expect(canPlaceBuilding(s, "house", th.x, th.y)).toMatchObject({ ok: false });
    s.stock.wood = 0;
    const at = spotFor({ ...s, stock: { wood: 99, stone: 99, food: 99 } } as GameState, "house");
    expect(canPlaceBuilding(s, "house", at.x, at.y)).toEqual({
      ok: false,
      reason: "Not enough resources",
    });
  });

  it("refunds a cancelled construction site", () => {
    const s = fresh();
    const at = spotFor(s, "storehouse");
    applyCommand(s, { kind: "place-building", building: "storehouse", ...at });
    const site = of<BuildingEntity>(s, "building").find((b) => b.kind === "storehouse")!;
    expect(applyCommand(s, { kind: "remove-building", buildingId: site.id })).toEqual({ ok: true });
    expect(s.stock.wood).toBe(50);
  });
});

describe("villager work", () => {
  it("chops a marked tree, hauls the wood home and leaves a stump", () => {
    const s = fresh();
    const tree = nearestNode(s, ["oak", "pine"]);
    const amount = tree.amount;
    applyCommand(s, { kind: "mark", nodeIds: [tree.id], marked: true });
    run(s, 90);
    expect(s.stock.wood).toBeGreaterThanOrEqual(50 + amount);
    expect(tree.stage).toBe("stump");
    expect(tree.marked).toBe(false);
  });

  it("builds a house, which raises the population cap", () => {
    const s = fresh();
    const at = spotFor(s, "house");
    applyCommand(s, { kind: "place-building", building: "house", ...at });
    run(s, 40);
    const house = of<BuildingEntity>(s, "building").find((b) => b.kind === "house")!;
    expect(house.complete).toBe(true);
    expect(populationCap(s)).toBe(9);
  });

  it("trains a villager at the town hall", () => {
    const s = fresh();
    expect(applyCommand(s, { kind: "train-villager", buildingId: hall(s).id })).toEqual({
      ok: true,
    });
    expect(s.stock.food).toBe(20);
    run(s, 11);
    expect(population(s)).toBe(4);
  });

  it("refuses to train beyond the population cap", () => {
    const s = fresh();
    const h = hall(s);
    s.stock.food = 1000;
    expect(applyCommand(s, { kind: "train-villager", buildingId: h.id }).ok).toBe(true);
    expect(applyCommand(s, { kind: "train-villager", buildingId: h.id }).ok).toBe(true);
    expect(applyCommand(s, { kind: "train-villager", buildingId: h.id })).toEqual({
      ok: false,
      reason: "Build more houses first",
    });
  });

  it("staffs a lumber camp that fells trees without marking", () => {
    const s = fresh();
    s.stock = { ...s.stock, wood: 500, stone: 500, food: 500 };
    const tree = nearestNode(s, ["oak", "pine"]);
    // Put the camp as close as possible to a tree.
    let at: { x: number; y: number } | null = null;
    for (let r = 1; r < 8 && !at; r++)
      for (let y = tree.y - r; y <= tree.y + r && !at; y++)
        for (let x = tree.x - r; x <= tree.x + r && !at; x++)
          if (canPlaceBuilding(s, "lumber_camp", x, y).ok) at = { x, y };
    applyCommand(s, { kind: "place-building", building: "lumber_camp", ...at! });
    const woodAfterPlacing = s.stock.wood;
    run(s, 150);
    const camp = of<BuildingEntity>(s, "building").find((b) => b.kind === "lumber_camp")!;
    expect(camp.complete).toBe(true);
    expect(camp.workerId).not.toBeNull();
    expect(s.stock.wood).toBeGreaterThan(woodAfterPlacing);
  });

  it("follows a direct assignment to gather berries", () => {
    const s = fresh();
    const bush = nearestNode(s, ["berry", "fruit"]);
    const v = of<VillagerEntity>(s, "villager")[0]!;
    expect(
      applyCommand(s, { kind: "assign", villagerId: v.id, target: { node: bush.id } }),
    ).toEqual({ ok: true });
    run(s, 80);
    expect(s.stock.food).toBeGreaterThan(40);
  });
});

describe("ships", () => {
  it("launches a ship from the dock and reveals the sea as it sails", () => {
    const s = fresh();
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "dock")!;
    expect(applyCommand(s, { kind: "build-ship", buildingId: dock.id })).toEqual({ ok: true });
    run(s, 21);
    const ship = of<ShipEntity>(s, "ship")[0]!;
    expect(ship).toBeDefined();
    const before = s.explored.reduce((a, b) => a + b, 0);
    // Sail towards the far corner of the map.
    const target = { x: world.width - 6, y: world.height - 6 };
    const res = applyCommand(s, { kind: "move-ship", shipId: ship.id, ...target });
    expect(res.ok).toBe(true);
    run(s, 20);
    const after = s.explored.reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before + 200);
  });
});

describe("snapshots and patches", () => {
  it("round-trips through JSON", () => {
    const s = fresh();
    run(s, 5);
    const snap = JSON.parse(JSON.stringify(toSnapshot(s)));
    const restored = fromSnapshot(world, snap, true);
    expect(restored.entities.size).toBe(s.entities.size);
    expect(restored.stock).toEqual(s.stock);
    expect([...restored.explored]).toEqual([...s.explored]);
    expect([...restored.occupancy]).toEqual([...s.occupancy]);
  });

  it("keeps a client mirror in sync with patches", () => {
    const server = fresh();
    const client = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(server))));
    const tree = nearestNode(server, ["oak", "pine"]);
    applyCommand(server, { kind: "mark", nodeIds: [tree.id], marked: true });
    applyCommand(server, {
      kind: "place-building",
      building: "house",
      ...spotFor(server, "house"),
    });
    run(server, 60, () => applyPatch(client, JSON.parse(JSON.stringify(takePatch(server)))));
    expect(client.stock).toEqual(server.stock);
    expect(client.entities.size).toBe(server.entities.size);
    // Countdown timers only travel with other changes; everything else must match exactly.
    const comparable = (e: Parameters<typeof toWire>[0]) => {
      const w = toWire(e) as unknown as Record<string, unknown>;
      delete w.timer;
      delete w.workTimer;
      return w;
    };
    for (const e of server.entities.values()) {
      const mirror = client.entities.get(e.id);
      expect(mirror && comparable(mirror)).toEqual(comparable(e));
    }
    expect([...client.explored]).toEqual([...server.explored]);
    expect([...client.occupancy]).toEqual([...server.occupancy]);
  });
});

describe("sailing to an island", () => {
  it("heads for the island's shore when told to sail onto land", () => {
    const s = fresh();
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "dock")!;
    applyCommand(s, { kind: "build-ship", buildingId: dock.id });
    run(s, 21);
    const ship = of<ShipEntity>(s, "ship")[0]!;
    const island = world.islands.find((i) => i.flavor !== "home" && i.flavor !== "islet")!;
    const res = applyCommand(s, {
      kind: "move-ship",
      shipId: ship.id,
      x: Math.round(island.cx),
      y: Math.round(island.cy),
    });
    expect(res).toEqual({ ok: true });
    expect(world.island[ship.dest!.y * world.width + ship.dest!.x]).toBe(island.id);
  });
});

describe("economy", () => {
  /** Build a finished building instantly next to the town hall for economy tests. */
  function instant(s: GameState, kind: BuildingKind): BuildingEntity {
    s.stock = { ...s.stock, wood: 999, stone: 999, tools: 99, gold: 99 };
    const at = spotFor(s, kind);
    expect(applyCommand(s, { kind: "place-building", building: kind, ...at })).toEqual({
      ok: true,
    });
    const b = of<BuildingEntity>(s, "building").find((e) => e.kind === kind)!;
    b.complete = true;
    b.progress = 1;
    return b;
  }

  it("a staffed blacksmith turns ore into tools", () => {
    const s = fresh();
    instant(s, "blacksmith");
    s.stock.ore = 6;
    run(s, 40);
    expect(s.stock.tools).toBeGreaterThanOrEqual(99 + 2);
    expect(s.stock.ore).toBeLessThanOrEqual(2);
  });

  it("a staffed church gathers faith", () => {
    const s = fresh();
    instant(s, "church");
    run(s, 30);
    expect(s.stock.faith).toBeGreaterThanOrEqual(3);
  });

  it("the market buys and sells lots of ten", () => {
    const s = fresh();
    expect(applyCommand(s, { kind: "trade", resource: "wood", action: "sell" })).toMatchObject({
      ok: false,
    });
    instant(s, "market");
    const gold = s.stock.gold;
    const wood = s.stock.wood;
    expect(applyCommand(s, { kind: "trade", resource: "wood", action: "sell" })).toEqual({
      ok: true,
    });
    expect(s.stock.wood).toBe(wood - 10);
    expect(s.stock.gold).toBe(gold + 4);
    expect(applyCommand(s, { kind: "trade", resource: "stone", action: "buy" })).toEqual({
      ok: true,
    });
    expect(s.stock.gold).toBe(gold + 4 - 10);
    expect(applyCommand(s, { kind: "trade", resource: "faith", action: "sell" })).toMatchObject({
      ok: false,
    });
  });

  it("a mine digs nearby ore on its own", () => {
    const s = fresh();
    const ore = nearestNode(s, ["ore"]);
    s.stock = { ...s.stock, wood: 999, stone: 999 };
    let at: { x: number; y: number } | null = null;
    for (let r = 1; r < 9 && !at; r++)
      for (let y = ore.y - r; y <= ore.y + r && !at; y++)
        for (let x = ore.x - r; x <= ore.x + r && !at; x++)
          if (canPlaceBuilding(s, "mine", x, y).ok) at = { x, y };
    applyCommand(s, { kind: "place-building", building: "mine", ...at! });
    run(s, 160);
    expect(s.stock.ore).toBeGreaterThan(0);
  });

  it("gives each tribe its bonus", () => {
    expect(harvestSeconds("oak", "northfolk")).toBeLessThan(harvestSeconds("oak", "islanders"));
    expect(harvestSeconds("boulder", "sunfolk")).toBeLessThan(
      harvestSeconds("boulder", "islanders"),
    );
    expect(harvestSeconds("berry", "sylvan")).toBeLessThan(harvestSeconds("berry", "sunfolk"));
    expect(shipCost("islanders").wood).toBeLessThan(shipCost("northfolk").wood!);
  });
});

describe("settling other islands", () => {
  it("ferries villagers to a new island where they can build", () => {
    const s = fresh();
    s.stock = { ...s.stock, wood: 999, stone: 999 };
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "dock")!;
    applyCommand(s, { kind: "build-ship", buildingId: dock.id });
    run(s, 21);
    const ship = of<ShipEntity>(s, "ship")[0]!;
    // Villagers walk out along the pier and climb aboard.
    expect(applyCommand(s, { kind: "call-aboard", shipId: ship.id })).toEqual({ ok: true });
    expect(applyCommand(s, { kind: "call-aboard", shipId: ship.id })).toEqual({ ok: true });
    run(s, 40);
    expect(ship.passengers).toHaveLength(2);
    // Before landing, the other island is off limits.
    const target = world.islands
      .filter((i) => i.flavor !== "home" && i.flavor !== "islet")
      .sort(
        (a, b) =>
          Math.hypot(a.cx - ship.x, a.cy - ship.y) - Math.hypot(b.cx - ship.x, b.cy - ship.y),
      )[0]!;
    const res = applyCommand(s, {
      kind: "move-ship",
      shipId: ship.id,
      x: Math.round(target.cx),
      y: Math.round(target.cy),
      unload: true,
    });
    expect(res).toEqual({ ok: true });
    run(s, 60);
    expect(ship.passengers).toHaveLength(0);
    const landed = of<VillagerEntity>(s, "villager").filter(
      (v) => world.island[Math.floor(v.y) * world.width + Math.floor(v.x)] === target.id,
    );
    expect(landed).toHaveLength(2);
    // Now the island is settled: build a storehouse and let the settlers raise it.
    let spot: { x: number; y: number } | null = null;
    const v0 = landed[0]!;
    for (let r = 2; r < 12 && !spot; r++)
      for (let y = Math.floor(v0.y) - r; y <= Math.floor(v0.y) + r && !spot; y++)
        for (let x = Math.floor(v0.x) - r; x <= Math.floor(v0.x) + r && !spot; x++)
          if (
            world.island[y * world.width + x] === target.id &&
            canPlaceBuilding(s, "storehouse", x, y).ok
          )
            spot = { x, y };
    expect(spot).not.toBeNull();
    applyCommand(s, { kind: "place-building", building: "storehouse", ...spot! });
    run(s, 40);
    const store = of<BuildingEntity>(s, "building").find((b) => b.kind === "storehouse")!;
    expect(store.complete).toBe(true);
  });
});

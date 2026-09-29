import { describe, expect, it } from "vitest";
import {
  applyCommand,
  addEntity,
  addGoods,
  applyPatch,
  BUILDINGS,
  canPlaceBuilding,
  createInitialState,
  dockSpawn,
  fromSnapshot,
  generateWorld,
  harvestSeconds,
  isLandTerrain,
  newShip,
  PIRATE,
  landingBlock,
  population,
  populationCap,
  sailable,
  sailSpeedFactor,
  shipCost,
  shipReveal,
  STORM,
  stockOf,
  takePatch,
  tick,
  toSnapshot,
  toWire,
  type BuildingEntity,
  type BuildingKind,
  type GameState,
  type NodeEntity,
  type PirateEntity,
  type ShipEntity,
  type SiteEntity,
  UPGRADES,
  type VillagerEntity,
  type WreckEntity,
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
      relic: 0,
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

describe("trade routes", () => {
  const home = world.start.islandId;

  /** Put a villager ashore on another island and find a shore tile where a dock fits. */
  function settleOutpost(s: GameState): { islandId: number; at: { x: number; y: number } } {
    for (const island of world.islands) {
      if (island.id === home) continue;
      const tiles: { x: number; y: number }[] = [];
      for (let y = 0; y < world.height; y++)
        for (let x = 0; x < world.width; x++) {
          const k = y * world.width + x;
          if (world.island[k] === island.id) {
            s.explored[k] = 1;
            tiles.push({ x, y });
          }
        }
      for (let y = 0; y < world.height; y++)
        for (let x = 0; x < world.width; x++) s.explored[y * world.width + x] = 1;
      const land = tiles.find((t) => isLandTerrain(world.terrain[t.y * world.width + t.x]!));
      if (!land) continue;
      s.entities.set(999_000 + island.id, {
        ...of<VillagerEntity>(s, "villager")[0]!,
        id: 999_000 + island.id,
        x: land.x + 0.5,
        y: land.y + 0.5,
      });
      const at = tiles.find((t) => canPlaceBuilding(s, "dock", t.x, t.y, { ignoreCost: true }).ok);
      if (at) return { islandId: island.id, at };
      s.entities.delete(999_000 + island.id);
    }
    throw new Error("no island with room for a dock");
  }

  it("refuses a dock on an island nobody has settled", () => {
    const s = fresh();
    for (let k = 0; k < s.explored.length; k++) s.explored[k] = 1;
    const other = world.islands.find((i) => i.id !== home)!;
    const k = world.island.findIndex((id, i) => id === other.id && world.terrain[i]! > 0);
    const res = canPlaceBuilding(s, "dock", k % world.width, Math.floor(k / world.width));
    expect(res.ok).toBe(false);
  });

  it("lets settlers build a dock on the shore of another island", () => {
    const s = fresh();
    const { islandId, at } = settleOutpost(s);
    s.stock.wood = s.stock.stone = 500;
    expect(applyCommand(s, { kind: "place-building", building: "dock", ...at })).toEqual({
      ok: true,
    });
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "dock" && !b.complete)!;
    expect(dock.dir).toBeDefined();
    expect(world.island[dock.y * world.width + dock.x]).not.toBe(islandId + 1e9);
    expect(applyCommand(s, { kind: "remove-building", buildingId: dock.id }).ok).toBe(true);
  });

  it("keeps the home dock", () => {
    const s = fresh();
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "dock")!;
    expect(applyCommand(s, { kind: "remove-building", buildingId: dock.id }).ok).toBe(false);
  });

  it("keeps goods gathered elsewhere on that island until a cargo ship hauls them home", () => {
    const s = fresh();
    const { islandId, at } = settleOutpost(s);
    s.stock.wood = s.stock.stone = 500;
    applyCommand(s, { kind: "place-building", building: "dock", ...at });
    const outDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "dock" && !b.complete,
    )!;
    outDock.complete = true;
    outDock.progress = 1;

    // A pile on the outpost is not spendable at home.
    const homeWood = s.stock.wood;
    addGoods(s, islandId, "wood", 60);
    expect(s.stock.wood).toBe(homeWood);
    expect(stockOf(s, islandId).wood).toBe(60);

    const homeDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "dock" && b !== outDock,
    )!;
    expect(applyCommand(s, { kind: "build-ship", buildingId: homeDock.id, ship: "cargo" })).toEqual(
      { ok: true },
    );
    run(s, 31);
    const ship = of<ShipEntity>(s, "ship").find((e) => e.kind === "cargo")!;
    expect(ship).toBeDefined();
    expect(ship.passengers).toHaveLength(0);
    expect(
      applyCommand(s, {
        kind: "assign",
        villagerId: of<VillagerEntity>(s, "villager")[0]!.id,
        target: { ship: ship.id },
      }).ok,
    ).toBe(false);
    expect(applyCommand(s, { kind: "set-route", shipId: ship.id, dockId: homeDock.id }).ok).toBe(
      false,
    );
    expect(applyCommand(s, { kind: "set-route", shipId: ship.id, dockId: outDock.id })).toEqual({
      ok: true,
    });

    const before = s.stock.wood;
    let guard = 0;
    while (s.stock.wood === before && guard++ < 3000) tick(s);
    // One trip carries at most a shipload; the rest waits for the next.
    expect(s.stock.wood).toBe(before + 40);
    expect(stockOf(s, islandId).wood).toBe(20);
    run(s, 300);
    expect(stockOf(s, islandId).wood).toBe(0);
    expect(s.stock.wood).toBe(before + 60);
  });

  it("survives snapshots and patches", () => {
    const s = fresh();
    const { islandId } = settleOutpost(s);
    const client = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))));
    addGoods(s, islandId, "stone", 12);
    applyPatch(client, JSON.parse(JSON.stringify(takePatch(s))));
    expect(stockOf(client, islandId).stone).toBe(12);
    const restored = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))), true);
    expect(stockOf(restored, islandId).stone).toBe(12);
  });
});

describe("magic house upgrades", () => {
  function withMagicHouse(): GameState {
    const s = fresh();
    s.stock = { ...s.stock, wood: 999, stone: 999, tools: 99, gold: 500, faith: 500, crystal: 50 };
    const at = spotFor(s, "magic_house");
    applyCommand(s, { kind: "place-building", building: "magic_house", ...at });
    const b = of<BuildingEntity>(s, "building").find((e) => e.kind === "magic_house")!;
    b.complete = true;
    b.progress = 1;
    return s;
  }

  it("needs a magic house, and charges for each upgrade once", () => {
    const s = fresh();
    s.stock.faith = s.stock.gold = 500;
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "far_sight" }).ok).toBe(false);
    const m = withMagicHouse();
    const gold = m.stock.gold;
    expect(applyCommand(m, { kind: "buy-upgrade", upgrade: "far_sight" })).toEqual({ ok: true });
    expect(m.stock.gold).toBe(gold - UPGRADES.far_sight.cost.gold!);
    expect(applyCommand(m, { kind: "buy-upgrade", upgrade: "far_sight" }).ok).toBe(false);
  });

  it("makes ships faster and see further", () => {
    const m = withMagicHouse();
    const before = { reveal: shipReveal(m), speed: sailSpeedFactor(m) };
    applyCommand(m, { kind: "buy-upgrade", upgrade: "far_sight" });
    applyCommand(m, { kind: "buy-upgrade", upgrade: "swift_sails" });
    expect(shipReveal(m)).toBeGreaterThan(before.reveal);
    expect(sailSpeedFactor(m)).toBeGreaterThan(before.speed);
  });

  it("keeps villagers off warded biomes until the ward is bought", () => {
    let found: { w: ReturnType<typeof generateWorld>; id: number } | null = null;
    for (let n = 0; n < 40 && !found; n++) {
      const w = generateWorld(`ward-${n}`);
      const island = w.islands.find((i) => i.biome === "infernal");
      if (island) found = { w, id: island.id };
    }
    expect(found).not.toBeNull();
    const s = createInitialState(found!.w);
    expect(landingBlock(s, found!.id)).not.toBeNull();
    s.upgrades.add("ember_ward");
    expect(landingBlock(s, found!.id)).toBeNull();
    expect(landingBlock(s, found!.w.start.islandId)).toBeNull();
  });

  it("charts every island and travels through snapshots and patches", () => {
    const m = withMagicHouse();
    const client = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(m))));
    takePatch(m);
    applyCommand(m, { kind: "buy-upgrade", upgrade: "seers_chart" });
    for (const island of world.islands) {
      expect(m.explored[Math.floor(island.cy) * world.width + Math.floor(island.cx)]).toBe(1);
    }
    applyPatch(client, JSON.parse(JSON.stringify(takePatch(m))));
    expect(client.upgrades.has("seers_chart")).toBe(true);
    const restored = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(m))), true);
    expect(restored.upgrades.has("seers_chart")).toBe(true);
  });
});

describe("pirates, wrecks and sunken sites", () => {
  const dockOf = (s: GameState) =>
    of<BuildingEntity>(s, "building").find((b) => b.kind === "dock")!;

  function ship(s: GameState, kind: ShipEntity["kind"], x: number, y: number): ShipEntity {
    return addEntity(s, newShip(s, kind, x, y, 0));
  }

  function pirate(s: GameState, x: number, y: number): PirateEntity {
    return addEntity(s, {
      id: s.nextId++,
      type: "pirate",
      x,
      y,
      heading: 0,
      hp: PIRATE.hp,
      path: [],
      phase: "hunt",
      target: null,
      timer: 0,
      cooldown: 0,
      loot: {},
      home: { x: Math.floor(x), y: Math.floor(y) },
    });
  }

  /** Open water a few tiles off the home dock's pier. */
  function nearDock(s: GameState, dist = 6): { x: number; y: number } {
    const spawn = dockSpawn(dockOf(s));
    for (let r = dist; r < dist + 10; r++) {
      const x = Math.floor(spawn.x) + r;
      if (sailable(s, x, Math.floor(spawn.y))) return { x: x + 0.5, y: Math.floor(spawn.y) + 0.5 };
    }
    return { x: spawn.x, y: spawn.y };
  }

  it("scatters ruins and fortresses over deep water, far from home", () => {
    expect(world.sites.length).toBeGreaterThan(5);
    expect(world.sites.some((x) => x.kind === "fortress")).toBe(true);
    const hall = world.start.townHall;
    for (const site of world.sites) {
      expect(world.shore[site.y * world.width + site.x]).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(site.x - hall.x, site.y - hall.y)).toBeGreaterThan(20);
    }
    expect(generateWorld("sim-tests").sites).toEqual(world.sites);
    const sites = of<SiteEntity>(fresh(), "site");
    expect(sites).toHaveLength(world.sites.length);
    expect(sites.every((x) => !x.found)).toBe(true);
  });

  it("sends raiders that rob a settlement and sail off", () => {
    const s = fresh();
    s.nextRaid = 0;
    s.stock.wood = 400;
    let robbed = false;
    let seen = false;
    for (let i = 0; i < 3000 && !(seen && of(s, "pirate").length === 0); i++) {
      tick(s);
      if (s.events.some((e) => e.type === "robbed")) robbed = true;
      if (of(s, "pirate").length > 0) seen = true;
      s.nextRaid = Math.max(s.nextRaid, s.time + 1000);
    }
    expect(seen).toBe(true);
    expect(robbed).toBe(true);
    expect(s.stock.wood).toBeLessThan(400);
    expect(of(s, "pirate")).toHaveLength(0);
  });

  it("lets a patrol boat sink a pirate and leave a shipwreck with loot", () => {
    const s = fresh();
    s.nextRaid = 1e9;
    const at = nearDock(s);
    const patrol = ship(s, "patrol", at.x, at.y);
    const p = pirate(s, at.x + 8, at.y);
    run(s, 60);
    expect(s.entities.has(p.id)).toBe(false);
    expect(s.entities.has(patrol.id)).toBe(true);
    const wreck = of<WreckEntity>(s, "wreck")[0]!;
    expect(wreck.kind).toBe("shipwreck");
    expect(wreck.loot.gold).toBeGreaterThan(0);

    // A scout can pick the wreck clean.
    const scout = ship(s, "scout", wreck.x + 0.5, wreck.y + 0.5);
    const gold = s.stock.gold;
    expect(applyCommand(s, { kind: "salvage", shipId: scout.id, wreckId: wreck.id })).toEqual({
      ok: true,
    });
    run(s, 20);
    expect(s.entities.has(wreck.id)).toBe(false);
    expect(s.stock.gold).toBeGreaterThan(gold);
  });

  it("sinks ships that meet a pirate unarmed, and cannons change that", () => {
    const unarmed = fresh();
    unarmed.nextRaid = 1e9;
    const at = nearDock(unarmed);
    const lone = ship(unarmed, "scout", at.x, at.y);
    pirate(unarmed, at.x + 3, at.y);
    run(unarmed, 30);
    expect(unarmed.entities.has(lone.id)).toBe(false);
    expect(of<WreckEntity>(unarmed, "wreck").length).toBe(1);

    const armed = fresh();
    armed.nextRaid = 1e9;
    armed.upgrades.add("cannons");
    armed.upgrades.add("iron_hulls");
    const there = nearDock(armed);
    const gunship = ship(armed, "scout", there.x, there.y);
    const foe = pirate(armed, there.x + 3, there.y);
    run(armed, 30);
    expect(armed.entities.has(foe.id)).toBe(false);
    expect(armed.entities.has(gunship.id)).toBe(true);
  });

  it("strikes pirates with lightning once Stormcaller is learned", () => {
    const s = fresh();
    s.nextRaid = 1e9;
    s.upgrades.add("storm_bolt");
    const at = nearDock(s, 8);
    const p = pirate(s, at.x, at.y);
    p.hp = STORM.damage * 2;
    run(s, STORM.interval * 3);
    expect(s.entities.has(p.id)).toBe(false);
  });

  it("lets villagers loot the bones a raider leaves ashore", () => {
    const s = fresh();
    s.nextRaid = 1e9;
    const h = hall(s);
    const land = spotFor(s, "house");
    s.entities.set(9001, {
      id: 9001,
      type: "wreck",
      kind: "skeleton",
      x: land.x,
      y: land.y,
      variant: 0,
      loot: { gold: 12, relic: 1 },
    });
    const v = of<VillagerEntity>(s, "villager")[0]!;
    expect(h).toBeDefined();
    expect(applyCommand(s, { kind: "assign", villagerId: v.id, target: { wreck: 9001 } })).toEqual({
      ok: true,
    });
    run(s, 40);
    expect(s.entities.has(9001)).toBe(false);
    expect(s.stock.relic).toBe(1);
    expect(s.stock.gold).toBe(12);
  });

  it("finds a sunken site by sailing over it, and divers bring up its treasure", () => {
    const s = fresh();
    s.nextRaid = 1e9;
    const site = of<SiteEntity>(s, "site").find((x) => x.kind === "ruin")!;
    const scout = ship(s, "scout", site.x + 0.5, site.y + 2.5);
    run(s, 1);
    expect(site.found).toBe(true);
    expect(applyCommand(s, { kind: "dive", shipId: scout.id, siteId: site.id }).ok).toBe(false);
    const divers = of<VillagerEntity>(s, "villager").slice(0, 2);
    for (const v of divers) {
      scout.passengers.push(v.id);
      v.aboard = scout.id;
    }
    const gold = s.stock.gold;
    const treasure = site.loot.gold!;
    expect(applyCommand(s, { kind: "dive", shipId: scout.id, siteId: site.id })).toEqual({
      ok: true,
    });
    run(s, 40);
    expect(s.stock.gold).toBeGreaterThan(gold);
    expect(site.loot.gold!).toBeLessThan(treasure);
    expect(scout.dive).toBeNull();
  });

  it("keeps raid timers, upgrades and sites through a save", () => {
    const s = fresh();
    s.nextRaid = 777;
    const restored = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))), true);
    expect(restored.nextRaid).toBe(777);
    expect(of(restored, "site")).toHaveLength(world.sites.length);
  });
});

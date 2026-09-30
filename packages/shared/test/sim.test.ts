import { describe, expect, it } from "vitest";
import {
  applyCommand,
  addEntity,
  addGoods,
  applyPatch,
  BUILDINGS,
  canPlaceBuilding,
  completeBuilding,
  createInitialState,
  DIFFICULTY_DEFS,
  berthOf,
  fetchedGoods,
  fromSnapshot,
  GATHER_JOBS,
  generateWorld,
  greatWorkStages,
  harvestSeconds,
  isDifficulty,
  isLandTerrain,
  islandName,
  islandNames,
  newBuilding,
  NODES,
  newShip,
  nightAtPhase,
  nightLevel,
  PIRATE,
  pirateMaxHp,
  landingBlock,
  lookAround,
  population,
  populationCap,
  sailable,
  removeEntity,
  RESOURCES,
  sailSpeedFactor,
  sightFactor,
  shipCost,
  shipMaxHp,
  shipReveal,
  SIGNATURE,
  SIGNATURE_NODES,
  signatureGoods,
  stormAt,
  STORMCALLER,
  stormOnRoute,
  stormStrength,
  stockOf,
  takePatch,
  tally,
  tick,
  toSnapshot,
  toWire,
  TRIBES,
  DIVE,
  diveSeconds,
  SMITH,
  smithSeconds,
  shipGuns,
  TRIBE_DEFS,
  type TribeId,
  type BuildingEntity,
  type BuildingKind,
  type GameState,
  type NodeEntity,
  type PirateEntity,
  type ShipEntity,
  type SiteEntity,
  type StormEntity,
  UPGRADES,
  watched,
  type VillagerEntity,
  type WreckEntity,
} from "../src";

const world = generateWorld("sim-tests");

function fresh(): GameState {
  return createInitialState(world);
}

/** A fresh game for another tribe, on its own world from the same seed. */
function freshFor(tribe: TribeId): GameState {
  return createInitialState(generateWorld("sim-tests", tribe));
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
    expect(buildings.map((b) => b.kind).sort()).toEqual(["dock", "harbour", "town_hall"]);
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
      sunstone: 0,
      rimeglass: 0,
      mirepearl: 0,
      glowcap: 0,
      hellstone: 0,
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
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;
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
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;
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
    // Villagers choose their own jobs by balance; send the nearest one to this workplace.
    if (BUILDINGS[kind].worker) {
      const v = of<VillagerEntity>(s, "villager")[0]!;
      expect(
        applyCommand(s, { kind: "assign", villagerId: v.id, target: { building: b.id } }),
      ).toEqual({ ok: true });
    }
    return b;
  }

  it("a staffed blacksmith turns ore into tools", () => {
    const s = fresh();
    instant(s, "blacksmith");
    s.stock.ore = 6;
    run(s, 40);
    expect(s.stock.tools).toBeGreaterThanOrEqual(99 + 2);
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

  it("pays the Amberwrights more at the market, at the usual buying price", () => {
    const s = freshFor("amberwrights");
    instant(s, "market");
    const gold = s.stock.gold;
    expect(applyCommand(s, { kind: "trade", resource: "wood", action: "sell" })).toEqual({
      ok: true,
    });
    expect(s.stock.gold).toBe(gold + 5);
    applyCommand(s, { kind: "trade", resource: "tools", action: "sell" });
    expect(s.stock.gold).toBe(gold + 5 + 20);
    applyCommand(s, { kind: "trade", resource: "stone", action: "buy" });
    expect(s.stock.gold).toBe(gold + 5 + 20 - 10);
  });

  it("lets Cinderborn blacksmiths forge twice as fast", () => {
    expect(smithSeconds("cinderborn")).toBe(SMITH.seconds / 2);
    expect(smithSeconds("islanders")).toBe(SMITH.seconds);
    const forged = (s: GameState) => {
      instant(s, "blacksmith");
      s.stock.ore = 40;
      run(s, 40);
      return s.stock.tools - 99;
    };
    expect(forged(freshFor("cinderborn"))).toBeGreaterThan(forged(fresh()) + 2);
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

  it("gives every tribe a distinct home biome, bonus and banner", () => {
    const defs = TRIBES.map((t) => TRIBE_DEFS[t]);
    expect(new Set(defs.map((d) => d.homeBiome)).size).toBe(TRIBES.length);
    expect(new Set(defs.map((d) => d.bonus)).size).toBe(TRIBES.length);
    expect(new Set(defs.map((d) => d.banner)).size).toBe(TRIBES.length);
    for (const d of defs) for (const id of d.innate ?? []) expect(UPGRADES[id]).toBeDefined();
  });
});

describe("settling other islands", () => {
  it("ferries villagers to a new island where they can build", () => {
    const s = fresh();
    s.stock = { ...s.stock, wood: 999, stone: 999 };
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;
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
    run(s, 90);
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
      const at = tiles.find(
        (t) => canPlaceBuilding(s, "harbour", t.x, t.y, { ignoreCost: true }).ok,
      );
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
    const res = canPlaceBuilding(s, "harbour", k % world.width, Math.floor(k / world.width));
    expect(res.ok).toBe(false);
  });

  it("lets settlers build a dock on the shore of another island", () => {
    const s = fresh();
    const { islandId, at } = settleOutpost(s);
    s.stock.wood = s.stock.stone = 500;
    expect(applyCommand(s, { kind: "place-building", building: "harbour", ...at })).toEqual({
      ok: true,
    });
    const dock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "harbour" && !b.complete,
    )!;
    expect(dock.dir).toBeDefined();
    expect(world.island[dock.y * world.width + dock.x]).not.toBe(islandId + 1e9);
    expect(applyCommand(s, { kind: "remove-building", buildingId: dock.id }).ok).toBe(true);
  });

  it("keeps the home dock", () => {
    const s = fresh();
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;
    expect(applyCommand(s, { kind: "remove-building", buildingId: dock.id }).ok).toBe(false);
  });

  it("keeps goods gathered elsewhere on that island until a cargo ship hauls them home", () => {
    const s = fresh();
    const { islandId, at } = settleOutpost(s);
    s.stock.wood = s.stock.stone = 500;
    applyCommand(s, { kind: "place-building", building: "harbour", ...at });
    const outDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "harbour" && !b.complete,
    )!;
    outDock.complete = true;
    outDock.progress = 1;

    // A pile on the outpost is not spendable at home.
    const homeWood = s.stock.wood;
    addGoods(s, islandId, "wood", 60);
    expect(s.stock.wood).toBe(homeWood);
    expect(stockOf(s, islandId).wood).toBe(60);

    const homeDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "harbour" && b !== outDock,
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

    // Villagers gather wood on their own now: send them off so only the ship changes the stock.
    for (const v of of<VillagerEntity>(s, "villager")) removeEntity(s, v.id);
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

  it("keeps a cargo ship in port while a storm sits on its way", () => {
    const s = fresh();
    s.nextStorm = 1e9;
    const { at } = settleOutpost(s);
    s.stock.wood = s.stock.stone = 500;
    applyCommand(s, { kind: "place-building", building: "harbour", ...at });
    const outDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "harbour" && !b.complete,
    )!;
    outDock.complete = true;
    outDock.progress = 1;
    const island = world.island[outDock.y * world.width + outDock.x]!;
    addGoods(s, island, "wood", 30);
    const homeDock = of<BuildingEntity>(s, "building").find(
      (b) => b.kind === "harbour" && b !== outDock,
    )!;
    const spot = berthOf(s, homeDock);
    const ship = addEntity(s, newShip(s, "cargo", spot.x, spot.y, 0));
    applyCommand(s, { kind: "set-route", shipId: ship.id, dockId: outDock.id });
    const out = berthOf(s, outDock);
    const storm = addEntity(s, {
      id: s.nextId++,
      type: "storm",
      x: (spot.x + out.x) / 2,
      y: (spot.y + out.y) / 2,
      vx: 0,
      vy: 0,
      radius: 8,
      age: 40,
      life: 10_000,
    });
    run(s, 20);
    expect(ship.path).toHaveLength(0);
    expect(Math.hypot(ship.x - spot.x, ship.y - spot.y)).toBeLessThan(0.5);
    removeEntity(s, storm.id);
    run(s, 10);
    expect(ship.dest ?? ship.path[0]).toBeTruthy();
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

  it("gives the Cinderborn the Ember Ward from the start, and keeps it through a save", () => {
    const s = freshFor("cinderborn");
    expect(s.world.islands[s.world.start.islandId]!.biome).toBe("infernal");
    expect(TRIBE_DEFS.cinderborn.innate).toEqual(["ember_ward"]);
    expect(s.upgrades.has("ember_ward")).toBe(true);
    expect(landingBlock(s, s.world.start.islandId)).toBeNull();
    const crystal = s.world.islands.find((i) => i.biome === "crystal" && i.flavor !== "islet");
    if (crystal) expect(landingBlock(s, crystal.id)).not.toBeNull();
    expect(applyCommand(s, { kind: "buy-upgrade", upgrade: "ember_ward" }).ok).toBe(false);
    const saved = JSON.parse(JSON.stringify(toSnapshot(s)));
    expect(fromSnapshot(s.world, saved).upgrades.has("ember_ward")).toBe(true);
    // Even a save that somehow lost the list still knows the tribe's own gifts.
    expect(fromSnapshot(s.world, { ...saved, upgrades: [] }).upgrades.has("ember_ward")).toBe(true);
    expect(fresh().upgrades.size).toBe(0);
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
    of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;

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
    const spawn = berthOf(s, dockOf(s));
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
    s.time = 250; // dusk on the first day: raids come after dark
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
    p.hp = STORMCALLER.damage * 2;
    run(s, STORMCALLER.interval * 3);
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

  it("arms every Freebooter ship and doubles what a sunk raider leaves", () => {
    const s = freshFor("freebooters");
    s.nextRaid = 1e9;
    expect(s.upgrades.has("cannons")).toBe(true);
    const at = nearDock(s);
    expect(shipGuns(s, ship(s, "scout", at.x, at.y))).not.toBeNull();
    expect(shipGuns(s, ship(s, "cargo", at.x, at.y))).not.toBeNull();
    const p = pirate(s, at.x + 12, at.y);
    p.loot = { wood: 10 };
    p.hp = 0;
    tick(s);
    const wreck = of<WreckEntity>(s, "wreck")[0]!;
    expect(wreck.loot.wood).toBe(20);
    expect(wreck.loot.gold! % 2).toBe(0);
    expect(wreck.loot.gold).toBeGreaterThanOrEqual(20);
  });

  it("lets Mirefolk divers work twice as fast and bring up more", () => {
    expect(diveSeconds("mirefolk")).toBe(DIVE.seconds / 2);
    const dive = (s: GameState) => {
      s.nextRaid = 1e9;
      const site = of<SiteEntity>(s, "site").find((x) => x.kind === "ruin")!;
      const scout = ship(s, "scout", site.x + 0.5, site.y + 2.5);
      run(s, 1);
      const diver = of<VillagerEntity>(s, "villager")[0]!;
      scout.passengers.push(diver.id);
      diver.aboard = scout.id;
      const treasure = site.loot.gold!;
      applyCommand(s, { kind: "dive", shipId: scout.id, siteId: site.id });
      const seconds = scout.dive!.remaining;
      run(s, seconds + 1);
      expect(scout.dive).toBeNull();
      return { seconds, share: 1 - site.loot.gold! / treasure };
    };
    const usual = dive(fresh());
    const mire = dive(freshFor("mirefolk"));
    expect(mire.seconds).toBe(usual.seconds / 2);
    expect(mire.share).toBeGreaterThan(usual.share * 1.3);
  });

  it("keeps raid timers, upgrades and sites through a save", () => {
    const s = fresh();
    s.nextRaid = 777;
    const restored = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))), true);
    expect(restored.nextRaid).toBe(777);
    expect(of(restored, "site")).toHaveLength(world.sites.length);
  });
});

describe("difficulty", () => {
  it("starts the first raid on the difficulty's schedule", () => {
    expect(createInitialState(world).nextRaid).toBe(DIFFICULTY_DEFS.normal.firstRaid);
    expect(createInitialState(world, { difficulty: "hard" }).nextRaid).toBe(
      DIFFICULTY_DEFS.hard.firstRaid,
    );
    expect(DIFFICULTY_DEFS.hard.firstRaid).toBeLessThan(DIFFICULTY_DEFS.normal.firstRaid);
  });

  it("never sends pirates in a peaceful world", () => {
    const s = createInitialState(world, { difficulty: "peaceful" });
    s.nextRaid = 0;
    run(s, 900);
    expect(of(s, "pirate")).toHaveLength(0);
    expect(s.events.some((e) => e.type === "pirates")).toBe(false);
  }, 60_000);

  it("makes hard raids bigger and tougher than normal ones", () => {
    const raid = (difficulty: "normal" | "hard") => {
      const s = createInitialState(world, { difficulty });
      s.time = 3 * 480 + 288; // the evening of day 4: raids come at dusk and grow with the days
      s.nextRaid = 0;
      tick(s);
      return { s, pirates: of<PirateEntity>(s, "pirate") };
    };
    const normal = raid("normal");
    const hard = raid("hard");
    expect(hard.pirates.length).toBeGreaterThan(normal.pirates.length);
    expect(hard.pirates[0]!.hp).toBeGreaterThan(normal.pirates[0]!.hp);
    expect(hard.pirates[0]!.hp).toBe(pirateMaxHp(hard.s));
  });

  it("is saved with the world, and old saves count as normal", () => {
    const hard = createInitialState(world, { difficulty: "hard" });
    const snap = JSON.parse(JSON.stringify(toSnapshot(hard)));
    expect(fromSnapshot(world, snap, true).difficulty).toBe("hard");
    delete snap.difficulty;
    expect(fromSnapshot(world, snap, true).difficulty).toBe("normal");
    expect(isDifficulty("hard")).toBe(true);
    expect(isDifficulty("nightmare")).toBe(false);
  });
});

describe("island names", () => {
  it("names every island, uniquely and the same way every time", () => {
    const names = islandNames(world);
    expect(names).toHaveLength(world.islands.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 3)).toBe(true);
    expect(islandNames(generateWorld("sim-tests"))).toEqual(names);
    expect(islandNames(generateWorld("another-seed"))).not.toEqual(names);
    expect(islandName(world, world.start.islandId)).toBe(names[world.start.islandId]);
    expect(islandName(world, 9999)).toBe("Uncharted waters");
  });
});

const timeAtPhase = (phase: number) => ((((phase - 0.1) % 1) + 1) % 1) * 480;

describe("night, light and lookouts", () => {
  it("follows the clock: dark at midnight, bright at noon", () => {
    expect(nightLevel(timeAtPhase(0.25))).toBe(0);
    expect(nightLevel(timeAtPhase(0.8))).toBe(1);
    expect(nightLevel(timeAtPhase(0.62))).toBeGreaterThan(0.3);
    expect(nightLevel(timeAtPhase(0.62))).toBeLessThan(0.8);
    expect(nightAtPhase(0.8)).toBe(nightLevel(timeAtPhase(0.8)));
  });

  /** A spot a few tiles from the town hall, far from the dock. */
  function nearHallFarFromDock(s: GameState): { x: number; y: number } {
    const hall = hallOf(s);
    const cx = hall.x + hall.w / 2;
    const cy = hall.y + hall.h / 2;
    const dock = of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!;
    for (let dy = -13; dy <= 13; dy++)
      for (let dx = -13; dx <= 13; dx++) {
        const d = Math.hypot(dx, dy);
        const away = Math.hypot(cx + dx - (dock.x + dock.w / 2), cy + dy - (dock.y + dock.h / 2));
        if (d >= 8 && d <= 12 && away > 16) return { x: cx + dx, y: cy + dy };
      }
    throw new Error("no such spot");
  }

  const hallOf = (s: GameState) =>
    of<BuildingEntity>(s, "building").find((b) => b.kind === "town_hall")!;

  it("keeps watch farther by day than after dark", () => {
    const s = fresh();
    const spot = nearHallFarFromDock(s);
    s.time = timeAtPhase(0.25);
    expect(watched(s, spot.x, spot.y)).toBe(true);
    s.time = timeAtPhase(0.8);
    expect(watched(s, spot.x, spot.y)).toBe(false);
    // Lamps at the settlement's own edge still show.
    const hall = hallOf(s);
    expect(watched(s, hall.x + hall.w / 2 + 4, hall.y + hall.h / 2)).toBe(true);
  });

  it("lets a lighthouse's beam watch far out, day and night", () => {
    const s = fresh();
    const spot = nearHallFarFromDock(s);
    s.time = timeAtPhase(0.8);
    expect(watched(s, spot.x, spot.y)).toBe(false);
    const light = addEntity(
      s,
      newBuilding(s, "lighthouse", Math.floor(spot.x) - 16, Math.floor(spot.y), true),
    );
    expect(watched(s, spot.x, spot.y)).toBe(true);
    expect(sightFactor(s, spot.x, spot.y)).toBe(1);
    // Far beyond its reach the sea is dark again.
    expect(watched(s, spot.x + 60, spot.y + 60)).toBe(false);
    removeEntity(s, light.id);
    expect(sightFactor(s, spot.x, spot.y)).toBeLessThan(1);
    s.time = timeAtPhase(0.25);
    expect(sightFactor(s, spot.x, spot.y)).toBe(1);
  });

  it("lets the Glowkin keep their daytime sight after dark", () => {
    const s = freshFor("glowkin");
    const spot = nearHallFarFromDock(s);
    s.time = timeAtPhase(0.8);
    expect(watched(s, spot.x, spot.y)).toBe(true);
    expect(sightFactor(s, spot.x, spot.y)).toBe(1);
    const usual = fresh();
    usual.time = timeAtPhase(0.8);
    expect(sightFactor(usual, spot.x, spot.y)).toBeLessThan(1);
  });

  it("sees less of the sea from a ship at night", () => {
    const explored = (time: number) => {
      const s = fresh();
      s.time = time;
      const site = world.sites[0]!;
      s.explored.fill(0);
      lookAround(s, site.x + 0.5, site.y + 0.5, 8);
      return s.explored.reduce((a, b) => a + b, 0);
    };
    expect(explored(timeAtPhase(0.8))).toBeLessThan(explored(timeAtPhase(0.25)));
  });

  it("makes raids wait for dusk", () => {
    const s = fresh();
    s.nextRaid = 0;
    s.time = timeAtPhase(0.25);
    run(s, 5);
    expect(of(s, "pirate")).toHaveLength(0);
    s.time = timeAtPhase(0.75);
    run(s, 1);
    expect(of(s, "pirate").length).toBeGreaterThan(0);
  });

  /** Open water far from everything, with room for a boat and a pirate 8 tiles apart. */
  function farWater(): { boat: { x: number; y: number }; foe: { x: number; y: number } } {
    const s = fresh();
    for (const site of world.sites) {
      for (const [dx, dy] of [
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
      ] as const) {
        if (sailable(s, site.x, site.y) && sailable(s, site.x + dx, site.y + dy))
          return {
            boat: { x: site.x + 0.5, y: site.y + 0.5 },
            foe: { x: site.x + dx + 0.5, y: site.y + dy + 0.5 },
          };
      }
    }
    throw new Error("no open water");
  }

  function patrolAgainstPirate(phase: number, lighthouse: boolean): ShipEntity {
    const s = fresh();
    s.nextRaid = 1e9;
    s.time = timeAtPhase(phase);
    const { boat, foe } = farWater();
    const patrol = addEntity(s, newShip(s, "patrol", boat.x, boat.y, 0));
    addEntity(s, {
      id: s.nextId++,
      type: "pirate",
      x: foe.x,
      y: foe.y,
      heading: 0,
      hp: 1000,
      path: [],
      phase: "hunt",
      target: null,
      timer: 0,
      cooldown: 0,
      loot: {},
      home: { x: 0, y: 0 },
    });
    if (lighthouse)
      addEntity(
        s,
        newBuilding(s, "lighthouse", Math.floor(boat.x) + 1, Math.floor(boat.y) + 1, true),
      );
    // The raider heads for the boat, so look before it closes the distance.
    run(s, 0.3);
    return patrol;
  }

  it("has patrol boats chase only the raiders they can see", () => {
    expect(patrolAgainstPirate(0.25, false).hunt).toBe(true);
    expect(patrolAgainstPirate(0.8, false).hunt).toBe(false);
    expect(patrolAgainstPirate(0.8, true).hunt).toBe(true);
  });

  it("puts up a lighthouse that reveals a wide circle when finished", () => {
    const s = fresh();
    s.stock = { ...s.stock, wood: 500, stone: 500, tools: 50 };
    const at = spotFor(s, "lighthouse");
    expect(applyCommand(s, { kind: "place-building", building: "lighthouse", ...at })).toEqual({
      ok: true,
    });
    const site = of<BuildingEntity>(s, "building").find((b) => b.kind === "lighthouse")!;
    s.explored.fill(0);
    completeBuilding(s, site);
    const lighthouseSeen = s.explored.reduce((a, b) => a + b, 0);
    s.explored.fill(0);
    const house = addEntity(s, newBuilding(s, "house", at.x + 4, at.y, false));
    completeBuilding(s, house);
    expect(lighthouseSeen).toBeGreaterThan(s.explored.reduce((a, b) => a + b, 0) * 3);
  });
});

describe("storms", () => {
  /** A full-strength storm sitting still over a point. */
  const stormOver = (s: GameState, x: number, y: number, radius = 8): StormEntity =>
    addEntity(s, {
      id: s.nextId++,
      type: "storm",
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      age: 40,
      life: 10_000,
    });

  const scoutAt = (s: GameState) => {
    const site = world.sites[0]!;
    return addEntity(s, newShip(s, "scout", site.x + 0.5, site.y + 0.5, 0));
  };

  it("forms on schedule, from the same seed and moment everywhere", () => {
    const a = fresh();
    const b = fresh();
    a.nextStorm = b.nextStorm = 0;
    tick(a);
    tick(b);
    const [sa] = of<StormEntity>(a, "storm");
    const [sb] = of<StormEntity>(b, "storm");
    expect(sa).toBeDefined();
    expect(sa).toEqual({ ...sb, id: sa!.id });
    expect(a.events.some((e) => e.type === "storm")).toBe(true);
    expect(a.nextStorm).toBeGreaterThan(a.time + 100);
  });

  it("drifts, builds up, blows out and is removed", () => {
    const s = fresh();
    s.nextStorm = 1e9;
    const storm = addEntity(s, {
      id: s.nextId++,
      type: "storm",
      x: 50,
      y: 50,
      vx: 1,
      vy: 0,
      radius: 8,
      age: 0,
      life: 60,
    });
    expect(stormStrength(storm)).toBe(0);
    run(s, 20);
    expect(storm.x).toBeCloseTo(70, 0);
    expect(stormStrength(storm)).toBe(1);
    run(s, 42);
    expect(s.entities.has(storm.id)).toBe(false);
  });

  it("damages ships caught in the open, but not in harbour", () => {
    const s = createInitialState(world, { difficulty: "hard" });
    s.nextRaid = s.nextStorm = 1e9;
    const ship = scoutAt(s);
    stormOver(s, ship.x, ship.y);
    run(s, 5);
    expect(ship.hp).toBeLessThan(shipMaxHp(s, "scout") - 5);

    const safe = createInitialState(world, { difficulty: "hard" });
    safe.nextRaid = safe.nextStorm = 1e9;
    const dock = of<BuildingEntity>(safe, "building").find((b) => b.kind === "harbour")!;
    const moored = addEntity(
      safe,
      newShip(safe, "scout", berthOf(safe, dock).x, berthOf(safe, dock).y, 0),
    );
    stormOver(safe, moored.x, moored.y);
    run(safe, 5);
    expect(moored.hp).toBe(shipMaxHp(safe, "scout"));
  });

  it("is shrugged off with Calm Waters, and harmless in a peaceful world", () => {
    const calm = fresh();
    calm.nextRaid = calm.nextStorm = 1e9;
    calm.upgrades.add("calm_waters");
    const a = scoutAt(calm);
    stormOver(calm, a.x, a.y);
    run(calm, 5);
    expect(a.hp).toBe(shipMaxHp(calm, "scout"));

    const peaceful = createInitialState(world, { difficulty: "peaceful" });
    peaceful.nextStorm = 1e9;
    const b = scoutAt(peaceful);
    stormOver(peaceful, b.x, b.y);
    run(peaceful, 5);
    expect(b.hp).toBe(shipMaxHp(peaceful, "scout"));
  });

  it("sinks a ship that stays in the storm, leaving a wreck", () => {
    const s = createInitialState(world, { difficulty: "hard" });
    s.nextRaid = s.nextStorm = 1e9;
    const ship = scoutAt(s);
    stormOver(s, ship.x, ship.y);
    run(s, 40);
    expect(s.entities.has(ship.id)).toBe(false);
    expect(of<WreckEntity>(s, "wreck")).toHaveLength(1);
  });

  it("batters pirates too", () => {
    const s = fresh();
    s.nextRaid = s.nextStorm = 1e9;
    const site = world.sites[0]!;
    const p = addEntity(s, {
      id: s.nextId++,
      type: "pirate",
      x: site.x + 0.5,
      y: site.y + 0.5,
      heading: 0,
      hp: 30,
      path: [],
      phase: "flee",
      target: null,
      timer: 0,
      cooldown: 0,
      loot: {},
      home: { x: 5, y: 5 },
    });
    stormOver(s, p.x, p.y);
    run(s, 4);
    expect(p.hp).toBeLessThan(30);
  });

  it("finds storms in a ship's way", () => {
    const s = fresh();
    s.nextStorm = 1e9;
    stormOver(s, 50, 50, 6);
    expect(stormOnRoute(s, { x: 30, y: 50 }, { x: 70, y: 50 })).toBe(true);
    expect(stormOnRoute(s, { x: 30, y: 80 }, { x: 70, y: 80 })).toBe(false);
    expect(stormAt(s, 52, 50)).not.toBeNull();
    expect(stormAt(s, 80, 80)).toBeNull();
  });

  it("travels through snapshots and patches", () => {
    const s = fresh();
    s.nextStorm = 0;
    const client = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))));
    tick(s);
    applyPatch(client, JSON.parse(JSON.stringify(takePatch(s))));
    expect(of(client, "storm")).toHaveLength(1);
    const restored = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))), true);
    expect(restored.nextStorm).toBe(s.nextStorm);
    expect(of(restored, "storm")).toHaveLength(1);
  });
});

describe("signature goods", () => {
  it(
    "puts enough of every far biome's good on its islands, in every world",
    { timeout: 120_000 },
    () => {
      for (const tribe of TRIBES) {
        for (const seed of ["goods-a", "goods-b", "sim-tests"]) {
          const w = generateWorld(seed, tribe);
          for (const [biome, sig] of Object.entries(SIGNATURE)) {
            const islands = w.islands.filter((i) => i.biome === biome && i.flavor !== "islet");
            if (islands.length === 0) continue;
            const ids = new Set(islands.map((i) => i.id));
            const deposits = w.nodes.filter(
              (n) => n.kind === sig.node && ids.has(w.island[n.y * w.width + n.x]!),
            );
            expect(deposits.length, `${tribe}/${seed}: ${sig.node}`).toBeGreaterThanOrEqual(
              sig.deposits,
            );
            const units = deposits.length * NODES[sig.node].amount;
            expect(units, `${tribe}/${seed}: ${sig.node}`).toBeGreaterThanOrEqual(130);
          }
          const tiles = w.nodes.map((n) => n.y * w.width + n.x);
          expect(new Set(tiles).size).toBe(tiles.length);
        }
      }
    },
  );

  it("gives each far biome a good only it can yield", () => {
    const goods = signatureGoods();
    expect(goods).toHaveLength(6);
    expect(new Set(goods.map((g) => g.resource)).size).toBe(6);
    expect(NODES.hellstone.resource).toBe("hellstone");
    for (const g of goods) expect(GATHER_JOBS.mine).toContain(g.resource);
    // Only that biome's node kind yields each good.
    for (const g of goods) {
      const yielding = Object.entries(NODES).filter(([, def]) => def.resource === g.resource);
      expect(yielding.map(([kind]) => kind)).toEqual([SIGNATURE[g.biome]!.node]);
    }
  });
});

describe("the Great Work", () => {
  const rich = (s: GameState) => {
    s.stock = {
      ...s.stock,
      wood: 9999,
      stone: 9999,
      tools: 999,
      gold: 999,
      faith: 999,
      relic: 99,
      sunstone: 99,
      rimeglass: 99,
      mirepearl: 99,
      glowcap: 99,
      hellstone: 99,
      crystal: 99,
    };
  };

  it("asks for the goods of the far biomes, except the home biome's own", () => {
    const stages = greatWorkStages(world);
    expect(stages).toHaveLength(3);
    expect(stages[0]!.cost).toEqual(BUILDINGS.great_work.cost);
    const homeBiome = world.islands[world.start.islandId]!.biome;
    expect(homeBiome).toBe("temperate");
    expect(stages[1]!.cost).toMatchObject({
      sunstone: 40,
      rimeglass: 40,
      mirepearl: 40,
      glowcap: 40,
    });
    expect(stages[2]!.cost).toMatchObject({ hellstone: 60, crystal: 60, relic: 6 });
    // Northfolk live among the frost: they need no rimeglass.
    const north = greatWorkStages(generateWorld("sim-tests", "northfolk"));
    expect(north[1]!.cost.rimeglass).toBeUndefined();
    expect(north[1]!.cost.sunstone).toBe(40);
    expect(
      fetchedGoods(generateWorld("sim-tests", "sunfolk")).map((g) => g.resource),
    ).not.toContain("sunstone");
  });

  it("can be raised once, on the home island only", () => {
    const s = fresh();
    rich(s);
    const at = spotFor(s, "great_work");
    expect(world.island[at.y * world.width + at.x]).toBe(world.start.islandId);
    expect(applyCommand(s, { kind: "place-building", building: "great_work", ...at })).toEqual({
      ok: true,
    });
    expect(applyCommand(s, { kind: "place-building", building: "great_work", ...at }).ok).toBe(
      false,
    );
    const elsewhere = fresh();
    rich(elsewhere);
    const { islandId, at: shore } = (() => {
      const island = world.islands.find(
        (i) => i.id !== world.start.islandId && i.flavor !== "islet",
      )!;
      const k = Array.from(world.island).findIndex(
        (id, i) => id === island.id && isLandTerrain(world.terrain[i]!),
      );
      return { islandId: island.id, at: { x: k % world.width, y: Math.floor(k / world.width) } };
    })();
    elsewhere.explored.fill(1);
    addEntity(elsewhere, {
      ...of<VillagerEntity>(elsewhere, "villager")[0]!,
      id: elsewhere.nextId++,
      x: shore.x + 0.5,
      y: shore.y + 0.5,
    });
    const check = canPlaceBuilding(elsewhere, "great_work", shore.x, shore.y);
    expect(check.ok).toBe(false);
    expect(islandId).not.toBe(world.start.islandId);
  });

  it("is founded by villagers, funded stage by stage and finished with a chronicle", () => {
    const s = fresh();
    rich(s);
    s.nextRaid = s.nextStorm = 1e9;
    const at = spotFor(s, "great_work");
    applyCommand(s, { kind: "place-building", building: "great_work", ...at });
    const gw = of<BuildingEntity>(s, "building").find((b) => b.kind === "great_work")!;
    expect(gw.stage).toBe(0);
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id }).ok).toBe(false);
    // The villagers found it on their own.
    run(s, 90);
    expect(gw.complete).toBe(true);
    expect(gw.stage).toBe(1);
    expect(s.events.some((e) => e.type === "wonder" && e.stage === 1 && !e.final)).toBe(true);
    expect(applyCommand(s, { kind: "remove-building", buildingId: gw.id }).ok).toBe(false);

    // Stage two needs its goods first.
    const kept = { ...s.stock };
    s.stock.sunstone = 0;
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id }).ok).toBe(false);
    s.stock = kept;
    const before = s.stock.rimeglass;
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id })).toEqual({ ok: true });
    expect(s.stock.rimeglass).toBe(before - 40);
    expect(gw.complete).toBe(false);
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id }).ok).toBe(false);
    run(s, 120);
    expect(gw.stage).toBe(2);

    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id })).toEqual({ ok: true });
    run(s, 150);
    expect(gw.stage).toBe(3);
    expect(gw.complete).toBe(true);
    expect(s.stats.wonderAt).not.toBeNull();
    expect(s.events.some((e) => e.type === "wonder" && e.final)).toBe(true);
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id }).ok).toBe(false);
    expect(applyCommand(s, { kind: "remove-building", buildingId: gw.id }).ok).toBe(false);
  });

  it("tallies the expedition's story for the chronicle", () => {
    const s = fresh();
    s.nextRaid = s.nextStorm = 1e9;
    const dockSpot = berthOf(
      s,
      of<BuildingEntity>(s, "building").find((b) => b.kind === "harbour")!,
    );
    const patrol = addEntity(s, newShip(s, "patrol", dockSpot.x + 6, dockSpot.y, 0));
    addEntity(s, {
      id: s.nextId++,
      type: "pirate",
      x: dockSpot.x + 12,
      y: dockSpot.y,
      heading: 0,
      hp: 20,
      path: [],
      phase: "hunt",
      target: null,
      timer: 0,
      cooldown: 0,
      loot: {},
      home: { x: 0, y: 0 },
    });
    run(s, 60);
    expect(s.stats.pirates).toBe(1);
    expect(s.entities.has(patrol.id)).toBe(true);
    const wreck = of<WreckEntity>(s, "wreck")[0]!;
    const scout = addEntity(s, newShip(s, "scout", wreck.x + 0.5, wreck.y + 0.5, 0));
    applyCommand(s, { kind: "salvage", shipId: scout.id, wreckId: wreck.id });
    run(s, 20);
    expect(s.stats.salvaged).toBe(1);
    expect(s.statsDirty).toBe(true);
  });

  it("travels through snapshots and patches, and seeds deposits into old saves once", () => {
    const s = fresh();
    tally(s, "hauled", 42);
    s.stats.wonderAt = 1234;
    const client = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(client.stats).toEqual(s.stats);
    takePatch(s);
    tally(s, "raids", 2);
    applyPatch(client, JSON.parse(JSON.stringify(takePatch(s))));
    expect(client.stats.raids).toBe(2);

    const signatures = (state: GameState) =>
      of<NodeEntity>(state, "node").filter((n) => SIGNATURE_NODES.includes(n.kind));
    expect(signatures(s).length).toBeGreaterThan(20);
    // A save from before signature deposits existed: no deposits, no flag.
    const old = JSON.parse(JSON.stringify(toSnapshot(s)));
    delete old.depositsSeeded;
    old.entities = old.entities.filter(
      (e: { type: string; kind: string }) =>
        !(e.type === "node" && ["sunstone", "rimeglass", "mirepearl", "glowcap"].includes(e.kind)),
    );
    const migrated = fromSnapshot(world, old, true);
    expect(
      signatures(migrated)
        .map((n) => n.kind)
        .filter((k) => k === "sunstone").length,
    ).toBeGreaterThan(5);
    // A current save whose deposits were mined out stays mined out.
    const mined = JSON.parse(JSON.stringify(toSnapshot(s)));
    mined.entities = mined.entities.filter(
      (e: { type: string; kind: string }) => !(e.type === "node" && e.kind === "sunstone"),
    );
    expect(signatures(fromSnapshot(world, mined, true)).some((n) => n.kind === "sunstone")).toBe(
      false,
    );
  });
});

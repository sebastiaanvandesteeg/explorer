import { describe, expect, it } from "vitest";
import {
  addEntity,
  addGoods,
  createInitialState,
  generateWorld,
  islandName,
  newBuilding,
  newShip,
  type BuildingEntity,
  type GameState,
  type PirateEntity,
  type ShipEntity,
  type VillagerEntity,
} from "@explorer/shared";
import {
  compassFrom,
  currentThreat,
  fleetRows,
  goodsList,
  islandRows,
  routeLines,
  seaSights,
} from "./mapData";
import { islandLines } from "./mapscreen";

const world = generateWorld("map-tests");
const fresh = (): GameState => createInitialState(world);

/** Put a finished building on some tile of another island, and a villager beside it. */
function settle(s: GameState, kind: "dock" | "storehouse" = "dock") {
  const home = world.start.islandId;
  const island = world.islands.find((i) => i.id !== home && i.flavor !== "islet")!;
  const k = world.island.findIndex((id) => id === island.id);
  const x = k % world.width;
  const y = Math.floor(k / world.width);
  s.discovered.add(island.id);
  const villager = [...s.entities.values()].find((e) => e.type === "villager") as VillagerEntity;
  addEntity(s, { ...villager, id: s.nextId++, x: x + 0.5, y: y + 0.5 });
  const building = addEntity(s, newBuilding(s, kind, x, y, true, "+x"));
  return { island, building, x, y };
}

describe("islandRows", () => {
  it("lists only the home island and the ones the team has found", () => {
    const s = fresh();
    const rows = islandRows(s);
    expect(rows.map((r) => r.id)).toEqual([world.start.islandId]);
    expect(rows[0]).toMatchObject({
      name: islandName(world, world.start.islandId),
      home: true,
      settled: true,
      docks: 1,
      stuck: null,
    });
    expect(rows[0]!.villagers).toBe(3);
    expect(rows[0]!.pile.wood).toBe(50);
    const other = world.islands.find((i) => i.id !== world.start.islandId)!;
    s.discovered.add(other.id);
    const found = islandRows(s).find((r) => r.id === other.id)!;
    expect(found).toMatchObject({ settled: false, villagers: 0, stuck: null });
  });

  it("says what stops an outpost's goods reaching home", () => {
    const s = fresh();
    const { island } = settle(s, "storehouse");
    addGoods(s, island.id, "ore", 12);
    let row = islandRows(s).find((r) => r.id === island.id)!;
    expect(row).toMatchObject({ settled: true, docks: 0, stuck: "dock" });
    expect(row.pile).toEqual({ ore: 12 });
    expect(islandLines(row).join(" ")).toMatch(/No dock/);

    const tiles = Array.from(world.island).flatMap((id, k) => (id === island.id ? [k] : []));
    const k = tiles[Math.floor(tiles.length / 2)]!;
    addEntity(s, newBuilding(s, "dock", k % world.width, Math.floor(k / world.width), true, "+x"));
    row = islandRows(s).find((r) => r.id === island.id)!;
    expect(row.stuck).toBe("ship");
    expect(islandLines(row).join(" ")).toMatch(/No cargo ship/);
  });
});

describe("routes and the fleet", () => {
  it("draws a line from each cargo ship's pickup dock to a home dock", () => {
    const s = fresh();
    const { building } = settle(s, "dock");
    const ship = addEntity(s, newShip(s, "cargo", 10.5, 10.5, 0));
    expect(routeLines(s)).toEqual([]);
    ship.route = building.id;
    const lines = routeLines(s);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ shipId: ship.id });
    const home = [...s.entities.values()].find(
      (e): e is BuildingEntity =>
        e.type === "building" && e.kind === "dock" && e.id !== building.id,
    )!;
    expect(lines[0]!.to).toEqual({ x: home.x + home.w / 2, y: home.y + home.h / 2 });
  });

  it("numbers ships by kind and flags the damaged ones", () => {
    const s = fresh();
    const a = addEntity(s, newShip(s, "scout", 5, 5, 0));
    const b = addEntity(s, newShip(s, "scout", 6, 5, 0));
    addEntity(s, newShip(s, "patrol", 7, 5, 0));
    b.hp = 3;
    const rows = fleetRows(s);
    expect(rows.map((r) => r.label)).toEqual(["Scout ship 1", "Scout ship 2", "Patrol boat 1"]);
    expect(rows.map((r) => r.hurt)).toEqual([false, true, false]);
    expect(rows[0]!.id).toBe(a.id);
    expect(rows[1]!.hull).toBe("Hull 3/30");
  });
});

describe("threats and sights", () => {
  const pirate = (s: GameState, x: number, y: number): PirateEntity =>
    addEntity(s, {
      id: s.nextId++,
      type: "pirate",
      x,
      y,
      heading: 0,
      hp: 36,
      path: [],
      phase: "hunt",
      target: null,
      timer: 0,
      cooldown: 0,
      loot: {},
      home: { x: 0, y: 0 },
    });

  it("reports pirates at large, nearest first, with a compass point", () => {
    const s = fresh();
    expect(currentThreat(s)).toBeNull();
    const hall = world.start.townHall;
    pirate(s, hall.x + 60, hall.y - 60);
    const near = pirate(s, hall.x + 20, hall.y - 20);
    const threat = currentThreat(s)!;
    expect(threat.pirates).toBe(2);
    expect(threat.nearest.id).toBe(near.id);
    expect(threat.direction).toBe("east");
    expect(threat.raiding).toBe(0);
    expect(threat.target).not.toBeNull();
    near.phase = "raid";
    expect(currentThreat(s)!.raiding).toBe(1);
  });

  it("only shows pirates and wrecks on explored water, and sunken sites once found", () => {
    const s = fresh();
    const p = pirate(s, 3.5, 3.5);
    expect(seaSights(s).pirates).toEqual([]);
    s.explored[3 * world.width + 3] = 1;
    expect(seaSights(s).pirates).toEqual([p]);
    expect(seaSights(s).sites).toEqual([]);
    for (const e of s.entities.values()) if (e.type === "site") e.found = true;
    expect(seaSights(s).sites).toHaveLength(world.sites.length);
  });
});

describe("helpers", () => {
  it("names compass points the way the isometric screen shows them", () => {
    const o = { x: 0, y: 0 };
    expect(compassFrom(o, { x: 10, y: 10 })).toBe("south");
    expect(compassFrom(o, { x: -10, y: -10 })).toBe("north");
    expect(compassFrom(o, { x: 10, y: -10 })).toBe("east");
    expect(compassFrom(o, { x: -10, y: 10 })).toBe("west");
    expect(compassFrom(o, { x: 10, y: 0 })).toBe("south-east");
    expect(compassFrom(o, { x: 0, y: -10 })).toBe("north-east");
  });

  it("lists only the goods that are there", () => {
    expect(goodsList({ wood: 4, stone: 0, gold: 2 })).toEqual([
      { res: "wood", n: 4 },
      { res: "gold", n: 2 },
    ]);
    expect(goodsList({})).toEqual([]);
  });

  it("keeps the sim's ship type usable here", () => {
    const s = fresh();
    const ship: ShipEntity = addEntity(s, newShip(s, "cargo", 1, 1, 0));
    expect(ship.kind).toBe("cargo");
  });
});

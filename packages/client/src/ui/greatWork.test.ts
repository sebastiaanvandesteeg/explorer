import { describe, expect, it } from "vitest";
import {
  addEntity,
  applyCommand,
  completeBuilding,
  createInitialState,
  generateWorld,
  greatWorkStages,
  islandName,
  newBuilding,
  type BuildingEntity,
  type GameState,
} from "@explorer/shared";
import { chronicleRows, goodHint, greatWorkOf, stageRows } from "./greatWork";

const world = generateWorld("gw-tests");
const fresh = (): GameState => createInitialState(world);

function withGreatWork(s: GameState): BuildingEntity {
  const hall = world.start.townHall;
  const gw = addEntity(s, newBuilding(s, "great_work", hall.x + 6, hall.y + 6, false));
  completeBuilding(s, gw);
  return gw;
}

describe("Great Work rows", () => {
  it("lists the three stages, with the first one to raise", () => {
    const s = fresh();
    expect(greatWorkOf(s)).toBeNull();
    const rows = stageRows(s, null);
    expect(rows.map((r) => r.name)).toEqual(greatWorkStages(world).map((x) => x.name));
    expect(rows.map((r) => r.state)).toEqual(["next", "later", "later"]);
    expect(rows[0]!.cost.map((c) => c.res)).toEqual(["wood", "stone", "tools"]);
    expect(rows[0]!.ready).toBe(false); // needs a finished monument to fund
  });

  it("tracks what is done, what is next and whether the treasury covers it", () => {
    const s = fresh();
    const gw = withGreatWork(s);
    expect(greatWorkOf(s)).toBe(gw);
    let rows = stageRows(s, gw);
    expect(rows.map((r) => r.state)).toEqual(["done", "next", "later"]);
    expect(rows[1]!.ready).toBe(false);
    const goods = rows[1]!.cost;
    expect(goods.map((c) => c.res)).toEqual(
      expect.arrayContaining([
        "stone",
        "gold",
        "tools",
        "sunstone",
        "rimeglass",
        "mirepearl",
        "glowcap",
      ]),
    );
    for (const c of goods) s.stock[c.res] = c.need;
    rows = stageRows(s, gw);
    expect(rows[1]!.ready).toBe(true);
    expect(applyCommand(s, { kind: "fund-great-work", buildingId: gw.id })).toEqual({ ok: true });
    expect(stageRows(s, gw).map((r) => r.state)).toEqual(["done", "building", "later"]);
    expect(stageRows(s, gw)[1]!.ready).toBe(false);
  });

  it("says where each good is found, and which islands are known", () => {
    const s = fresh();
    const desert = world.islands.find((i) => i.biome === "desert" && i.flavor !== "islet")!;
    expect(goodHint(s, "sunstone")).toBe("Sunscorch Dunes: not found yet");
    s.discovered.add(desert.id);
    expect(goodHint(s, "sunstone")).toBe(`Sunscorch Dunes: ${islandName(world, desert.id)}`);
    expect(goodHint(s, "relic")).toMatch(/Wrecks/);
    expect(goodHint(s, "wood")).toBeNull();
  });
});

describe("chronicle", () => {
  it("tells the story of the expedition", () => {
    const s = fresh();
    s.stats.hauled = 120;
    s.stats.pirates = 3;
    s.stats.wonderAt = 5 * 480;
    const rows = Object.fromEntries(chronicleRows(s).map((r) => [r.label, r.value]));
    expect(rows["Tribe"]).toBe("Islanders (Normal)");
    expect(rows["Days at sea"]).toBe("6");
    expect(rows["Goods hauled home by sea"]).toBe("120");
    expect(rows["Pirate ships sunk"]).toBe("3");
    expect(rows["Villagers"]).toBe("3");
    expect(rows["Islands found"]).toMatch(/^1 of \d+$/);
  });
});

import { describe, expect, it } from "vitest";
import {
  addEntity,
  applyCommand,
  canPlaceBuilding,
  createInitialState,
  generateWorld,
  jobCounts,
  jobOf,
  newBuilding,
  newVillager,
  tick,
  type BuildingEntity,
  type BuildingKind,
  type GameState,
  type VillagerEntity,
} from "../src";

const world = generateWorld("job-tests");

const fresh = (): GameState => {
  const s = createInitialState(world);
  Object.assign(s.stock, { wood: 500, stone: 500, food: 100, ore: 40, tools: 20 });
  return s;
};

const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(s);
};

const villagers = (s: GameState) =>
  [...s.entities.values()].filter((e): e is VillagerEntity => e.type === "villager");

const hall = world.start.townHall;

/** A free spot near the town hall, `skip` spots in. */
function spot(s: GameState, kind: BuildingKind, skip = 0): { x: number; y: number } {
  let seen = 0;
  for (let r = 3; r < 20; r++)
    for (let y = hall.y - r; y <= hall.y + r; y++)
      for (let x = hall.x - r; x <= hall.x + r; x++)
        if (canPlaceBuilding(s, kind, x, y, { ignoreCost: true }).ok && seen++ === skip)
          return { x, y };
  throw new Error(`no spot for ${kind}`);
}

function built(s: GameState, kind: BuildingKind, skip = 0): BuildingEntity {
  const at = spot(s, kind, skip);
  return addEntity(s, newBuilding(s, kind, at.x, at.y, true));
}

function addVillagers(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) addEntity(s, newVillager(s, hall.x + (i % 3), hall.y + 3));
}

describe("villagers in an adventure world", () => {
  it("find work by themselves, gathering by hand when there is no workplace", () => {
    const s = fresh();
    run(s, 20);
    const busy = villagers(s).filter((v) => jobOf(s, v) !== null);
    expect(busy.length).toBe(villagers(s).length);
  });

  it("drop their job to raise a new building, then take a new job", () => {
    const s = fresh();
    addVillagers(s, 3);
    run(s, 30);
    const before = new Map(villagers(s).map((v) => [v.id, jobOf(s, v)]));
    expect([...before.values()].every((j) => j !== null)).toBe(true);
    const at = spot(s, "house");
    expect(applyCommand(s, { kind: "place-building", building: "house", ...at }).ok).toBe(true);
    const site = [...s.entities.values()].find(
      (e): e is BuildingEntity => e.type === "building" && e.kind === "house",
    )!;
    // Within a couple of seconds exactly one of the busy villagers has downed tools for it.
    run(s, 3);
    const crew = villagers(s).filter(
      (v) => v.task?.kind === "build" && v.task.buildingId === site.id,
    );
    expect(crew).toHaveLength(1);
    const builder = crew[0]!;
    expect(before.get(builder.id)).not.toBeNull();
    // The others carry on with their jobs.
    const others = villagers(s).filter((v) => v.id !== builder.id);
    expect(others.every((v) => v.task?.kind !== "build")).toBe(true);
    run(s, 60);
    expect(site.complete).toBe(true);
    expect(jobOf(s, builder)).not.toBeNull();
    expect(builder.task?.kind).not.toBe("build");
  });

  it("spread over wood, food, stone and ore in balance", () => {
    const s = fresh();
    built(s, "lumber_camp");
    built(s, "farm");
    built(s, "quarry");
    built(s, "mine");
    addVillagers(s, 9);
    run(s, 240);
    const counts = jobCounts(s);
    const crew = villagers(s).length;
    for (const job of ["wood", "food", "stone", "ore"] as const)
      expect(counts.get(job) ?? 0, job).toBeGreaterThanOrEqual(1);
    // Nobody hoards the work: no kind of job has more than half the crew.
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(crew / 2);
    // Wood and food lead, as their shares say.
    expect(counts.get("wood")!).toBeGreaterThanOrEqual(counts.get("ore") ?? 0);
  });

  it("staff a new workplace even when everyone is already busy gathering", () => {
    const s = fresh();
    addVillagers(s, 5);
    run(s, 40);
    const farm = built(s, "farm");
    run(s, 40);
    expect(farm.workerId).not.toBeNull();
    const worker = s.entities.get(farm.workerId!) as VillagerEntity;
    expect(jobOf(s, worker)).toBe("food");
  });
});

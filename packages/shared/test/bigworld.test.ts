import { describe, expect, it } from "vitest";
import {
  addEntity,
  createInitialState,
  generateWorld,
  nearestWater,
  newShip,
  sailable,
  seaPath,
  tick,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type PirateEntity,
  type StormEntity,
} from "../src";

const world = generateWorld("big-world");

const of = <T extends { type: string }>(state: GameState, type: T["type"]) =>
  [...state.entities.values()].filter((e) => e.type === type) as unknown as T[];

const hallCentre = (w: typeof world) => ({
  x: w.start.townHall.x + 1.5,
  y: w.start.townHall.y + 1.5,
});

const dusk = 0.75 * 480;

describe("the regional world", () => {
  it("is a grid of regions, much bigger than one island group", () => {
    expect([world.width, world.height]).toEqual([WORLD_WIDTH, WORLD_HEIGHT]);
    expect(world.terrain).toHaveLength(WORLD_WIDTH * WORLD_HEIGHT);
    expect(WORLD_WIDTH * WORLD_HEIGHT).toBeGreaterThanOrEqual(10 * 192 * 192);
  });

  it("lets a ship sail from home to every far corner", () => {
    const state = createInitialState(world);
    const d = world.start.dock;
    const from = nearestWater(state, d.x + d.w + 1, d.y + 1, 6)!;
    expect(sailable(state, from.x, from.y)).toBe(true);
    const far = [
      { x: 30, y: 30 },
      { x: WORLD_WIDTH - 30, y: 30 },
      { x: WORLD_WIDTH - 30, y: WORLD_HEIGHT - 30 },
      { x: 30, y: WORLD_HEIGHT - 30 },
    ];
    for (const target of far) {
      const goal = nearestWater(state, target.x, target.y, 40)!;
      const path = seaPath(state, from, goal);
      expect(path, `route to ${target.x},${target.y}`).not.toBeNull();
      expect(path!.length).toBeGreaterThan(200);
      expect(path!.at(-1)).toEqual(goal);
    }
  });

  it("spreads sunken fortresses and ruins over the whole sea, fortresses far from home", () => {
    const fortresses = world.sites.filter((s) => s.kind === "fortress");
    const ruins = world.sites.filter((s) => s.kind === "ruin");
    expect(fortresses.length).toBeGreaterThanOrEqual(6);
    expect(ruins.length).toBeGreaterThanOrEqual(18);
    const home = hallCentre(world);
    for (const f of fortresses)
      expect(Math.hypot(f.x - home.x, f.y - home.y)).toBeGreaterThanOrEqual(100);
    // Not all in one corner: the sites reach across most of the map.
    const xs = world.sites.map((s) => s.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(WORLD_WIDTH * 0.6);
  });
});

describe("threats in a big world", () => {
  it("send raiders from over the horizon of the settlement, not from the map's edge", () => {
    const s = createInitialState(world);
    const hall = hallCentre(world);
    const distances: number[] = [];
    for (let i = 0; i < 12; i++) {
      s.time = dusk;
      s.nextRaid = 0;
      tick(s);
      for (const p of of<PirateEntity>(s, "pirate")) {
        distances.push(Math.hypot(p.x - hall.x, p.y - hall.y));
        s.entities.delete(p.id);
      }
    }
    expect(distances.length).toBeGreaterThan(5);
    // Formed 55 to 85 tiles from the settlement (the dock is a few tiles from the hall).
    for (const d of distances) {
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(100);
    }
  });

  it("also find a ship a long way from home", () => {
    const s = createInitialState(world);
    const d = world.start.dock;
    const home = nearestWater(s, d.x + d.w + 1, d.y + 1, 6)!;
    // A scout out in the far east, over three hundred tiles from the town.
    const far = nearestWater(s, WORLD_WIDTH - 60, home.y, 60)!;
    const ship = addEntity(s, newShip(s, "scout", far.x + 0.5, far.y + 0.5, 0));
    let nearShip = 0;
    for (let i = 0; i < 40; i++) {
      s.time = dusk;
      s.nextRaid = 0;
      tick(s);
      for (const p of of<PirateEntity>(s, "pirate")) {
        if (Math.hypot(p.x - ship.x, p.y - ship.y) < 100) nearShip++;
        s.entities.delete(p.id);
      }
    }
    expect(nearShip).toBeGreaterThan(0);
  });

  it("brew storms out at sea within reach of the settlement", () => {
    const s = createInitialState(world);
    const hall = hallCentre(world);
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      s.nextStorm = 0;
      s.time += 1;
      tick(s);
      for (const st of of<StormEntity>(s, "storm")) {
        seen.push(Math.hypot(st.x - hall.x, st.y - hall.y));
        s.entities.delete(st.id);
      }
    }
    expect(seen.length).toBeGreaterThan(5);
    for (const d of seen) {
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(140);
    }
  });

  it("drift storms towards the settlement so they can reach it", () => {
    const s = createInitialState(world);
    const hall = hallCentre(world);
    s.nextStorm = 0;
    tick(s);
    const storm = of<StormEntity>(s, "storm")[0]!;
    const before = Math.hypot(storm.x - hall.x, storm.y - hall.y);
    const after = Math.hypot(storm.x + storm.vx * 60 - hall.x, storm.y + storm.vy * 60 - hall.y);
    expect(after).toBeLessThan(before);
  });
});

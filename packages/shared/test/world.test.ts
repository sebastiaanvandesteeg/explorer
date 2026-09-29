import { describe, expect, it } from "vitest";
import {
  canStep,
  flood,
  generateWorld,
  isLand,
  isWater,
  tileIndex,
  Terrain,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "../src";

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe("generateWorld", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld("determinism");
    const b = generateWorld("determinism");
    expect(same(a.terrain, b.terrain)).toBe(true);
    expect(same(a.elevation, b.elevation)).toBe(true);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.start).toEqual(b.start);
  });

  it("differs between seeds", () => {
    const a = generateWorld("alpha");
    const b = generateWorld("beta");
    expect(same(a.terrain, b.terrain)).toBe(false);
  });

  const seeds = Array.from({ length: 50 }, (_, i) => `seed-${i}`);
  it.each(seeds)("builds a playable start island for %s", (seed) => {
    const w = generateWorld(seed);
    expect(w.width).toBe(WORLD_WIDTH);
    expect(w.height).toBe(WORLD_HEIGHT);
    const home = w.islands[w.start.islandId]!;
    expect(home.flavor).toBe("home");
    expect(home.tiles).toBeGreaterThan(450);
    expect(
      w.islands.filter((i) => i.flavor !== "islet" && i.flavor !== "home").length,
    ).toBeGreaterThanOrEqual(8);

    // Town hall sits on flat land.
    const th = w.start.townHall;
    const e = w.elevation[tileIndex(w, th.x, th.y)];
    for (let y = th.y; y < th.y + th.h; y++)
      for (let x = th.x; x < th.x + th.w; x++) {
        expect(isLand(w, x, y)).toBe(true);
        expect(w.elevation[tileIndex(w, x, y)]).toBe(e);
      }

    // Dock footprint is water, its landing is land and reachable from the hall.
    const dock = w.start.dock;
    for (let y = dock.y; y < dock.y + dock.h; y++)
      for (let x = dock.x; x < dock.x + dock.w; x++) expect(isWater(w, x, y)).toBe(true);
    const reach = flood(w.width, w.height, { x: th.x + 1, y: th.y + 3 }, (ax, ay, bx, by) =>
      canStep(w, ax, ay, bx, by),
    );
    expect(reach.has(tileIndex(w, dock.landing.x, dock.landing.y))).toBe(true);

    // Enough to do at the start.
    const onHome = w.nodes.filter((n) => w.island[tileIndex(w, n.x, n.y)] === home.id);
    expect(
      onHome.filter((n) => ["oak", "pine", "fruit"].includes(n.kind)).length,
    ).toBeGreaterThanOrEqual(30);
    expect(onHome.filter((n) => ["boulder", "ore"].includes(n.kind)).length).toBeGreaterThanOrEqual(
      8,
    );

    // Nodes never sit on water or on the hall.
    for (const n of w.nodes) {
      expect(isLand(w, n.x, n.y)).toBe(true);
      const inHall = n.x >= th.x && n.x < th.x + 3 && n.y >= th.y && n.y < th.y + 3;
      expect(inHall).toBe(false);
    }
    // Shallow water always hugs the coast.
    for (let k = 0; k < w.terrain.length; k++) {
      if (w.terrain[k] === Terrain.Shallow) expect(w.shore[k]).toBeLessThanOrEqual(2);
    }
  });
});

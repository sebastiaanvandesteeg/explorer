import { describe, expect, it } from "vitest";
import {
  createInitialState,
  generateWorld,
  isLandTerrain,
  sailable,
  tileIndex,
  Terrain,
  type DecoSpawn,
  type WorldMap,
} from "../src";

const SEEDS = ["islets-a", "islets-b", "islets-c"];

const isletTiles = (w: WorldMap, id: number) => {
  const tiles: number[] = [];
  for (let k = 0; k < w.island.length; k++)
    if (w.island[k] === id && isLandTerrain(w.terrain[k]!)) tiles.push(k);
  return tiles;
};

describe("islets", () => {
  it("rise into rock stacks, and the tall ones have a grassy crown", () => {
    let stacks = 0;
    let crowned = 0;
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      for (const island of w.islands.filter((i) => i.flavor === "islet")) {
        const tiles = isletTiles(w, island.id);
        const top = Math.max(0, ...tiles.map((k) => w.elevation[k]!));
        if (top >= 2) {
          stacks++;
          if (tiles.some((k) => w.terrain[k] === Terrain.Grass && w.elevation[k]! >= 2)) crowned++;
        }
        // Whatever the height, grass only grows high up: the base is sand or bare rock.
        for (const k of tiles)
          if (w.terrain[k] === Terrain.Grass) expect(w.elevation[k]).toBeGreaterThanOrEqual(2);
      }
    }
    expect(stacks).toBeGreaterThan(10);
    expect(crowned).toBe(stacks);
  });

  it("carry a tree on the highest ground of every crowned islet", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const trees = new Set(w.nodes.map((n) => tileIndex(w, n.x, n.y)));
      for (const island of w.islands.filter((i) => i.flavor === "islet")) {
        const crown = isletTiles(w, island.id).filter((k) => w.terrain[k] === Terrain.Grass);
        if (crown.length === 0) continue;
        expect(crown.some((k) => trees.has(k))).toBe(true);
      }
    }
  });
});

describe("sea arches", () => {
  const archTiles = (w: WorldMap, a: DecoSpawn) => [
    tileIndex(w, a.x, a.y),
    a.variant === 0 ? tileIndex(w, a.x + 1, a.y) : tileIndex(w, a.x, a.y + 1),
  ];

  it("stand in shallow water beside a coast, well apart, and away from the dock", () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const arches = w.decor.filter((d) => d.kind === "sea_arch");
      seen += arches.length;
      const dock = w.start.dock;
      for (const a of arches) {
        for (const k of archTiles(w, a)) {
          expect(isLandTerrain(w.terrain[k]!)).toBe(false);
          expect(w.shore[k]).toBeLessThanOrEqual(2);
        }
        expect(w.shore[tileIndex(w, a.x, a.y)]).toBe(1);
        expect(Math.abs(a.x - dock.x) > 5 || Math.abs(a.y - dock.y) > 5).toBe(true);
        for (const b of arches)
          if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(17);
      }
      // A few to a region, not a crowd.
      expect(arches.length).toBeLessThan(40);
    }
    expect(seen).toBeGreaterThan(5);
  });

  it("do not share tiles with sea rocks, and block ships on both feet", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const state = createInitialState(w);
      const rocks = new Set(
        w.decor.filter((d) => d.kind === "sea_rock").map((d) => tileIndex(w, d.x, d.y)),
      );
      for (const a of w.decor.filter((d) => d.kind === "sea_arch"))
        for (const k of archTiles(w, a)) {
          expect(rocks.has(k)).toBe(false);
          expect(sailable(state, k % w.width, Math.floor(k / w.width))).toBe(false);
        }
    }
  });

  it("leave the sea between islands sailable", () => {
    // Blocking two tiles beside a coast must not wall anything in: open water stays open.
    const w = generateWorld(SEEDS[0]!);
    const state = createInitialState(w);
    let open = 0;
    for (let k = 0; k < w.terrain.length; k++)
      if (
        w.shore[k]! > 3 &&
        !isLandTerrain(w.terrain[k]!) &&
        sailable(state, k % w.width, Math.floor(k / w.width))
      )
        open++;
    expect(open).toBeGreaterThan(w.width * w.height * 0.4);
  });
});

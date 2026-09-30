import { describe, expect, it } from "vitest";
import {
  BIOME_DEFS,
  BIOMES,
  biomeIndex,
  generateWorld,
  ISLANDS_PER_BIOME,
  NODES,
  NO_BIOME,
  REGION_SIZE,
  SIGNATURE,
  TRIBE_DEFS,
  TRIBES,
  tileIndex,
} from "../src";

describe("biomes", () => {
  it("gives the home island the tribe's biome", { timeout: 60_000 }, () => {
    for (const tribe of TRIBES) {
      const w = generateWorld("tribal", tribe);
      expect(w.tribe).toBe(tribe);
      expect(w.islands[w.start.islandId]!.biome).toBe(TRIBE_DEFS[tribe].homeBiome);
    }
  });

  it(
    "gives every biome three islands of its own, hostile ones furthest out",
    { timeout: 60_000 },
    () => {
      const byTier: number[][] = [[], [], []];
      for (let i = 0; i < 8; i++) {
        const w = generateWorld(`biomes-${i}`);
        const home = w.islands[w.start.islandId]!;
        const real = w.islands.filter((is) => is.flavor !== "islet");
        for (const biome of BIOMES) {
          // Home counts too: the town's island and two more of the same biome.
          expect(real.filter((is) => is.biome === biome)).toHaveLength(ISLANDS_PER_BIOME);
          // Each biome's islands are one of each kind, so every region has wood, food and stone.
          const flavors = real.filter((is) => is.biome === biome && is.flavor !== "home");
          expect(new Set(flavors.map((is) => is.flavor)).size).toBe(flavors.length);
          if (biome === home.biome) continue;
          const own = real.filter((is) => is.biome === biome);
          const cx = own.reduce((a, is) => a + is.cx, 0) / own.length;
          const cy = own.reduce((a, is) => a + is.cy, 0) / own.length;
          byTier[BIOME_DEFS[biome].tier]!.push(Math.hypot(cx - home.cx, cy - home.cy));
        }
        // The three islands of a biome share a region, not the whole map.
        for (const biome of BIOMES) {
          const own = real.filter((is) => is.biome === biome);
          const span = Math.max(
            ...own.flatMap((a) => own.map((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy))),
          );
          expect(span).toBeLessThan(REGION_SIZE * 1.5);
        }
      }
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(byTier[2]!)).toBeGreaterThan(mean(byTier[0]!));
    },
  );

  it("makes each biome a region about the size of a whole small world", () => {
    const w = generateWorld("regions");
    const tiles = new Array<number>(BIOMES.length).fill(0);
    for (let k = 0; k < w.biome.length; k++) {
      // Every tile, water included, belongs to some biome.
      expect(w.biome[k]).not.toBe(NO_BIOME);
      tiles[w.biome[k]!]!++;
      if (w.shore[k] === 0) expect(w.biome[k]).toBe(biomeIndex(w.islands[w.island[k]!]!.biome));
    }
    // A region is 192 x 192 = 36,864 tiles; borders wander, so allow a wide margin.
    for (const n of tiles) expect(n).toBeGreaterThan(15_000);
  }, 60_000);

  it("grows only the island's own biome plants and resources", () => {
    const w = generateWorld("flora", "sunfolk");
    for (const n of w.nodes) {
      const is = w.islands[w.island[tileIndex(w, n.x, n.y)]!]!;
      const def = BIOME_DEFS[is.biome];
      const allowed = new Set([
        ...def.trees,
        ...def.food,
        def.stone,
        ...def.deposits,
        ...(SIGNATURE[is.biome] ? [SIGNATURE[is.biome]!.node] : []),
      ]);
      expect(allowed.has(n.kind), `${n.kind} on ${is.biome}`).toBe(true);
    }
  });

  it("stocks every home island with ore for the blacksmith", () => {
    for (const tribe of TRIBES) {
      const w = generateWorld("ore-check", tribe);
      const ore = w.nodes.filter(
        (n) =>
          w.island[tileIndex(w, n.x, n.y)] === w.start.islandId && NODES[n.kind].resource === "ore",
      );
      expect(ore.length, tribe).toBeGreaterThanOrEqual(5);
    }
    // Generates a world per tribe: slow on a busy machine.
  }, 60_000);
});

import { describe, expect, it } from "vitest";
import {
  BIOME_DEFS,
  BIOMES,
  biomeIndex,
  generateWorld,
  NODES,
  NO_BIOME,
  TRIBE_DEFS,
  TRIBES,
  tileIndex,
  type BiomeId,
} from "../src";

describe("biomes", () => {
  it("gives the home island the tribe's biome", () => {
    for (const tribe of TRIBES) {
      const w = generateWorld("tribal", tribe);
      expect(w.tribe).toBe(tribe);
      expect(w.islands[w.start.islandId]!.biome).toBe(TRIBE_DEFS[tribe].homeBiome);
    }
  });

  it("spreads the other biomes over the archipelago, hostile ones furthest out", () => {
    const seen = new Set<BiomeId>();
    const byTier: number[][] = [[], [], []];
    for (let i = 0; i < 12; i++) {
      const w = generateWorld(`biomes-${i}`);
      const home = w.islands[w.start.islandId]!;
      const big = w.islands.filter((is) => is.flavor !== "islet" && is.flavor !== "home");
      for (const is of big) {
        seen.add(is.biome);
        byTier[BIOME_DEFS[is.biome].tier]!.push(Math.hypot(is.cx - home.cx, is.cy - home.cy));
      }
      // Most worlds show off nearly every biome.
      expect(new Set(big.map((is) => is.biome)).size).toBeGreaterThanOrEqual(
        Math.min(8, big.length),
      );
    }
    expect([...seen].sort()).toEqual(BIOMES.filter((b) => b !== "temperate").sort());
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(byTier[2]!)).toBeGreaterThan(mean(byTier[0]!));
  });

  it("paints each island's tiles and nearby sea with its biome", () => {
    const w = generateWorld("regions");
    for (let k = 0; k < w.terrain.length; k++) {
      const island = w.island[k]!;
      if (w.shore[k] === 0) expect(w.biome[k]).toBe(biomeIndex(w.islands[island]!.biome));
      if (w.shore[k]! > 16) expect(w.biome[k]).toBe(NO_BIOME);
    }
  });

  it("grows only the island's own biome plants and resources", () => {
    const w = generateWorld("flora", "sunfolk");
    for (const n of w.nodes) {
      const is = w.islands[w.island[tileIndex(w, n.x, n.y)]!]!;
      const def = BIOME_DEFS[is.biome];
      const allowed = new Set([...def.trees, ...def.food, def.stone, ...def.deposits]);
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
  });
});

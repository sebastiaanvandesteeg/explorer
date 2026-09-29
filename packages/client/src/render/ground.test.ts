import type { BuildingEntity } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { buildingsKey, groundMasks } from "./ground";

const world = { width: 20, height: 20 };
const building = (over: Partial<BuildingEntity>): BuildingEntity => ({
  id: 1,
  type: "building",
  kind: "house",
  x: 8,
  y: 8,
  w: 2,
  h: 2,
  progress: 1,
  complete: true,
  queue: [],
  workerId: null,
  growth: 0,
  ...over,
});
const at = (m: Uint8Array, x: number, y: number) => m[y * world.width + x]!;

describe("groundMasks", () => {
  it("tramples the ground under and around a building, fading with distance", () => {
    const { wear } = groundMasks(world, [building({})]);
    expect(at(wear, 8, 8)).toBe(255);
    expect(at(wear, 10, 8)).toBeGreaterThan(80); // just outside the footprint
    expect(at(wear, 10, 8)).toBeLessThan(255);
    expect(at(wear, 13, 8)).toBe(0); // well away
  });

  it("gives workplaces a wider yard than houses", () => {
    const house = groundMasks(world, [building({ kind: "house" })]).wear;
    const quarry = groundMasks(world, [building({ kind: "quarry" })]).wear;
    expect(at(quarry, 11, 9)).toBeGreaterThan(at(house, 11, 9));
  });

  it("ploughs the tiles under a farm and paves only finished paths", () => {
    const masks = groundMasks(world, [
      building({ id: 2, kind: "farm", x: 4, y: 4, w: 3, h: 3 }),
      building({ id: 3, kind: "path", x: 12, y: 12, w: 1, h: 1 }),
      building({ id: 4, kind: "path", x: 13, y: 12, w: 1, h: 1, complete: false }),
      building({ id: 5, kind: "dock", x: 0, y: 0, w: 3, h: 2 }),
    ]);
    expect(at(masks.field, 5, 5)).toBe(1);
    expect(at(masks.field, 7, 5)).toBe(0);
    expect(at(masks.paved, 12, 12)).toBe(1);
    expect(at(masks.paved, 13, 12)).toBe(0);
    expect(at(masks.wear, 0, 0)).toBe(0); // docks stand on water
  });

  it("fingerprints buildings so unchanged settlements are skipped", () => {
    const a = buildingsKey([building({ id: 1 }), building({ id: 2, x: 3 })]);
    expect(buildingsKey([building({ id: 2, x: 3 }), building({ id: 1 })])).toBe(a);
    expect(
      buildingsKey([building({ id: 1, complete: false }), building({ id: 2, x: 3 })]),
    ).not.toBe(a);
    // Progress alone does not change the ground.
    expect(buildingsKey([building({ id: 1, progress: 0.4 }), building({ id: 2, x: 3 })])).toBe(a);
  });
});

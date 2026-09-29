import { Terrain, surfaceHeight } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { coverAlpha, coverAt, groundHeight } from "./occlusion";

/** A 12×12 map: a plateau (elevation 2) in the lower right, beach (elevation 0) elsewhere. */
function map() {
  const width = 12;
  const height = 12;
  const terrain = new Uint8Array(width * height).fill(Terrain.Sand);
  const elevation = new Uint8Array(width * height);
  for (let y = 6; y < 12; y++)
    for (let x = 6; x < 12; x++) {
      terrain[y * width + x] = Terrain.Grass;
      elevation[y * width + x] = 2;
    }
  return { width, height, terrain, elevation };
}

describe("occlusion", () => {
  const w = map();
  const beach = surfaceHeight(true, 0);
  const plateau = surfaceHeight(true, 2);

  it("reads tile heights, with sea level off the map", () => {
    expect(groundHeight(w, 2, 2)).toBe(beach);
    expect(groundHeight(w, 8, 8)).toBe(plateau);
    expect(groundHeight(w, -1, 3)).toBe(0);
    expect(groundHeight(w, 3, 40)).toBe(0);
  });

  it("finds low ground behind a plateau hidden, and the plateau's own top or the front clear", () => {
    // Just behind the plateau's back edge (it lies in front, toward the camera): hidden.
    expect(coverAt(w, 5.5, 5.5, beach)).toBeGreaterThan(8);
    // Far from it: clear.
    expect(coverAt(w, 1.5, 1.5, beach)).toBeLessThan(0);
    // On the plateau, nothing in front is higher.
    expect(coverAt(w, 8.5, 8.5, plateau)).toBeLessThan(0);
    // Low ground in front of the plateau (toward the camera) is never hidden by it.
    expect(coverAt(w, 11.5, 2.5, beach)).toBeLessThan(0);
  });

  it("fades hidden things to a ghost, smoothly and never fully away", () => {
    expect(coverAlpha(-20)).toBe(1);
    expect(coverAlpha(3)).toBe(1);
    expect(coverAlpha(9)).toBeLessThan(1);
    expect(coverAlpha(9)).toBeGreaterThan(coverAlpha(16));
    expect(coverAlpha(100)).toBeCloseTo(0.35, 5);
  });
});

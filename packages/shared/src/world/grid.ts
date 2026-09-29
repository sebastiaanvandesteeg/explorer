import { surfaceHeight } from "../iso";
import { Terrain, type WorldMap } from "./types";

export function tileIndex(world: { width: number }, x: number, y: number): number {
  return y * world.width + x;
}

export function inBounds(world: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function isLandTerrain(t: number): boolean {
  return t !== Terrain.Deep && t !== Terrain.Shallow;
}

export function isLand(world: WorldMap, x: number, y: number): boolean {
  return inBounds(world, x, y) && isLandTerrain(world.terrain[tileIndex(world, x, y)]!);
}

export function isWater(world: WorldMap, x: number, y: number): boolean {
  return inBounds(world, x, y) && !isLandTerrain(world.terrain[tileIndex(world, x, y)]!);
}

export function elevationAt(world: WorldMap, x: number, y: number): number {
  return world.elevation[tileIndex(world, x, y)]!;
}

/** Surface height in pixels, or null outside the map. */
export function heightAt(world: WorldMap, x: number, y: number): number | null {
  if (!inBounds(world, x, y)) return null;
  const i = tileIndex(world, x, y);
  return surfaceHeight(isLandTerrain(world.terrain[i]!), world.elevation[i]!);
}

/** Villagers can step between two adjacent land tiles whose elevations differ by at most one. */
export function canStep(world: WorldMap, ax: number, ay: number, bx: number, by: number): boolean {
  if (!isLand(world, ax, ay) || !isLand(world, bx, by)) return false;
  return Math.abs(elevationAt(world, ax, ay) - elevationAt(world, bx, by)) <= 1;
}

export const NEIGHBOURS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const NEIGHBOURS_8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

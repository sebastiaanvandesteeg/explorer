// Messages between the main thread and the terrain paint worker (types only).
import type { PaintedChunk, PaintRect, TerrainWorld } from "@explorer/art";
import type { GroundMasks } from "./ground";

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface PaintInit {
  type: "init";
  world: TerrainWorld;
  chunk: number;
  /** Shallow-water colour per biome index; the last entry is the open ocean. */
  glow: [number, number, number][];
}

/** What the settlement has done to the ground; sent again whenever it changes. */
export interface PaintMasks extends GroundMasks {
  type: "masks";
}

export interface PaintRequest {
  type: "paint";
  id: number;
  cx: number;
  cy: number;
  rect: PaintRect;
}

export interface PaintReply {
  id: number;
  painted: PaintedChunk | null;
}

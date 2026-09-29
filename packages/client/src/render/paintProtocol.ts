// Messages between the main thread and the terrain paint worker (types only).
import type { PaintRect, TerrainWorld } from "@explorer/art";

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface PaintInit {
  type: "init";
  world: TerrainWorld;
  chunk: number;
  /** Shallow-water colour per biome index; the last entry is the open ocean. */
  glow: [number, number, number][];
}

/** The tiles paved by finished Path buildings; sent again whenever they change. */
export interface PaintPaved {
  type: "paved";
  paved: Uint8Array;
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
  pixels: Pixels | null;
}

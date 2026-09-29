// Web worker that paints terrain chunks (see @explorer/art) off the main thread, so panning and
// zooming never stall while new land comes into view.
import { paintChunk, type PaintOptions, type TerrainWorld } from "@explorer/art";
import type { PaintInit, PaintPaved, PaintReply, PaintRequest } from "./paintProtocol";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PaintInit | PaintPaved | PaintRequest>) => void) | null;
  postMessage(message: PaintReply, options: { transfer: Transferable[] }): void;
};

let world: TerrainWorld | null = null;
let chunk = 16;
let options: PaintOptions | null = null;

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    world = m.world;
    chunk = m.chunk;
    const glow = m.glow;
    options = { glow: (biome) => glow[biome] ?? glow[glow.length - 1]! };
    return;
  }
  if (m.type === "paved") {
    if (world) world.paved = m.paved;
    return;
  }
  const pixels = world ? paintChunk(world, m.cx, m.cy, chunk, m.rect, options!) : null;
  scope.postMessage({ id: m.id, pixels }, { transfer: pixels ? [pixels.buffer] : [] });
};

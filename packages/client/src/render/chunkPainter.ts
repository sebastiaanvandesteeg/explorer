// Paints terrain chunks in a Web Worker (or right here when workers are not available).
import {
  paintChunk,
  type PaintedChunk,
  type PaintOptions,
  type PaintRect,
  type TerrainWorld,
} from "@explorer/art";
import { BIOMES, type WorldMap } from "@explorer/shared";
import { ATMOSPHERE, OCEAN } from "./biomeStyle";
import type { GroundMasks } from "./ground";
import type { PaintInit, PaintMasks, PaintReply, PaintRequest } from "./paintProtocol";

/** Shallow-water colour for each biome index, with the open ocean's last. */
function glowTable(): [number, number, number][] {
  return [...BIOMES.map((b) => ATMOSPHERE[b].glow), OCEAN.glow];
}

interface Job {
  resolve: (painted: PaintedChunk | null) => void;
  cx: number;
  cy: number;
  rect: PaintRect;
}

export class ChunkPainter {
  private worker: Worker | null = null;
  private readonly waiting = new Map<number, Job>();
  private readonly local: { world: TerrainWorld; options: PaintOptions };
  private nextId = 1;

  constructor(
    world: WorldMap,
    private readonly chunk: number,
  ) {
    const terrain: TerrainWorld = {
      width: world.width,
      height: world.height,
      terrain: world.terrain,
      elevation: world.elevation,
      biome: world.biome,
      shore: world.shore,
    };
    const glow = glowTable();
    this.local = { world: terrain, options: { glow: (i) => glow[i] ?? glow[glow.length - 1]! } };
    if (typeof Worker === "undefined") return;
    try {
      const worker = new Worker(new URL("./paintWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<PaintReply>) => {
        const job = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        job?.resolve(e.data.painted);
      };
      worker.onerror = () => this.fallBack();
      const init: PaintInit = { type: "init", world: terrain, chunk, glow };
      worker.postMessage(init);
      this.worker = worker;
    } catch {
      this.worker = null;
    }
  }

  /** Tell the painter what the settlement has done to the ground (applies to later paints). */
  setMasks(masks: GroundMasks): void {
    Object.assign(this.local.world, masks);
    const msg: PaintMasks = { type: "masks", ...masks };
    this.worker?.postMessage(msg);
  }

  /** The images for a chunk: standing ground and wave frames (null when no land is near). */
  paint(cx: number, cy: number, rect: PaintRect): Promise<PaintedChunk | null> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.waiting.set(id, { resolve, cx, cy, rect });
      if (this.worker) {
        const req: PaintRequest = { type: "paint", id, cx, cy, rect };
        this.worker.postMessage(req);
      } else {
        setTimeout(() => this.paintHere(id), 0);
      }
    });
  }

  private paintHere(id: number): void {
    const job = this.waiting.get(id);
    if (!job) return;
    this.waiting.delete(id);
    job.resolve(
      paintChunk(this.local.world, job.cx, job.cy, this.chunk, job.rect, this.local.options),
    );
  }

  /** The worker failed to start or died: paint whatever it still owed us on this thread. */
  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const id of this.waiting.keys()) setTimeout(() => this.paintHere(id), 0);
  }

  /** Stop the worker. Jobs still waiting are dropped; their callers must ignore them. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}

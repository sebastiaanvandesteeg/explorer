import { chunkRect } from "@explorer/art";
import { generateWorld } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { ChunkPainter } from "./chunkPainter";

// No Worker exists under Node, so this exercises the paint-on-this-thread fallback.
describe("ChunkPainter", () => {
  const world = generateWorld("chunk-painter", "islanders", 64);
  const chunk = 16;
  const home = {
    cx: Math.floor(world.start.townHall.x / chunk),
    cy: Math.floor(world.start.townHall.y / chunk),
  };

  it("paints a chunk near land and nothing for open sea", async () => {
    const painter = new ChunkPainter(world, chunk);
    const rect = chunkRect(home.cx, home.cy, chunk);
    const pixels = await painter.paint(home.cx, home.cy, rect);
    expect(pixels).not.toBeNull();
    expect(pixels!.length).toBe(rect.w * rect.h * 4);
    painter.dispose();
  });

  it("repaints with newly paved tiles", async () => {
    const painter = new ChunkPainter(world, chunk);
    const rect = chunkRect(home.cx, home.cy, chunk);
    const before = await painter.paint(home.cx, home.cy, rect);
    const paved = new Uint8Array(world.width * world.height);
    const th = world.start.townHall;
    for (let x = th.x; x < th.x + 6; x++) paved[(th.y + 4) * world.width + x] = 1;
    painter.setPaved(paved);
    const after = await painter.paint(home.cx, home.cy, rect);
    expect(Buffer.from(after!.buffer).equals(Buffer.from(before!.buffer))).toBe(false);
    painter.dispose();
  });
});

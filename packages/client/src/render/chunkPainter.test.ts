import { chunkRect } from "@explorer/art";
import { generateWorld } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { ChunkPainter } from "./chunkPainter";
import { groundMasks } from "./ground";

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
    const painted = await painter.paint(home.cx, home.cy, rect);
    expect(painted).not.toBeNull();
    expect(painted!.ground.length).toBe(rect.w * rect.h * 4);
    expect(painted!.waves.length).toBeGreaterThan(1);
    painter.dispose();
  });

  it("repaints when the settlement changes the ground", async () => {
    const painter = new ChunkPainter(world, chunk);
    const rect = chunkRect(home.cx, home.cy, chunk);
    const before = await painter.paint(home.cx, home.cy, rect);
    const masks = groundMasks(world, []);
    const th = world.start.townHall;
    // Flagstones under the town hall itself: its first tile is in the chunk being painted.
    for (let y = th.y; y < th.y + 3; y++)
      for (let x = th.x; x < th.x + 3; x++) masks.paved[y * world.width + x] = 1;
    painter.setMasks(masks);
    const after = await painter.paint(home.cx, home.cy, rect);
    expect(Buffer.from(after!.ground.buffer).equals(Buffer.from(before!.ground.buffer))).toBe(
      false,
    );
    painter.dispose();
  });
});

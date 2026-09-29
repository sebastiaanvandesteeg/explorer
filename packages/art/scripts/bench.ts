import { generateWorld } from "@explorer/shared";
import { chunkRect, paintChunk } from "../src/terrain/paint";
import { Fields } from "../src/terrain/field";

const world = generateWorld("reference", "islanders");
const C = 16;
const home = {
  x: Math.floor(world.start.townHall.x / C),
  y: Math.floor(world.start.townHall.y / C),
};
const cases = [
  ["home", home.x, home.y],
  ["home+1", home.x + 1, home.y],
  ["coast", home.x - 1, home.y],
  ["ocean-ish", 0, 0],
] as const;
for (const [name, cx, cy] of cases) {
  const r = chunkRect(cx, cy, C);
  // warm up
  paintChunk(world, cx, cy, C, r);
  const n = 8;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) paintChunk(world, cx, cy, C, r);
  const total = (performance.now() - t0) / n;
  const t1 = performance.now();
  for (let i = 0; i < n; i++) new Fields(world, cx * C - 5, cy * C - 5, C + 10);
  const fields = (performance.now() - t1) / n;
  console.log(`${name.padEnd(10)} chunk ${total.toFixed(1)} ms   (fields ${fields.toFixed(1)} ms)`);
}

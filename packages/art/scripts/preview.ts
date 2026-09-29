// Dev tool: paints part of a generated world with the terrain painter and writes a PNG, without
// a browser. Usage:
//   pnpm --filter @explorer/art preview <out.png> [seed] [tribe] [target] [width] [height] [scale] [wave frame 0-2]
// `target` is an island id, "home", or "tx,ty" (tile coordinates). Sprites are not drawn.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BIOMES, HALF_H, HALF_W, generateWorld, type TribeId } from "@explorer/shared";
import { PNG } from "pngjs";
import { chunkRect, paintChunk } from "../src/terrain/paint";

const [
  out = "preview.png",
  seed = "reference",
  tribe = "islanders",
  target = "home",
  width = "960",
  height = "600",
  scale = "1",
  frame = "0",
] = process.argv.slice(2);
const wave = Number(frame);

const CHUNK = 16;
const world = generateWorld(seed, tribe as TribeId);
let cx: number;
let cy: number;
if (target === "home") {
  cx = world.start.townHall.x + 1.5;
  cy = world.start.townHall.y + 1.5;
} else if (target.includes(",")) {
  [cx, cy] = target.split(",").map(Number) as [number, number];
} else {
  const is = world.islands[Number(target)]!;
  cx = is.cx;
  cy = is.cy;
}
const W = Number(width);
const H = Number(height);
const sx = (cx - cy) * HALF_W - W / 2;
const sy = (cx + cy) * HALF_H - H / 2;

const assets = resolve(import.meta.dirname, "../../client/public/assets");
const ocean = PNG.sync.read(readFileSync(resolve(assets, "ocean_0.png")));
const img = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const ox = (((Math.floor(sx) + x) % ocean.width) + ocean.width) % ocean.width;
    const oy = (((Math.floor(sy) + y) % ocean.height) + ocean.height) % ocean.height;
    const s = (oy * ocean.width + ox) * 4;
    const d = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) img.data[d + k] = ocean.data[s + k]!;
  }

const glow = (i: number): [number, number, number] => [67, 161, 151];
void BIOMES;
const t0 = performance.now();
let painted = 0;
const cols = Math.ceil(world.width / CHUNK);
const rows = Math.ceil(world.height / CHUNK);
for (let ky = 0; ky < rows; ky++)
  for (let kx = 0; kx < cols; kx++) {
    const r = chunkRect(kx, ky, CHUNK);
    if (r.x + r.w < sx || r.x > sx + W || r.y + r.h < sy || r.y > sy + H) continue;
    const chunkImages = paintChunk(world, kx, ky, CHUNK, r, { glow });
    painted++;
    if (!chunkImages) continue;
    // The waves run under the ground, like they do in the game.
    for (const px of [chunkImages.waves[wave]!, chunkImages.ground])
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const s = (y * r.w + x) * 4;
          const a = px[s + 3]! / 255;
          if (a === 0) continue;
          const dx = r.x + x - Math.floor(sx);
          const dy = r.y + y - Math.floor(sy);
          if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
          const d = (dy * W + dx) * 4;
          for (let k = 0; k < 3; k++) img.data[d + k] = px[s + k]! * a + img.data[d + k]! * (1 - a);
        }
  }
console.log(`painted ${painted} chunks in ${(performance.now() - t0).toFixed(0)} ms`);

const k = Number(scale);
if (k === 1) writeFileSync(out, PNG.sync.write(img));
else {
  const big = new PNG({ width: W * k, height: H * k });
  for (let y = 0; y < H * k; y++)
    for (let x = 0; x < W * k; x++) {
      const s = (Math.floor(y / k) * W + Math.floor(x / k)) * 4;
      const d = (y * W * k + x) * 4;
      for (let c = 0; c < 4; c++) big.data[d + c] = img.data[s + c]!;
    }
  writeFileSync(out, PNG.sync.write(big));
}
console.log(`wrote ${out}`);

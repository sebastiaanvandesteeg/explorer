// Dev helper: compose a small island from the generated sprites to judge seams and style.
// Usage: tsx src/scene-preview.ts <out.png> [scale]
import { writeFileSync } from "node:fs";
import { surfaceHeight, worldToScreen } from "@explorer/shared";
import { Canvas } from "./canvas";
import { encodePng } from "./png";
import { allSprites } from "./registry";
import { oceanFrame } from "./sprites/terrain";

const [out = "scene.png", scaleArg = "2"] = process.argv.slice(2);
const scale = Number(scaleArg);
const sprites = new Map(allSprites().map((s) => [s.name, s]));
const N = 16;
// Elevation map: -1 water, 0.. land levels.
const elev: number[][] = [];
for (let y = 0; y < N; y++) {
  elev.push([]);
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 7.5, (y - 7.5) * 1.1);
    const e = d < 3.5 ? 2 : d < 5.5 ? 1 : d < 6.5 ? 0 : -1;
    elev[y]!.push(x > 9 && y > 8 && e >= 0 ? 0 : e);
  }
}
const land = (x: number, y: number) => (elev[y]?.[x] ?? -1) >= 0;
const height = (x: number, y: number) => {
  const e = elev[y]?.[x];
  return e === undefined || e < 0 ? 0 : surfaceHeight(true, e);
};
const terrainOf = (x: number, y: number) => ((elev[y]?.[x] ?? -1) === 0 ? "sand" : "grass");

const W = 32 * N + 64;
const H = 16 * N + 120;
const ox = W / 2;
const oy = 80;
const c = new Canvas(W, H);
const ocean = oceanFrame(0);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) c.set(x, y, ocean.get(x % ocean.width, y % ocean.height));

const put = (name: string, sx: number, sy: number) => {
  const s = sprites.get(name);
  if (!s) throw new Error(`missing sprite ${name}`);
  c.draw(s.canvas, Math.round(ox + sx - s.anchorX), Math.round(oy + sy - s.anchorY));
};

for (let sum = 0; sum < N * 2; sum++) {
  for (let x = 0; x < N; x++) {
    const y = sum - x;
    if (y < 0 || y >= N) continue;
    const p = worldToScreen(x, y);
    if (!land(x, y)) {
      let near = 99;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (land(x + dx, y + dy)) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)));
      if (near === 1) put("w_shallow_1", p.x, p.y);
      else if (near === 2) put("w_shallow_2", p.x, p.y);
      if (land(x - 1, y)) put("w_foam_-x", p.x, p.y);
      if (land(x, y - 1)) put("w_foam_-y", p.x, p.y);
      if (land(x + 1, y)) put("w_foam_+x", p.x, p.y);
      if (land(x, y + 1)) put("w_foam_+y", p.x, p.y);
      if (near > 2 && (x * 7 + y * 3) % 11 === 0) put("w_kelp_0", p.x, p.y);
      continue;
    }
    const h = height(x, y);
    const t = terrainOf(x, y);
    const lip = t === "sand" ? "sand" : "grass";
    const v = (x * 3 + y * 5) % 4;
    put(t === "sand" ? `t_sand_${v % 3}` : `t_grass_${v}`, p.x, p.y - h);
    const dl = h - height(x, y + 1);
    if (dl > 0) put(`c_left_${dl}_${lip}`, p.x, p.y - h);
    const dr = h - height(x + 1, y);
    if (dr > 0) put(`c_right_${dr}_${lip}`, p.x, p.y - h);
  }
  // Objects on this diagonal.
  const objects: [number, number, string][] = [
    [6, 5, "house"],
    [4, 7, "tree_oak_0"],
    [5, 9, "tree_pine_1"],
    [9, 6, "tree_oak_2"],
    [8, 9, "rock_boulder_0"],
    [3, 5, "tree_pine_0"],
    [10, 4, "bush_berry"],
  ];
  for (const [x, y, name] of objects) {
    if (x + y !== sum) continue;
    const p = worldToScreen(x, y);
    put(name, p.x, p.y - height(x, y));
  }
}
put("sea_rock_0", worldToScreen(14, 3).x, worldToScreen(14, 3).y);

const big = new Canvas(W * scale, H * scale);
for (let y = 0; y < big.height; y++)
  for (let x = 0; x < big.width; x++)
    big.set(x, y, c.get(Math.floor(x / scale), Math.floor(y / scale)));
writeFileSync(out, encodePng(big));
console.log(`scene → ${out}`);

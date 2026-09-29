// Dev helper: render sprites (optionally filtered by name prefix) enlarged onto one sheet.
// Usage: tsx src/preview.ts <out.png> [scale] [prefix...]
import { writeFileSync } from "node:fs";
import { Canvas } from "./canvas";
import { hexToRgba } from "./palette";
import { encodePng } from "./png";
import { allSprites } from "./registry";

const [out = "preview.png", scaleArg = "3", ...prefixes] = process.argv.slice(2);
const scale = Number(scaleArg);
const sprites = allSprites().filter(
  (s) => prefixes.length === 0 || prefixes.some((p) => s.name.startsWith(p)),
);

const gap = 6;
const maxWidth = 1400;
let x = gap;
let y = gap;
let rowH = 0;
const placed: { sx: number; sy: number; s: (typeof sprites)[number] }[] = [];
for (const s of sprites) {
  const w = s.canvas.width * scale;
  const h = s.canvas.height * scale;
  if (x + w + gap > maxWidth) {
    x = gap;
    y += rowH + gap;
    rowH = 0;
  }
  placed.push({ sx: x, sy: y, s });
  x += w + gap;
  rowH = Math.max(rowH, h);
}
const sheet = new Canvas(maxWidth, y + rowH + gap);
const bg = hexToRgba("#556128");
const bg2 = hexToRgba("#4f5a26");
for (let py = 0; py < sheet.height; py++)
  for (let px = 0; px < sheet.width; px++)
    sheet.set(px, py, ((px >> 4) + (py >> 4)) % 2 ? bg : bg2);
for (const { sx, sy, s } of placed) {
  for (let py = 0; py < s.canvas.height; py++) {
    for (let px = 0; px < s.canvas.width; px++) {
      const c = s.canvas.get(px, py);
      if (c[3] === 0) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          sheet.blend(sx + px * scale + dx, sy + py * scale + dy, c);
    }
  }
  // Anchor marker.
  sheet.set(sx + s.anchorX * scale, sy + s.anchorY * scale, [255, 0, 255, 255]);
}
writeFileSync(out, encodePng(sheet));
console.log(`${placed.length} sprites → ${out}`);

// Samples the concept art to seed the curated palette in packages/art/src/palette.ts.
// Usage: pnpm sprites:palette [--crops <dir>]
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE = resolve(ROOT, "docs/concept-art.webp");
const OUT = resolve(import.meta.dirname, "../palette.extracted.json");

/** Hand-picked sample points (in the 2000×1119 concept art) for each material. */
const SAMPLES: Record<string, [number, number][]> = {
  deepWater: [
    [1000, 900],
    [300, 700],
    [700, 1050],
  ],
  shallowWater: [
    [880, 250],
    [1180, 470],
    [980, 180],
  ],
  sand: [
    [420, 505],
    [1720, 470],
    [880, 200],
  ],
  grass: [
    [600, 330],
    [1600, 380],
    [1330, 690],
  ],
  oakLeaf: [
    [300, 150],
    [420, 70],
    [1260, 600],
  ],
  pine: [
    [1500, 100],
    [1650, 60],
    [1880, 290],
  ],
  thatch: [
    [540, 125],
    [1780, 330],
    [1240, 690],
  ],
  slate: [
    [1600, 220],
    [1440, 700],
  ],
  plaster: [
    [505, 175],
    [420, 370],
    [1770, 370],
  ],
  timber: [
    [620, 450],
    [1380, 410],
    [1200, 930],
  ],
  rock: [
    [180, 480],
    [1060, 800],
    [1480, 1010],
  ],
  wheat: [
    [620, 280],
    [580, 300],
  ],
  sunflower: [
    [420, 240],
    [460, 250],
  ],
  fire: [[1440, 790]],
  log: [
    [1270, 230],
    [1680, 420],
  ],
  sail: [
    [940, 560],
    [960, 520],
  ],
  stoneBlock: [
    [1330, 780],
    [1620, 790],
  ],
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const hex = ({ r, g, b }: Rgb) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function kmeans(pixels: Rgb[], k: number, iterations = 12): { color: Rgb; count: number }[] {
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centers = Array.from({ length: k }, (_, i) => ({ ...pixels[i * step]! }));
  let counts = new Array<number>(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0 }));
    counts = new Array<number>(k).fill(0);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const q = centers[c]!;
        const d = (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      const s = sums[best]!;
      s.r += p.r;
      s.g += p.g;
      s.b += p.b;
      counts[best]!++;
    }
    centers = centers.map((c, i) =>
      counts[i]! > 0
        ? { r: sums[i]!.r / counts[i]!, g: sums[i]!.g / counts[i]!, b: sums[i]!.b / counts[i]! }
        : c,
    );
  }
  return centers.map((color, i) => ({ color, count: counts[i]! }));
}

const image = sharp(SOURCE);
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const at = (x: number, y: number): Rgb => {
  const i = (y * info.width + x) * info.channels;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
};

const regions: Record<string, string[]> = {};
for (const [name, points] of Object.entries(SAMPLES)) {
  regions[name] = points.map(([x, y]) => {
    // Median of a 7×7 box so single highlight pixels don't dominate.
    const box: Rgb[] = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) box.push(at(x + dx, y + dy));
    const med = (key: keyof Rgb) => box.map((p) => p[key]).sort((a, b) => a - b)[24]!;
    return hex({ r: med("r"), g: med("g"), b: med("b") });
  });
}

const pixels: Rgb[] = [];
for (let y = 0; y < info.height; y += 4)
  for (let x = 0; x < info.width; x += 4) pixels.push(at(x, y));
const clusters = kmeans(pixels, 48)
  .filter((c) => c.count > 0)
  .sort((a, b) => b.count - a.count)
  .map((c) => ({ hex: hex(c.color), share: +(c.count / pixels.length).toFixed(4) }));

writeFileSync(OUT, JSON.stringify({ source: "docs/concept-art.webp", regions, clusters }, null, 2));
console.log(`wrote ${OUT}`);

const cropsFlag = process.argv.indexOf("--crops");
if (cropsFlag >= 0) {
  const dir = resolve(process.argv[cropsFlag + 1] ?? "crops");
  mkdirSync(dir, { recursive: true });
  const crops: Record<string, [number, number, number, number]> = {
    farm: [300, 40, 420, 380],
    lumber: [1180, 60, 520, 420],
    forge: [1180, 560, 540, 400],
    ship: [780, 420, 280, 250],
    dock: [460, 380, 360, 180],
  };
  for (const [name, [left, top, width, height]] of Object.entries(crops)) {
    await sharp(SOURCE)
      .extract({ left, top, width, height })
      .png()
      .toFile(resolve(dir, `${name}.png`));
  }
  console.log(`wrote crops to ${dir}`);
}

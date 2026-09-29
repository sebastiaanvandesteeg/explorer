// Generates the sprite atlas and ocean textures into packages/client/public/assets.
// `--check` verifies the committed files match the generator instead of writing them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import type { Canvas } from "./canvas";
import { pack } from "./pack";
import { encodePng } from "./png";
import { allSprites } from "./registry";
import { oceanFrame } from "./sprites/terrain";

const OUT = resolve(import.meta.dirname, "../../../packages/client/public/assets");
const check = process.argv.includes("--check");

const { image, json } = pack(allSprites());
const outputs: { file: string; canvas?: Canvas; text?: string }[] = [
  { file: "atlas.png", canvas: image },
  { file: "atlas.json", text: JSON.stringify(json, null, 1) + "\n" },
  ...[0, 1, 2].map((f) => ({ file: `ocean_${f}.png`, canvas: oceanFrame(f) })),
];

if (check) {
  const stale: string[] = [];
  for (const o of outputs) {
    const path = resolve(OUT, o.file);
    if (!existsSync(path)) {
      stale.push(o.file);
      continue;
    }
    if (o.text !== undefined) {
      if (readFileSync(path, "utf8") !== o.text) stale.push(o.file);
      continue;
    }
    // Compare decoded pixels, not PNG bytes: zlib versions may compress differently.
    const png = PNG.sync.read(readFileSync(path));
    const want = o.canvas!;
    if (
      png.width !== want.width ||
      png.height !== want.height ||
      !Buffer.from(want.data.buffer).equals(png.data)
    ) {
      stale.push(o.file);
    }
  }
  if (stale.length > 0) {
    console.error(`Sprite assets are out of date: ${stale.join(", ")}. Run \`pnpm sprites\`.`);
    process.exit(1);
  }
  console.log(`sprite assets up to date (${Object.keys(json.frames).length} frames)`);
} else {
  mkdirSync(OUT, { recursive: true });
  for (const o of outputs) {
    const path = resolve(OUT, o.file);
    writeFileSync(path, o.text ?? encodePng(o.canvas!));
  }
  console.log(
    `wrote ${Object.keys(json.frames).length} frames into a ${json.meta.size.w}×${json.meta.size.h} atlas → ${OUT}`,
  );
}

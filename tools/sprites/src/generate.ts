// Generates the sprite atlas pages, their manifest and the ocean textures into
// packages/client/public/assets. `--check` verifies the committed files instead of writing them.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import type { Canvas } from "./canvas";
import { pack } from "./pack";
import { encodePng } from "./png";
import { allSprites } from "./registry";
import { oceanFrame } from "./sprites/terrain";

const OUT = resolve(import.meta.dirname, "../../../packages/client/public/assets");
const check = process.argv.includes("--check");

const { pages, manifest } = pack(allSprites());
const outputs: { file: string; canvas?: Canvas; text?: string }[] = [
  { file: "atlas.json", text: JSON.stringify(manifest, null, 1) + "\n" },
  ...pages.flatMap((p, i) => [
    { file: `atlas-${i}.png`, canvas: p.image },
    { file: `atlas-${i}.json`, text: JSON.stringify(p.json, null, 1) + "\n" },
  ]),
  ...[0, 1, 2].map((f) => ({ file: `ocean_${f}.png`, canvas: oceanFrame(f) })),
];
const expected = new Set(outputs.map((o) => o.file));
const isGenerated = (f: string) => /^(atlas(-\d+)?\.(png|json)|ocean_\d\.png)$/.test(f);

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
  for (const f of existsSync(OUT) ? readdirSync(OUT) : []) {
    if (isGenerated(f) && !expected.has(f)) stale.push(`${f} (leftover)`);
  }
  if (stale.length > 0) {
    console.error(`Sprite assets are out of date: ${stale.join(", ")}. Run \`pnpm sprites\`.`);
    process.exit(1);
  }
  console.log(
    `sprite assets up to date (${Object.keys(manifest.sprites).length} frames, ${pages.length} pages)`,
  );
} else {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (isGenerated(f) && !expected.has(f)) rmSync(resolve(OUT, f));
  for (const o of outputs) writeFileSync(resolve(OUT, o.file), o.text ?? encodePng(o.canvas!));
  console.log(
    `wrote ${Object.keys(manifest.sprites).length} frames on ${pages.length} page(s) (${pages
      .map((p) => `${p.image.width}×${p.image.height}`)
      .join(", ")}) → ${OUT}`,
  );
}

// Dev helper: screenshot one island of every biome from a revealed offline world.
// Needs the dev server (pnpm dev). Usage: node scripts/biome-shots.mjs <out-dir> [seed] [tribe]
import { chromium } from "@playwright/test";
const [out = "biome-shots", seed = "biomes", tribe = "sunfolk"] = process.argv.slice(2);
await import("node:fs").then((fs) => fs.mkdirSync(out, { recursive: true }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://localhost:5190/play?offline&seed=${seed}&tribe=${tribe}&reveal`);
await page.waitForFunction(() => !!window.__game);
await page.waitForTimeout(1500);
for (const biome of [
  "temperate",
  "desert",
  "infernal",
  "tundra",
  "jungle",
  "swamp",
  "fungal",
  "crystal",
  "autumn",
  "blossom",
]) {
  const found = await page.evaluate((b) => {
    const g = window.__game;
    const w = g.session.state.world;
    const is = w.islands
      .filter((i) => i.biome === b && i.flavor !== "islet")
      .sort((a, c) => c.radius - a.radius)[0];
    if (!is) return false;
    g.centerOnTile(is.cx, is.cy);
    return true;
  }, biome);
  if (!found) {
    console.log("missing", biome);
    continue;
  }
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/${biome}.png` });
  console.log("shot", biome);
}
await browser.close();

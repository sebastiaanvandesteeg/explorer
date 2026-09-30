// The home page: static copy in index.html, dressed with the game's own sprites, tribes and
// biomes. It reads the atlas without PixiJS, so the page stays light and the game loads on /play.
import "./landing.css";
import { BIOME_DEFS, BIOMES, TRIBE_DEFS, TRIBES } from "@explorer/shared";
import biomes from "../../../../docs/biomes.webp";
import daynight from "../../../../docs/daynight.webp";
import screenshot from "../../../../docs/screenshot.png";
import "../site/site.css";
import { mountShell } from "../site/shell";
import { dressSprites, plot } from "../site/sprites";
import { h } from "../ui/dom";

mountShell("home");

const DISTANCE = ["Near home", "Further out", "Far away"] as const;

// Counts in the copy come from the game itself.
const COUNTS: Record<string, number> = { tribes: TRIBES.length, biomes: BIOMES.length };
for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
  el.textContent = String(COUNTS[el.dataset.count!]);
}

// The README's pictures, imported so both Vite's dev server and the build can serve them.
const SHOTS: Record<string, string> = { screenshot, biomes, daynight };
for (const img of document.querySelectorAll<HTMLImageElement>("img[data-shot]")) {
  img.src = SHOTS[img.dataset.shot!]!;
}

// Sprites named in the page: `data-sprite`, with `data-scale` and, to stand on land, `data-tiles`.
dressSprites();

document.querySelector("[data-tribes]")?.append(
  ...TRIBES.map((id) => {
    const def = TRIBE_DEFS[id];
    const card = h(
      "article.tribe-card.panel",
      {},
      h("div.pic", {}, plot(`b_town_hall_${id}`, 3, def.homeBiome, 2)),
      h("h3", {}, def.name),
      h("p", {}, def.description),
      h(
        "dl",
        {},
        h("dt", {}, "Home"),
        h("dd", {}, BIOME_DEFS[def.homeBiome].name),
        h("dt", {}, "Bonus"),
        h("dd", {}, def.bonusText),
      ),
    );
    card.style.setProperty("--banner", def.banner);
    return card;
  }),
);

document.querySelector("[data-biomes]")?.append(
  ...[...BIOMES]
    .sort((a, b) => BIOME_DEFS[a].tier - BIOME_DEFS[b].tier)
    .map((id) => {
      const def = BIOME_DEFS[id];
      return h(
        "li.biome.panel",
        {},
        h("div.pic", {}, plot(`n_${def.trees[0]}_0`, 1, id, 2)),
        h("strong", {}, def.name),
        h("small", { dataset: { tier: String(def.tier) } }, DISTANCE[def.tier]),
      );
    }),
);

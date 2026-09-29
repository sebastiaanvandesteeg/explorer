// The landing page: static copy in index.html, dressed with the game's own sprites, tribes and
// biomes. It reads the atlas without PixiJS, so the page stays light and the game loads on /play.
import "./landing.css";
import {
  BIOME_DEFS,
  BIOMES,
  ELEV_PX,
  TILE_H,
  TILE_W,
  TRIBE_DEFS,
  TRIBES,
  type BiomeId,
} from "@explorer/shared";
import biomes from "../../../../docs/biomes.webp";
import daynight from "../../../../docs/daynight.webp";
import screenshot from "../../../../docs/screenshot.png";
import { fetchAtlasFiles, frameStyle } from "../atlasFiles";
import { ATMOSPHERE } from "../render/biomeStyle";
import { h } from "../ui/dom";

const SVG = "http://www.w3.org/2000/svg";
const DISTANCE = ["Near home", "Further out", "Far away"] as const;

const atlas = fetchAtlasFiles();

/** An atlas frame as a pixelated element; it stays empty if the atlas or the frame is missing. */
function sprite(name: string, scale: number): HTMLElement {
  const el = h("span.sprite");
  void atlas.then((a) => {
    const meta = a.sprites[name];
    if (meta)
      Object.assign(el.style, frameStyle(a.pages[meta.page]!, name, scale / (meta.res ?? 1)));
  });
  return el;
}

/** A block of land as the game draws it: a diamond of ground `tiles` tiles across on a cliff. */
function islet(tiles: number, biome: BiomeId, scale: number): SVGSVGElement {
  const w = tiles * TILE_W;
  const d = tiles * TILE_H;
  const { ground, rock } = ATMOSPHERE[biome].map;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${d + ELEV_PX}`);
  svg.setAttribute("width", String(w * scale));
  svg.setAttribute("height", String((d + ELEV_PX) * scale));
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("islet");
  const faces: [string, string, string?][] = [
    [`0,${d / 2} ${w / 2},${d} ${w / 2},${d + ELEV_PX} 0,${d / 2 + ELEV_PX}`, rock],
    [`${w},${d / 2} ${w / 2},${d} ${w / 2},${d + ELEV_PX} ${w},${d / 2 + ELEV_PX}`, rock, "shade"],
    [`${w / 2},0 ${w},${d / 2} ${w / 2},${d} 0,${d / 2}`, ground],
  ];
  for (const [points, fill, cls] of faces) {
    const p = document.createElementNS(SVG, "polygon");
    p.setAttribute("points", points);
    p.setAttribute("fill", fill);
    if (cls) p.classList.add(cls);
    svg.append(p);
  }
  return svg;
}

/** A sprite standing on its footprint, anchored like the game anchors it (the top vertex). */
function plot(name: string, tiles: number, biome: BiomeId, scale: number): HTMLElement {
  const pic = sprite(name, scale);
  const el = h("div.plot", {}, islet(tiles, biome, scale), pic);
  void atlas.then((a) => {
    const meta = a.sprites[name];
    if (!meta) return;
    // The anchor is in texels; a double-resolution frame has two to the world pixel.
    const res = meta.res ?? 1;
    pic.style.left = `${((tiles * TILE_W) / 2 - meta.anchorX / res) * scale}px`;
    pic.style.top = `${(-meta.anchorY / res) * scale}px`;
  });
  return el;
}

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
for (const el of document.querySelectorAll<HTMLElement>("[data-sprite]")) {
  const { sprite: name, scale = "2", tiles } = el.dataset;
  el.append(
    tiles ? plot(name!, Number(tiles), "temperate", Number(scale)) : sprite(name!, Number(scale)),
  );
}

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

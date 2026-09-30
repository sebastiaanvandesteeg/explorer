// The game's own sprites on the site's pages. They read the atlas without PixiJS, so the pages stay
// light and the game only loads on /play.
import {
  BIOME_DEFS,
  ELEV_PX,
  NODE_VARIANTS,
  TILE_H,
  TILE_W,
  type BiomeId,
  type NodeKind,
} from "@explorer/shared";
import { fetchAtlasFiles, frameStyle } from "../atlasFiles";
import { ATMOSPHERE } from "../render/biomeStyle";
import { h } from "../ui/dom";

const SVG = "http://www.w3.org/2000/svg";
const atlas = fetchAtlasFiles();

/** An atlas frame as a pixelated element; it stays empty if the atlas or the frame is missing. */
export function sprite(name: string, scale: number): HTMLElement {
  const el = h("span.sprite");
  void atlas.then((a) => {
    const meta = a.sprites[name];
    if (meta)
      Object.assign(el.style, frameStyle(a.pages[meta.page]!, name, scale / (meta.res ?? 1)));
  });
  return el;
}

/** A block of land as the game draws it: a diamond of ground `tiles` tiles across on a cliff. */
export function islet(tiles: number, biome: BiomeId, scale: number): SVGSVGElement {
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
export function plot(name: string, tiles: number, biome: BiomeId, scale: number): HTMLElement {
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

/** Fill every `[data-sprite]` element of a page: `data-scale`, and `data-tiles` to stand on land. */
export function dressSprites(root: ParentNode = document, biome: BiomeId = "temperate"): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-sprite]")) {
    const { sprite: name, scale = "2", tiles } = el.dataset;
    el.append(
      tiles ? plot(name!, Number(tiles), biome, Number(scale)) : sprite(name!, Number(scale)),
    );
  }
}

const nodeName = (kind: NodeKind, variant = 0) => `n_${kind}_${variant % NODE_VARIANTS[kind]}`;

/**
 * A row of little islets crowned with a biome's own trees, rocks, plants and deposits: a banner for
 * a themed page.
 */
export function skyline(biome: BiomeId, scale = 2): HTMLElement {
  const def = BIOME_DEFS[biome];
  const pick = <T>(list: readonly T[], i: number) => list[i % list.length]!;
  const kinds: [NodeKind, number][] = [
    [def.stone, 0],
    [pick(def.trees, 0), 0],
    [pick(def.food, 0), 0],
    [pick(def.trees, 1), 1],
    [pick(def.deposits, 0), 0],
    [pick(def.trees, 2), 2],
    [def.stone, 1],
  ];
  const row = h("div.skyline", { "aria-hidden": "true" });
  kinds.forEach(([kind, variant], i) => {
    const item = h("div.skyline-item", {}, plot(nodeName(kind, variant), 1, biome, scale));
    item.style.setProperty("--lift", `${[0, 10, 4, 14, 2, 8, 0][i]}px`);
    row.append(item);
  });
  return row;
}

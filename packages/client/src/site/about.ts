// The about page: the story of how the game was made, a timeline, and a few numbers from the game's
// own data. The words live in content/about.ts.
import {
  BIOMES,
  MAX_PLAYERS,
  PLAY_PATH,
  TRIBE_DEFS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@explorer/shared";
import "../landing/landing.css";
import { h } from "../ui/dom";
import { STORY, TIMELINE } from "./content/about";
import { mountShell } from "./shell";
import "./site.css";
import { skyline } from "./sprites";

const shell = mountShell("about", "blossom");
document.body.classList.add("themed");
document.title = "About · Explorer";

const numbers: [string, string][] = [
  [String(BIOMES.length), "biomes"],
  [String(Object.keys(TRIBE_DEFS).length), "tribes"],
  [String(MAX_PLAYERS), "players per world"],
  [`${WORLD_WIDTH}×${WORLD_HEIGHT}`, "tiles of sea"],
];

document
  .getElementById("page")!
  .replaceChildren(
    h(
      "header.page-hero",
      {},
      skyline("blossom"),
      h("p.eyebrow", {}, "About"),
      h("h1.title", {}, "How Explorer got made"),
      h("p.lede", {}, "A small story about a small game that kept growing islands."),
    ),
    h(
      "section.prose",
      {},
      ...STORY.map((s) =>
        s.pull
          ? h("p.pull", {}, s.text)
          : h("div", {}, s.heading ? h("h2", {}, s.heading) : null, h("p", {}, s.text)),
      ),
    ),
    h("section.prose", {}, h("h2", {}, "Along the way")),
    h(
      "ol.timeline",
      {},
      ...TIMELINE.map((m) =>
        h("li.panel", {}, h("time", {}, m.when), h("h3", {}, m.title), h("p", {}, m.text)),
      ),
    ),
    h("section.prose", {}, h("h2", {}, "By the numbers")),
    h(
      "dl.facts.panel",
      {},
      ...numbers.map(([value, label]) => h("div", {}, h("dd", {}, value), h("dt", {}, label))),
    ),
    h(
      "section.about-cta.panel",
      {},
      h("p", {}, "The best way to understand it is to sail it."),
      h("a.btn.primary", { href: PLAY_PATH }, "Play Explorer"),
    ),
  );
shell.theme("blossom");

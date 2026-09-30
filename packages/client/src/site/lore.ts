// The lore page: the tale of the Sundered Sea, one chapter per place, with a side menu. As you scroll,
// the chapter that is on screen dresses the whole page in its biome.
import { BIOME_DEFS, TRIBE_DEFS, type BiomeId } from "@explorer/shared";
import "../landing/landing.css";
import { h } from "../ui/dom";
import { LORE, PART_TITLES, type LoreEntry, type Part } from "./content/lore";
import { mountShell } from "./shell";
import "./site.css";
import { skyline } from "./sprites";
import { siteTheme } from "./theme";

const shell = mountShell("lore", "temperate");
document.body.classList.add("themed");
document.title = "The Lore · Explorer";

function chapter(c: LoreEntry): HTMLElement {
  const tribe = c.tribe ? TRIBE_DEFS[c.tribe] : null;
  const def = BIOME_DEFS[c.theme];
  const facts: { label: string; value: string }[] = [
    ...(tribe
      ? [
          { label: "The people", value: `${tribe.name}: ${tribe.description}` },
          { label: "Their gift", value: tribe.bonusText },
          { label: "Home", value: def.name },
        ]
      : []),
    ...(c.facts ?? []),
  ];
  return h(
    "section.chapter",
    { id: c.id, dataset: { theme: c.theme } },
    h(
      "header",
      {},
      h("p.tier", {}, c.kicker),
      h("h2", {}, c.title),
      c.skyline ? skyline(c.theme, 1) : null,
    ),
    ...c.paragraphs.map((p) => h("p", {}, p)),
    facts.length
      ? h(
          "dl.chapter-facts",
          {},
          ...facts.map((f) => h("div", {}, h("dt", {}, f.label), h("dd", {}, f.value))),
        )
      : null,
    c.proverb ? h("blockquote.proverb", {}, `“${c.proverb}”`) : null,
  );
}

const links = new Map<string, HTMLAnchorElement>();
const menu = h("nav.chapters.panel", { "aria-label": "Chapters" });
let part: Part | null = null;
for (const c of LORE) {
  if (c.part !== part) {
    part = c.part;
    menu.append(h("small", {}, PART_TITLES[part]));
  }
  const a = h(
    "a",
    { href: `#${c.id}` },
    h("i", { "aria-hidden": "true" }),
    c.title,
  ) as HTMLAnchorElement;
  a.style.setProperty("--ch", siteTheme(c.theme).vars["--t-accent"]);
  links.set(c.id, a);
  menu.append(a);
}

document
  .getElementById("page")!
  .replaceChildren(
    h(
      "header.page-hero",
      {},
      skyline("temperate"),
      h("p.eyebrow", {}, "The lore"),
      h("h1.title", {}, "The Sundered Sea"),
      h(
        "p.lede",
        {},
        "Once there was one land. Now there are nine peoples, ten climates and a great deal of water. Scroll, and watch the world change around the story.",
      ),
    ),
    h("div.lore-layout", {}, menu, h("div.chapter-list", {}, ...LORE.map(chapter))),
  );

// Whichever chapter crosses the middle of the screen sets the theme and the highlighted link.
let current = "";
function focus(id: string, biome: BiomeId): void {
  if (id === current) return;
  current = id;
  shell.theme(biome);
  for (const [key, a] of links) a.setAttribute("aria-current", String(key === id));
}
focus(LORE[0]!.id, LORE[0]!.theme);
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      focus(el.id, el.dataset.theme as BiomeId);
    }
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
document.querySelectorAll(".chapter").forEach((el) => seen.observe(el));

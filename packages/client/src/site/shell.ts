// What every page of the site shares: the animated sea, weather over it, the top bar and the footer.
import { newsPath, PLAY_PATH } from "@explorer/shared";
import { h } from "../ui/dom";
import { Weather } from "./particles";
import { applyTheme, siteTheme, type SiteTheme } from "./theme";
import type { BiomeId } from "@explorer/shared";
import type { ThemeVar } from "./theme";

export type PageId = "home" | "news" | "lore" | "about";

const PAGES: { id: PageId; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "/home" },
  { id: "news", label: "News", href: newsPath() },
  { id: "lore", label: "The Lore", href: "/the-lore" },
  { id: "about", label: "About", href: "/about" },
];

export interface Shell {
  /** Dress the page in a biome's theme: colours fade, weather changes. */
  theme(biome: BiomeId, overrides?: Partial<Record<ThemeVar, string>>): SiteTheme;
  /** The biome of the current theme. */
  readonly biome: BiomeId;
}

export function mountShell(active: PageId, initial: BiomeId = "temperate"): Shell {
  const sea = h("div.sea", { "aria-hidden": "true" });
  const canvas = h("canvas.weather", { "aria-hidden": "true" }) as HTMLCanvasElement;
  const bar = h(
    "header.topbar.panel",
    {},
    h("a.brand", { href: "/" }, h("span.brand-mark", { "aria-hidden": "true" }), "Explorer"),
    h(
      "nav",
      { "aria-label": "Pages" },
      ...PAGES.map((p) =>
        h("a", { href: p.href, ...(p.id === active ? { "aria-current": "page" } : {}) }, p.label),
      ),
    ),
    h("a.btn.primary", { href: PLAY_PATH }, "Play"),
  );
  const footer = h(
    "footer.footer",
    {},
    h(
      "nav",
      { "aria-label": "Footer" },
      ...PAGES.map((p) => h("a", { href: p.href }, p.label)),
      h("a", { href: PLAY_PATH }, "Play"),
    ),
    h("p", {}, "Explorer · every sprite, coastline and sound is generated in code."),
  );
  document.body.prepend(sea, canvas, bar);
  document.body.append(footer);
  const weather = new Weather(canvas);
  let current: BiomeId = initial;
  const shell: Shell = {
    get biome() {
      return current;
    },
    theme(biome, overrides) {
      const t = siteTheme(biome, overrides);
      current = biome;
      applyTheme(t);
      weather.set(t.weather, t.specks);
      return t;
    },
  };
  shell.theme(initial);
  return shell;
}

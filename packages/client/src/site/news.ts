// The news page: a list of releases, and (at /news/<slug>) one release's notes. Every release names a
// biome and the page puts it on: colours fade, weather changes, a skyline of the biome's own plants
// and rocks stands at the top. Hover a release in the list to try its theme on the whole page.
import { BIOME_DEFS, newsPath, newsSlugFromPath, type BiomeId } from "@explorer/shared";
import "../landing/landing.css";
import { h } from "../ui/dom";
import {
  HORIZON,
  monthOf,
  NOTE_LABELS,
  prettyDate,
  RELEASES,
  releaseBySlug,
  type Release,
} from "./content/releases";
import { IMAGES } from "./images";
import { mountShell } from "./shell";
import "./site.css";
import { plot, skyline } from "./sprites";
import { siteTheme } from "./theme";

const DEFAULT_THEME: BiomeId = "temperate";
const shell = mountShell("news", DEFAULT_THEME);
document.body.classList.add("themed");
const page = document.getElementById("page")!;

/** Sets a card's own colours, so each one shows its release's theme before you open it. */
function tint(
  el: HTMLElement,
  release: { theme: BiomeId; themeOverrides?: Release["themeOverrides"] },
) {
  const t = siteTheme(release.theme, release.themeOverrides);
  el.style.setProperty("--card-accent", t.vars["--t-accent"]);
  el.style.setProperty("--card-fog", t.vars["--t-fog"]);
  el.style.setProperty("--card-ground", t.vars["--t-ground"]);
}

const chip = (biome: BiomeId) =>
  h("span.theme-chip", {}, h("i", { "aria-hidden": "true" }), BIOME_DEFS[biome].name);

const crest = (biome: BiomeId) => {
  const def = BIOME_DEFS[biome];
  return plot(`n_${def.trees[0]}_0`, 1, biome, 2);
};

// ------------------------------------------------------------------------------------ the list
function card(release: Release): HTMLElement {
  const el = h(
    "a.release-card.panel",
    { href: newsPath(release.slug), dataset: { nav: "" } },
    h("div.crest", {}, crest(release.theme)),
    h(
      "div.card-body",
      {},
      h(
        "p.card-meta",
        {},
        h("span.version", {}, `v${release.version}`),
        h("time", { datetime: release.date }, prettyDate(release.date)),
      ),
      h("h3", {}, release.title),
      h("p", {}, release.summary),
      h("p.card-foot", {}, chip(release.theme), h("span.read", {}, "Read the notes →")),
    ),
  );
  tint(el, release);
  // Try the theme on the whole page while the card is pointed at or focused, once it has rested.
  let timer = 0;
  const preview = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => shell.theme(release.theme, release.themeOverrides), 140);
  };
  const restore = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => shell.theme(DEFAULT_THEME), 260);
  };
  el.addEventListener("pointerenter", preview);
  el.addEventListener("focus", preview);
  el.addEventListener("pointerleave", restore);
  el.addEventListener("blur", restore);
  return el;
}

function showList(): void {
  shell.theme(DEFAULT_THEME);
  document.title = "News and release notes · Explorer";
  const months = new Map<string, Release[]>();
  for (const r of RELEASES)
    months.set(monthOf(r.date), [...(months.get(monthOf(r.date)) ?? []), r]);
  const horizon = siteTheme(HORIZON.theme);
  const soon = h(
    "section.horizon.panel",
    {},
    h("div.crest", {}, crest(HORIZON.theme)),
    h(
      "div",
      {},
      h("h2", {}, HORIZON.title),
      h("ul", {}, ...HORIZON.items.map((i) => h("li", {}, i))),
    ),
  );
  soon.style.setProperty("--card-accent", horizon.vars["--t-accent"]);
  soon.style.setProperty("--card-fog", horizon.vars["--t-fog"]);
  soon.addEventListener("pointerenter", () => shell.theme(HORIZON.theme));
  soon.addEventListener("pointerleave", () => shell.theme(DEFAULT_THEME));
  page.replaceChildren(
    h(
      "header.page-hero",
      {},
      skyline("temperate"),
      h("p.eyebrow", {}, "News"),
      h("h1.title", {}, "Release notes"),
      h(
        "p.lede",
        {},
        "What changed, release by release. Every release has a biome of its own: point at one and the whole page turns into it.",
      ),
    ),
    ...[...months].map(([month, list]) =>
      h("section.month", {}, h("h2", {}, month), h("div.release-list", {}, ...list.map(card))),
    ),
    soon,
  );
}

// ---------------------------------------------------------------------------------- an article
function showRelease(release: Release): void {
  shell.theme(release.theme, release.themeOverrides);
  document.title = `${release.title} · Release notes · Explorer`;
  const i = RELEASES.indexOf(release);
  const newer = RELEASES[i - 1];
  const older = RELEASES[i + 1];
  const neighbour = (r: Release | undefined, label: string) => {
    if (!r) return h("span.neighbour.none");
    const el = h(
      "a.neighbour.panel",
      { href: newsPath(r.slug), dataset: { nav: "" } },
      h("small", {}, label),
      h("strong", {}, r.title),
      chip(r.theme),
    );
    tint(el, r);
    return el;
  };
  const image = release.image ? IMAGES[release.image] : null;
  page.replaceChildren(
    h(
      "article.release",
      {},
      h(
        "header.page-hero",
        {},
        skyline(release.theme),
        h(
          "p.eyebrow",
          {},
          `Release ${release.version} · `,
          h("time", { datetime: release.date }, prettyDate(release.date)),
        ),
        h("h1.title", {}, release.title),
        h("p.lede", {}, release.summary),
        h("p.theme-note", {}, "Dressed in ", chip(release.theme)),
      ),
      image
        ? h(
            "figure.shot.panel",
            {},
            h("img", { src: image.src, width: image.width, height: image.height, alt: image.alt }),
          )
        : null,
      ...(release.intro ?? []).map((p) => h("p.intro", {}, p)),
      ...release.sections.map((s) =>
        h(
          "section.notes.panel",
          { dataset: { kind: s.kind } },
          h("h2", {}, h("span.kind-badge", {}, NOTE_LABELS[s.kind]), s.title ?? ""),
          h("ul", {}, ...s.items.map((item) => h("li", {}, item))),
        ),
      ),
      h(
        "nav.release-nav",
        { "aria-label": "Other releases" },
        neighbour(older, "← Older"),
        h("a.btn", { href: newsPath(), dataset: { nav: "" } }, "All releases"),
        neighbour(newer, "Newer →"),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------- routing
function render(): void {
  const slug = newsSlugFromPath(location.pathname);
  const release = slug ? releaseBySlug(slug) : undefined;
  if (slug && !release) {
    page.replaceChildren(
      h(
        "header.page-hero",
        {},
        h("h1.title", {}, "No such release"),
        h("p.lede", {}, "Those notes have drifted out of sight."),
        h("a.btn.primary", { href: newsPath(), dataset: { nav: "" } }, "All releases"),
      ),
    );
    shell.theme("swamp");
    return;
  }
  if (release) showRelease(release);
  else showList();
}

// Moving between the list and a release keeps the page, so the theme has something to fade from.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-nav]");
  if (!link) return;
  e.preventDefault();
  history.pushState(null, "", link.getAttribute("href")!);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
window.addEventListener("popstate", render);
render();

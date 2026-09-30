import { BIOMES } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { LORE } from "./content/lore";
import { HORIZON, RELEASES, releaseBySlug } from "./content/releases";
import { THEME_VARS, siteTheme } from "./theme";

describe("release notes", () => {
  it("have unique slugs that work in a URL", () => {
    const slugs = RELEASES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    expect(releaseBySlug(slugs[0]!)).toBe(RELEASES[0]);
  });

  it("are listed newest first, each with a real biome and notes", () => {
    for (let i = 1; i < RELEASES.length; i++)
      expect(RELEASES[i - 1]!.date >= RELEASES[i]!.date).toBe(true);
    for (const r of RELEASES) {
      expect(BIOMES).toContain(r.theme);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.sections.length).toBeGreaterThan(0);
      for (const s of r.sections) expect(s.items.length).toBeGreaterThan(0);
      for (const v of Object.keys(r.themeOverrides ?? {})) expect(THEME_VARS).toContain(v);
    }
    expect(BIOMES).toContain(HORIZON.theme);
  });
});

describe("site themes", () => {
  it("dress the page in every biome, and let a release override a colour", () => {
    for (const b of BIOMES) {
      const t = siteTheme(b);
      for (const v of THEME_VARS) expect(t.vars[v], `${b} ${v}`).toMatch(/^#|^rgb|^color-mix/);
      expect(t.specks).toBeGreaterThan(0);
    }
    expect(siteTheme("desert", { "--t-accent": "#123456" }).vars["--t-accent"]).toBe("#123456");
  });
});

describe("the lore", () => {
  it("has unique chapters, each dressed in a real biome, and one per tribe", () => {
    expect(new Set(LORE.map((c) => c.id)).size).toBe(LORE.length);
    for (const c of LORE) expect(BIOMES).toContain(c.theme);
    expect(LORE.filter((c) => c.tribe)).toHaveLength(9);
  });
});

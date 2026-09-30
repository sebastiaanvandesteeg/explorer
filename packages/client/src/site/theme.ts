// Page themes: every biome of the game can dress a page. A theme is a set of CSS variables (taken
// from the biome's atmosphere: its fog, its glow, its ground and rock), weather that drifts over the
// page (snow in Frostreach, embers in the Infernal Isles, petals in the Petal Isles…) and a little
// skyline of the biome's own plants and rocks. Release notes and lore chapters each name one.
import { BIOME_DEFS, type BiomeId } from "@explorer/shared";
import { ATMOSPHERE } from "../render/biomeStyle";
import { css, mix, type Rgb } from "./color";

const INK: Rgb = [27, 26, 31];
const PARCHMENT: Rgb = [251, 240, 207];
const WHITE: Rgb = [255, 255, 255];

/** The variables a theme sets. Any of them can be overridden per page (see `Release.theme`). */
export const THEME_VARS = [
  "--t-fog",
  "--t-wash",
  "--t-glow",
  "--t-accent",
  "--t-accent-deep",
  "--t-ground",
  "--t-rock",
  "--t-panel",
  "--t-edge",
  "--t-title",
] as const;
export type ThemeVar = (typeof THEME_VARS)[number];

/** How weather moves: pixels per second and how the specks look. */
export interface WeatherSpec {
  colors: string[];
  /** Size of a speck in page pixels (a range). */
  size: [number, number];
  /** Mean drift in px/s: positive vy falls, negative rises. */
  vx: number;
  vy: number;
  /** Side-to-side sway in px, and whether specks blink like fireflies or twinkle. */
  sway: number;
  blink: boolean;
  /** Specks in view for a rate of 1 (the game's own `rate`). */
  perRate: number;
}

const WEATHER: Record<string, WeatherSpec> = {
  dust: {
    colors: ["#e8c07a", "#d9a860", "#f2d496"],
    size: [2, 4],
    vx: 55,
    vy: 6,
    sway: 6,
    blink: false,
    perRate: 3.2,
  },
  ember: {
    colors: ["#ff7a1a", "#ffb238", "#c9431a", "#ffe28a"],
    size: [2, 4],
    vx: 8,
    vy: -42,
    sway: 10,
    blink: true,
    perRate: 2.6,
  },
  snow: {
    colors: ["#ffffff", "#dce8f0", "#c4d4e0"],
    size: [2, 5],
    vx: -12,
    vy: 34,
    sway: 14,
    blink: false,
    perRate: 2.6,
  },
  firefly: {
    colors: ["#e8f06a", "#b8e05a", "#fff08a"],
    size: [3, 4],
    vx: 4,
    vy: -4,
    sway: 26,
    blink: true,
    perRate: 6,
  },
  spore: {
    colors: ["#c48cf0", "#56d4cc", "#e6fff8", "#a48cf0"],
    size: [2, 4],
    vx: 5,
    vy: -16,
    sway: 18,
    blink: true,
    perRate: 3.4,
  },
  mote: {
    colors: ["#cebcff", "#f4eeff", "#7c64d8", "#a4f4e4"],
    size: [2, 4],
    vx: 3,
    vy: -10,
    sway: 16,
    blink: true,
    perRate: 4,
  },
  leaf: {
    colors: ["#c85018", "#e8781e", "#9a3410", "#f8a430"],
    size: [3, 5],
    vx: -18,
    vy: 24,
    sway: 30,
    blink: false,
    perRate: 3.4,
  },
  petal: {
    colors: ["#f4a4c4", "#e27ca8", "#ffd0e0", "#fff0f6"],
    size: [3, 5],
    vx: 16,
    vy: 20,
    sway: 28,
    blink: false,
    perRate: 3.4,
  },
  // The Greenlands have no weather in the game; on the page it is pollen on a warm breeze.
  pollen: {
    colors: ["#e8f06a", "#b2ad4e", "#fff3a8", "#8a8f38"],
    size: [2, 3],
    vx: 22,
    vy: -6,
    sway: 20,
    blink: false,
    perRate: 4,
  },
};

export interface SiteTheme {
  biome: BiomeId;
  name: string;
  vars: Record<ThemeVar, string>;
  weather: WeatherSpec;
  /** Specks on screen at a time. */
  specks: number;
}

/** The theme of a biome; `overrides` replaces any variable (a release can tweak its own look). */
export function siteTheme(
  biome: BiomeId,
  overrides: Partial<Record<ThemeVar, string>> = {},
): SiteTheme {
  const a = ATMOSPHERE[biome];
  const fog = a.fog;
  const glow: Rgb = a.glow;
  const vars: Record<ThemeVar, string> = {
    "--t-fog": fog,
    "--t-wash": css(mix(fog, a.map.ground, 0.3)),
    "--t-glow": css(glow),
    "--t-accent": css(mix(glow, WHITE, 0.3)),
    "--t-accent-deep": css(mix(glow, INK, 0.45)),
    "--t-ground": a.map.ground,
    "--t-rock": a.map.rock,
    "--t-panel": css(mix(fog, INK, 0.6), 0.93),
    "--t-edge": css(mix(mix(glow, a.map.rock, 0.4), INK, 0.3)),
    "--t-title": css(mix(PARCHMENT, glow, 0.16)),
    ...overrides,
  };
  const kind = a.particles?.kind ?? "pollen";
  const weather = WEATHER[kind] ?? WEATHER.pollen!;
  const rate = a.particles?.rate ?? 4;
  return {
    biome,
    name: BIOME_DEFS[biome].name,
    vars,
    weather,
    specks: Math.round(Math.min(120, Math.max(14, rate * weather.perRate))),
  };
}

/** Put a theme on the page. The variables are registered colours, so they fade between themes. */
export function applyTheme(theme: SiteTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme.biome;
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
}

// Curated colour ramps (dark → light) picked from docs/concept-art.webp.
// palette.extracted.json holds the raw samples; re-run `pnpm sprites:palette` to refresh them.

export const RAMPS = {
  deepWater: ["#153c46", "#19434c", "#1b505d", "#1b5866", "#1e606d", "#226975", "#24717b"],
  water: ["#1e606d", "#24717b", "#297881", "#2d7e87", "#2e908f", "#349f98"],
  shallow: ["#2e908f", "#349f98", "#43a197", "#49aea2", "#6cb9a8", "#a0c4b6"],
  foam: ["#6cb9a8", "#a0c4b6", "#cfe3d6", "#e5eddd", "#f6f8ee"],
  sand: ["#9c7f55", "#c5a26a", "#d9b77c", "#eed099", "#f6e3b4", "#fbf0cf"],
  grass: ["#2e4424", "#3c522c", "#556128", "#717b31", "#8a8f38", "#a29e43", "#bcb35a"],
  leaf: ["#1b241c", "#243e2a", "#3c522c", "#556128", "#717b31", "#8a8f38", "#b2ad4e"],
  pine: ["#141f18", "#1b2d22", "#243e2a", "#2f4f30", "#3f6536", "#577a3d"],
  rock: ["#26282c", "#32363a", "#454748", "#5b5e62", "#767878", "#9a9890", "#bdb8a8"],
  moss: ["#3c522c", "#556128", "#717b31", "#8a8f38"],
  timber: ["#2a1d14", "#3e2f1d", "#5b4028", "#805832", "#ab7640", "#d4a459"],
  plank: ["#3e2f1d", "#5b4028", "#7a5433", "#9b6b3e", "#bb8a52", "#d8ac6b"],
  thatch: ["#4a2f1c", "#7c4c30", "#966131", "#b97436", "#d4a459", "#e8c273"],
  slate: ["#262a31", "#3b4048", "#4f535a", "#646771", "#7d828c", "#9ea3aa"],
  plaster: ["#8d816e", "#b3a893", "#d6cbb4", "#ebe2cc", "#f7f1e1"],
  stone: ["#4f4d4a", "#6c6964", "#8f8b83", "#b0aca2", "#cfcbc1", "#e6e2d8"],
  wheat: ["#6b4a1c", "#a36524", "#d4a459", "#e2a841", "#f2cf6b", "#fae49a"],
  sprout: ["#3c522c", "#556128", "#6f8a33", "#8fae45", "#b3c95e"],
  soil: ["#2e2016", "#4a3322", "#6a4a30", "#86603d", "#a07650"],
  sail: ["#8f7a5a", "#b59a70", "#d8bc8d", "#f0d2a4", "#fbead0"],
  hull: ["#1c2230", "#26304a", "#34405e"],
  cloth: ["#5a2a1c", "#8a3d22", "#c25a2a", "#e98a3a", "#f8b25a"],
  fire: ["#7a2a12", "#c9431a", "#ff7a1a", "#ffb238", "#ffe28a"],
  glass: ["#1b1d24", "#2b2f3a", "#e0a040", "#ffd27a"],
  berry: ["#3a0f22", "#6c1a3a", "#a8264e", "#d9486a"],
  fruit: ["#7a2a12", "#c25a2a", "#e98a3a", "#f8c05a"],
  sunflower: ["#5b3a1f", "#a86a14", "#e2a820", "#f6d23a", "#fff08a"],
  skin: ["#6b3f2a", "#a86a4a", "#d69a72", "#f0c49a"],
  tunic: ["#2a3446", "#3e4d6a", "#5a6f94"],
  apron: ["#5b4028", "#805832", "#ab7640"],
  hair: ["#2a1d14", "#4a3322", "#6b4a2a"],
  smoke: ["#6e6e6e", "#9a9a9a", "#c4c4c4", "#e6e6e6"],
  fog: ["#0b1d24", "#0f2730", "#13303a", "#183a45"],
  outline: ["#1b1a1f", "#2a1f1a"],
  ui: ["#1b1a1f", "#3e2f1d", "#805832", "#eed099", "#fbf0cf"],
} as const;

export type RampName = keyof typeof RAMPS;
export type Rgba = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): Rgba {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, alpha];
}

const RAMP_CACHE = new Map<RampName, Rgba[]>();

export function ramp(name: RampName): Rgba[] {
  let cached = RAMP_CACHE.get(name);
  if (!cached) {
    cached = RAMPS[name].map((h) => hexToRgba(h));
    RAMP_CACHE.set(name, cached);
  }
  return cached;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Ordered-dither threshold in [0,1) for a pixel. */
export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)]!;
}

/**
 * Pick a ramp colour for brightness `v` (0..1). Dithering is restricted to the middle of each
 * step so flat faces stay flat and only real gradients get the classic checker transition.
 */
export function shade(name: RampName, v: number, x: number, y: number, ditherWidth = 0.35): Rgba {
  const colors = ramp(name);
  const f = Math.min(Math.max(v, 0), 1) * (colors.length - 1);
  const t = 0.5 + (bayer(x, y) - 0.5) * ditherWidth;
  const idx = Math.min(colors.length - 1, Math.max(0, Math.floor(f + t)));
  return colors[idx]!;
}

export function rampColor(name: RampName, index: number): Rgba {
  const colors = ramp(name);
  return colors[Math.min(colors.length - 1, Math.max(0, index))]!;
}

export function darken([r, g, b, a]: Rgba, k: number): Rgba {
  // Shift towards a warm near-black rather than pure black, like the concept art outlines.
  const base = [27, 26, 31];
  return [
    Math.round(base[0]! + (r - base[0]!) * k),
    Math.round(base[1]! + (g - base[1]!) * k),
    Math.round(base[2]! + (b - base[2]!) * k),
    a,
  ];
}

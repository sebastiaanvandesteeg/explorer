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

  // --- Biomes -------------------------------------------------------------------------------
  dune: ["#a8743a", "#c58e4a", "#d9a860", "#e8c07a", "#f2d496", "#f8e4b4"],
  sandstone: ["#6e3f22", "#8f5530", "#b0703e", "#c98c52", "#dea86a", "#efc488"],
  ash: ["#1a1214", "#261a1c", "#352224", "#46302c", "#5a3e36", "#6e4e42"],
  basalt: ["#0e0a0c", "#1a1416", "#2a2024", "#3a2c30", "#4c3a3c", "#5e4a4a"],
  lava: ["#5a0e0a", "#9a1c0c", "#d8380e", "#ff6a1a", "#ffa23a", "#ffd878"],
  obsidian: ["#08060c", "#141020", "#221a34", "#34284a", "#4a3a64", "#6a5a88"],
  charred: ["#0c0a0a", "#1a1414", "#2a2020", "#3a2c28", "#4c3a32"],
  snow: ["#8aa0b4", "#a8bccc", "#c4d4e0", "#dce8f0", "#eef4f8", "#ffffff"],
  ice: ["#3a5a78", "#4e7898", "#6a98b8", "#8cb8d4", "#b0d4e8", "#dcf0fa"],
  jungle: ["#10240f", "#173a16", "#1f5220", "#2c6a28", "#3e8434", "#58a044", "#7cbc58"],
  swampGround: ["#22261a", "#2e3420", "#3c4428", "#4a5430", "#5a6438", "#6e7444"],
  willow: ["#1a2616", "#26361e", "#344828", "#445a30", "#56703a", "#6a8646"],
  fungalGround: ["#2a1a34", "#3a2446", "#4c305a", "#5e3c6c", "#724a80", "#8a5c96"],
  capRed: ["#4a1420", "#7a1e30", "#a82e40", "#cc4a52", "#e8786a", "#f8b094"],
  stalk: ["#6a5a54", "#8a7c70", "#aa9c8c", "#c8bca8", "#e2d8c4", "#f4eee0"],
  glow: ["#123a48", "#1a6a78", "#2aa0a8", "#56d4cc", "#a4f4e4", "#e6fff8"],
  crystalGround: ["#3c3650", "#4e4866", "#625c7c", "#787494", "#908cac", "#aaa8c4"],
  crystal: ["#2a1e5a", "#3e2c86", "#5a44b4", "#7c64d8", "#a48cf0", "#cebcff", "#f4eeff"],
  silver: ["#3a4a5a", "#566a7a", "#7890a0", "#9cb4c4", "#c4d8e4", "#eef6fa"],
  autumnGround: ["#3a2a14", "#5a3e18", "#7a5620", "#9a6c28", "#b88834", "#d0a444"],
  autumnLeaf: ["#3a140a", "#6a200c", "#9a3410", "#c85018", "#e8781e", "#f8a430", "#ffd060"],
  blossomGround: ["#3c5a2c", "#4e7234", "#62883c", "#78a046", "#90b852", "#aacc64"],
  petal: ["#6a2848", "#9a3a64", "#c8588a", "#e27ca8", "#f4a4c4", "#ffd0e0", "#fff0f6"],
  cactus: ["#1e3a1e", "#2a5028", "#3a6a32", "#4e843c", "#68a04a", "#88bc5c"],
  pumpkin: ["#5a1e08", "#8a3408", "#c05610", "#e27a1c", "#f8a030", "#ffc860"],
  gold: ["#5a3a08", "#8a5e10", "#c08a1c", "#e8b430", "#fcd860", "#fff0a8"],
  banana: ["#5a4a0c", "#8a7414", "#c0a41c", "#e8cc34", "#fce868"],

  // --- Tribe architecture --------------------------------------------------------------------
  logs: ["#1e140e", "#2e2016", "#44301e", "#5a4026", "#72522e", "#8c6638"],
  darkwood: ["#1a120e", "#2a1c14", "#3c2a1c", "#503824", "#664a2e", "#7c5c38"],
  turf: ["#2a3a1c", "#3a4e22", "#4c6428", "#5e7a30", "#76923a"],
  adobe: ["#8a5a36", "#a8744a", "#c4905e", "#d8aa74", "#e8c48e", "#f4dcac"],
  dome: ["#12304a", "#1a4a6e", "#2a6a94", "#3c8cb8", "#5aacd4", "#8ccce8"],
  bark: ["#1e1a10", "#2e2818", "#443a22", "#5a4e2c", "#726438", "#8c7c46"],
  clothRed: ["#3a0e0e", "#6a1a18", "#9a2a22", "#c43a2e", "#e25a44", "#f48a6a"],
  clothBlue: ["#0e1a3a", "#16306a", "#22489a", "#3464c4", "#5286e0", "#80acf0"],
  clothGreen: ["#0e2a16", "#16482a", "#22683a", "#34884a", "#52a85e", "#80c880"],
  arcane: ["#1a0e3a", "#2e1a6a", "#4a2aa0", "#6a44d0", "#9470f0", "#c4a8ff", "#f0e6ff"],
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

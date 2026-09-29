// How each biome looks and feels on screen: minimap colours, the colour of its fog and
// shallow-water glow, and the atmosphere applied while the camera is over it.
import type { BiomeId } from "@explorer/shared";

export type ParticleMotion = "rise" | "fall" | "sway" | "float" | "drift";

export interface Atmosphere {
  /** Fog over this region's unexplored tiles. */
  fog: string;
  /** Turquoise-ish glow in the shallows around the islands. */
  glow: [number, number, number];
  /** Colour grade: per-channel multiply, saturation, brightness and contrast. */
  tint: [number, number, number];
  saturation: number;
  brightness: number;
  contrast: number;
  vignette: { color: [number, number, number]; strength: number };
  /** Dark cracked-texture overlay ("hell feels grim"). */
  grain: number;
  particles: { kind: string; rate: number; motion: ParticleMotion } | null;
  map: { ground: string; beach: string; rock: string };
}

const NEUTRAL: Omit<Atmosphere, "fog" | "glow" | "map" | "particles"> = {
  tint: [1, 1, 1],
  saturation: 1,
  brightness: 1,
  contrast: 1,
  vignette: { color: [8, 24, 30], strength: 0.22 },
  grain: 0,
};

export const OCEAN: Atmosphere = {
  ...NEUTRAL,
  fog: "#0d222a",
  glow: [67, 161, 151],
  particles: null,
  map: { ground: "#556128", beach: "#eed099", rock: "#8a8a86" },
};

export const ATMOSPHERE: Record<BiomeId, Atmosphere> = {
  temperate: { ...OCEAN },
  desert: {
    ...NEUTRAL,
    fog: "#33250f",
    glow: [80, 190, 176],
    tint: [1.08, 1.0, 0.86],
    saturation: 1.05,
    brightness: 1.03,
    contrast: 1.02,
    vignette: { color: [60, 36, 10], strength: 0.32 },
    grain: 0,
    particles: { kind: "dust", rate: 10, motion: "drift" },
    map: { ground: "#e8c07a", beach: "#f2d496", rock: "#b0703e" },
  },
  infernal: {
    ...NEUTRAL,
    fog: "#3a0606",
    glow: [210, 60, 18],
    tint: [1.22, 0.74, 0.6],
    saturation: 0.92,
    brightness: 0.8,
    contrast: 1.2,
    vignette: { color: [46, 0, 0], strength: 0.85 },
    grain: 0.32,
    particles: { kind: "ember", rate: 22, motion: "rise" },
    map: { ground: "#46302c", beach: "#2a2024", rock: "#3a2c30" },
  },
  tundra: {
    ...NEUTRAL,
    fog: "#27323e",
    glow: [150, 212, 232],
    tint: [0.9, 0.98, 1.1],
    saturation: 0.78,
    brightness: 1.05,
    contrast: 1.0,
    vignette: { color: [20, 40, 60], strength: 0.3 },
    grain: 0,
    particles: { kind: "snow", rate: 26, motion: "fall" },
    map: { ground: "#dce8f0", beach: "#a8bccc", rock: "#8cb8d4" },
  },
  jungle: {
    ...NEUTRAL,
    fog: "#0c2614",
    glow: [60, 170, 120],
    tint: [0.94, 1.08, 0.94],
    saturation: 1.12,
    brightness: 0.97,
    contrast: 1.05,
    vignette: { color: [4, 30, 12], strength: 0.42 },
    grain: 0.05,
    particles: { kind: "firefly", rate: 5, motion: "float" },
    map: { ground: "#2c6a28", beach: "#eed099", rock: "#767878" },
  },
  swamp: {
    ...NEUTRAL,
    fog: "#1c2414",
    glow: [84, 112, 62],
    tint: [0.92, 1.0, 0.84],
    saturation: 0.78,
    brightness: 0.9,
    contrast: 1.06,
    vignette: { color: [16, 22, 8], strength: 0.52 },
    grain: 0.15,
    particles: { kind: "firefly", rate: 8, motion: "float" },
    map: { ground: "#4a5430", beach: "#6a4a30", rock: "#5b5e62" },
  },
  fungal: {
    ...NEUTRAL,
    fog: "#1e0c2c",
    glow: [140, 80, 200],
    tint: [0.98, 0.88, 1.12],
    saturation: 1.05,
    brightness: 0.94,
    contrast: 1.06,
    vignette: { color: [22, 6, 34], strength: 0.52 },
    grain: 0.08,
    particles: { kind: "spore", rate: 14, motion: "float" },
    map: { ground: "#5e3c6c", beach: "#787494", rock: "#625c7c" },
  },
  crystal: {
    ...NEUTRAL,
    fog: "#161240",
    glow: [140, 110, 245],
    tint: [0.95, 0.95, 1.12],
    saturation: 1.1,
    brightness: 1.05,
    contrast: 1.05,
    vignette: { color: [14, 10, 44], strength: 0.36 },
    grain: 0,
    particles: { kind: "mote", rate: 12, motion: "float" },
    map: { ground: "#908cac", beach: "#f2e6d0", rock: "#787494" },
  },
  autumn: {
    ...NEUTRAL,
    fog: "#2a180a",
    glow: [92, 170, 150],
    tint: [1.08, 0.98, 0.86],
    saturation: 1.08,
    brightness: 1.0,
    contrast: 1.03,
    vignette: { color: [42, 20, 6], strength: 0.3 },
    grain: 0,
    particles: { kind: "leaf", rate: 9, motion: "sway" },
    map: { ground: "#9a6c28", beach: "#eed099", rock: "#8a8a86" },
  },
  blossom: {
    ...NEUTRAL,
    fog: "#2a1222",
    glow: [120, 204, 190],
    tint: [1.05, 0.98, 1.03],
    saturation: 1.06,
    brightness: 1.05,
    contrast: 1.0,
    vignette: { color: [42, 14, 26], strength: 0.2 },
    grain: 0,
    particles: { kind: "petal", rate: 12, motion: "sway" },
    map: { ground: "#78a046", beach: "#f2dcc0", rock: "#8a8a86" },
  },
};

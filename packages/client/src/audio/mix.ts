// The decisions behind the sound, kept free of the audio API so they can be tested: what plays for
// each event, how loud and where, what the ambience should be doing, and when.
import {
  stormStrength,
  type BiomeId,
  type GameEvent,
  type StormEntity,
  type Tool,
} from "@explorer/shared";
import type { SoundName } from "./sounds";

// ---------------------------------------------------------------------------- spatial

/**
 * How a sound at a point on the screen should be heard: full volume anywhere in view, fading with
 * distance outside it, and panned by how far left or right it is.
 */
export function spatialMix(
  sx: number,
  sy: number,
  width: number,
  height: number,
): { gain: number; pan: number } {
  const dx = Math.max(0, Math.abs(sx - width / 2) - width / 2);
  const dy = Math.max(0, Math.abs(sy - height / 2) - height / 2);
  const outside = Math.hypot(dx, dy);
  const gain = outside === 0 ? 1 : Math.max(0.1, 1 - outside / 900);
  const pan = Math.max(-0.85, Math.min(0.85, (sx - width / 2) / (width / 2)));
  return { gain, pan };
}

// ---------------------------------------------------------------------------- events

export interface Cue {
  sound: SoundName;
  /** Where it happens in the world (tiles); global sounds have none. */
  at?: { x: number; y: number };
  gain?: number;
  delay?: number;
}

/** What to play for something that happened in the world. */
export function soundsFor(ev: GameEvent): Cue[] {
  switch (ev.type) {
    case "built":
      return [
        { sound: "hammer", at: ev },
        { sound: "chime", at: ev, gain: 0.5, delay: 0.3 },
      ];
    case "villager":
      return [{ sound: "pop", at: ev }];
    case "ship":
      return [{ sound: "horn", at: ev, gain: 0.7 }];
    case "discovered":
      return [{ sound: "discover" }];
    case "landed":
      return [
        { sound: "splash", at: ev, gain: 0.7 },
        { sound: "pop", at: ev, delay: 0.25 },
      ];
    case "cargo":
      return [
        { sound: "coin", at: ev },
        { sound: "coin", at: ev, gain: 0.6, delay: 0.16 },
      ];
    case "upgrade":
      return [{ sound: "upgrade" }];
    case "robbed":
      return [{ sound: "alarm" }];
    case "sunk":
      return [{ sound: "sink", at: ev }];
    case "found":
      return [{ sound: "ping", at: ev }];
    case "salvaged":
      return [{ sound: "coin", at: ev }];
    case "shot":
      return ev.kind === "bolt"
        ? [{ sound: "thunder", at: ev.to, delay: 0.12 }]
        : [
            { sound: "boom", at: ev.from },
            { sound: "splash", at: ev.to, gain: 0.5, delay: 0.3 },
          ];
    case "storm":
      return [{ sound: "rumble", at: ev, gain: 0.7 }];
    case "wonder":
      return [{ sound: ev.final ? "fanfare" : "upgrade", gain: ev.final ? 1 : 0.8 }];
    case "pirates":
      return [];
  }
}

/** The sound of a villager at work with a tool. */
export function workSound(tool: Tool | null): SoundName | null {
  switch (tool) {
    case "axe":
      return "chop";
    case "pick":
      return "pick";
    case "hammer":
      return "hammer";
    case "hoe":
      return "dig";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------- ambience

export interface Mood {
  /** 0 by day up to 1 at midnight. */
  night: number;
  /** 0 with no storm about, 1 inside one. */
  storm: number;
  /** The biome under the camera, or null over open sea. */
  biome: BiomeId | null;
}

export interface Layers {
  sea: number;
  wind: number;
  rain: number;
  crickets: number;
  rumble: number;
}

const WINDY: Partial<Record<BiomeId, number>> = {
  tundra: 0.3,
  desert: 0.26,
  crystal: 0.14,
  infernal: 0.08,
};
const INSECTY: readonly BiomeId[] = ["temperate", "jungle", "swamp", "autumn", "blossom", "fungal"];

/** How loud each continuous layer of the ambience should be right now. */
export function layerTargets(mood: Mood): Layers {
  const { night, storm, biome } = mood;
  return {
    sea: 0.5 + 0.3 * storm,
    wind: 0.1 + 0.6 * storm + (biome ? (WINDY[biome] ?? 0) : 0.06),
    rain: 0.85 * storm,
    crickets: night * (biome && INSECTY.includes(biome) ? 0.6 : 0.12) * (1 - storm),
    rumble: (biome === "infernal" ? 0.45 : biome === "fungal" ? 0.1 : 0) + 0.15 * storm,
  };
}

export interface Stinger {
  sound: SoundName;
  /** Seconds to wait after the previous stinger: a range. */
  every: [number, number];
  gain: number;
}

/** The occasional sounds of a place: birdsong by day, frogs and owls by night, and so on. */
export function stingersFor(mood: Mood): Stinger[] {
  const day = mood.night < 0.35;
  const quiet = mood.storm > 0.3;
  if (quiet || !mood.biome) return [];
  switch (mood.biome) {
    case "temperate":
    case "autumn":
      return day
        ? [{ sound: "chirp", every: [2.5, 7], gain: 0.7 }]
        : [{ sound: "hoot", every: [9, 20], gain: 0.7 }];
    case "jungle":
      return day
        ? [{ sound: "chirp", every: [1.2, 3.5], gain: 0.8 }]
        : [{ sound: "croak", every: [1.2, 3.5], gain: 0.8 }];
    case "swamp":
      return [{ sound: "croak", every: day ? [3, 8] : [0.9, 2.5], gain: 0.8 }];
    case "blossom":
      return day
        ? [
            { sound: "chirp", every: [3, 8], gain: 0.5 },
            { sound: "windchime", every: [4, 9], gain: 0.9 },
          ]
        : [{ sound: "windchime", every: [3, 7], gain: 0.9 }];
    case "fungal":
      return [{ sound: "bubble", every: [0.8, 3], gain: 0.9 }];
    case "crystal":
      return [{ sound: "sparkle", every: [1.5, 4.5], gain: 1 }];
    case "infernal":
      return [{ sound: "crackle", every: [0.7, 2.4], gain: 0.9 }];
    case "tundra":
      return night(mood) ? [{ sound: "hoot", every: [14, 30], gain: 0.5 }] : [];
    case "desert":
      return [];
  }
}

const night = (mood: Mood) => mood.night >= 0.35;

/** How much of a storm is around a point: 1 inside one, fading to nothing a little way outside. */
export function stormLevel(storms: Iterable<StormEntity>, x: number, y: number): number {
  let level = 0;
  for (const s of storms) {
    const d = Math.hypot(s.x - x, s.y - y);
    const reach = s.radius * 1.7;
    if (d >= reach) continue;
    const near = d <= s.radius ? 1 : (reach - d) / (reach - s.radius);
    level = Math.max(level, near * stormStrength(s));
  }
  return level;
}

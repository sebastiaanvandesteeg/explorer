// The game's sounds, each a few oscillators and bursts of noise. They are written to sit
// together: wood and stone sounds are dry and short, magic is bell-like, danger is low and brassy.
import type { Engine, Place } from "./engine";

export type SoundName =
  | "hammer"
  | "chop"
  | "pick"
  | "dig"
  | "coin"
  | "chime"
  | "discover"
  | "upgrade"
  | "pop"
  | "horn"
  | "alarm"
  | "boom"
  | "thunder"
  | "rumble"
  | "splash"
  | "sink"
  | "ping"
  | "fanfare"
  | "click"
  | "select"
  | "error"
  | "chirp"
  | "hoot"
  | "croak"
  | "sparkle"
  | "bubble"
  | "crackle"
  | "windchime"
  | "step_grass"
  | "step_sand"
  | "step_stone"
  | "step_wood"
  | "step_dirt"
  | "step_water"
  | "door_open"
  | "door_close"
  | "voice";

type Play = (e: Engine, p: Place) => void;

/** A note frequency from a MIDI-style number: 69 is A440. */
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Shift a place's start time, keeping its gain and pan. */
const later = (p: Place, seconds: number): Place => ({ ...p, delay: (p.delay ?? 0) + seconds });
const quieter = (p: Place, k: number): Place => ({ ...p, gain: (p.gain ?? 1) * k });

/** C major pentatonic across three octaves from C3: every pitched sound picks from it, so nothing clashes. */
const PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const scale = (i: number): number =>
  hz(PENTATONIC[Math.max(0, Math.min(PENTATONIC.length - 1, i))]!);
const pick1 = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/**
 * A soft tap: a rounded, pitched note with a quick fall and a gentle attack, like a wood block.
 * No noise: nothing hisses, so repeating it (footsteps) stays easy on the ear.
 */
const tap = (e: Engine, p: Place, freq: number, decay: number, level: number): void => {
  e.tone({
    ...p,
    type: "sine",
    freq,
    freqEnd: freq * 0.9,
    attack: 0.008,
    decay,
    level,
    filter: { type: "lowpass", freq: 2200 },
  });
  e.tone({
    ...p,
    type: "triangle",
    freq: freq * 2,
    attack: 0.008,
    decay: decay * 0.5,
    level: level * 0.3,
    filter: { type: "lowpass", freq: 2200 },
  });
};

/** A mallet knock: a soft, low pitched thud with a small woody overtone. */
const knock: Play = (e, p) => {
  tap(e, p, 196, 0.12, 0.34);
  e.noise({
    ...p,
    decay: 0.02,
    level: 0.08,
    filter: { type: "lowpass", freq: 1200 },
  });
};

export const SOUNDS: Record<SoundName, Play> = {
  /** Two mallet knocks: a building going up. */
  hammer: (e, p) => {
    knock(e, p);
    knock(e, later(quieter(p, 0.8), 0.14));
  },
  /** An axe biting wood: a round, woody thump. */
  chop: (e, p) => {
    tap(e, p, 130, 0.12, 0.4);
    e.noise({ ...p, decay: 0.02, level: 0.08, filter: { type: "lowpass", freq: 1000 } });
  },
  /** A pick on rock: a small bell note over a faint tick. */
  pick: (e, p) => {
    e.tone({
      ...p,
      type: "triangle",
      freq: scale(pick1([7, 8, 9])),
      attack: 0.006,
      decay: 0.22,
      level: 0.18,
      filter: { type: "lowpass", freq: 3000 },
    });
    e.noise({ ...p, decay: 0.015, level: 0.06, filter: { type: "lowpass", freq: 2200 } });
  },
  /** A hoe in soil: a soft, low thud. */
  dig: (e, p) => {
    tap(e, p, 82, 0.14, 0.42);
  },
  /** Coins: two bright pings. */
  coin: (e, p) => {
    e.tone({ ...p, type: "sine", freq: hz(91), decay: 0.28, level: 0.22 });
    e.tone({ ...later(p, 0.07), type: "sine", freq: hz(96), decay: 0.4, level: 0.22 });
  },
  /** A small rising chime. */
  chime: (e, p) => {
    for (const [i, n] of [72, 79].entries())
      e.tone({ ...later(p, i * 0.09), type: "sine", freq: hz(n), decay: 0.6, level: 0.2 });
  },
  /** A new island: a rising arpeggio, warm and a little wondering. */
  discover: (e, p) => {
    for (const [i, n] of [67, 71, 74, 79, 83].entries()) {
      e.tone({ ...later(p, i * 0.11), type: "triangle", freq: hz(n), decay: 0.9, level: 0.2 });
      e.tone({ ...later(p, i * 0.11), type: "sine", freq: hz(n + 12), decay: 0.7, level: 0.07 });
    }
  },
  /** A spell learned: shimmering bells over a low swell. */
  upgrade: (e, p) => {
    for (const [i, n] of [76, 80, 83, 88, 92].entries())
      e.tone({ ...later(p, i * 0.07), type: "sine", freq: hz(n), decay: 1.3, level: 0.16 });
    e.tone({
      ...p,
      type: "sawtooth",
      freq: hz(45),
      decay: 1.2,
      attack: 0.3,
      level: 0.06,
      filter: { type: "lowpass", freq: 500 },
    });
  },
  /** A new villager. */
  pop: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 380, freqEnd: 760, decay: 0.09, level: 0.3 });
  },
  /** A ship's horn: one long low blast. */
  horn: (e, p) => {
    e.tone({
      ...p,
      type: "sawtooth",
      freq: hz(46),
      attack: 0.08,
      decay: 0.7,
      level: 0.3,
      filter: { type: "lowpass", freq: 380 },
      vibrato: { rate: 5, depth: 2 },
    });
    e.tone({
      ...p,
      type: "square",
      freq: hz(53),
      attack: 0.1,
      decay: 0.6,
      level: 0.07,
      filter: { type: "lowpass", freq: 420 },
    });
  },
  /** Raiders! Two urgent brassy blasts. */
  alarm: (e, p) => {
    for (const [i, n] of [50, 46, 50, 46].entries())
      e.tone({
        ...later(p, i * 0.26),
        type: "sawtooth",
        freq: hz(n),
        attack: 0.02,
        decay: 0.22,
        level: 0.28,
        filter: { type: "lowpass", freq: 700 },
      });
  },
  /** A cannon: a deep thump with a short, dull rumble. */
  boom: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 120, freqEnd: 36, attack: 0.006, decay: 0.45, level: 0.7 });
    e.noise({
      ...p,
      attack: 0.01,
      decay: 0.3,
      level: 0.26,
      filter: { type: "lowpass", freq: 700, freqEnd: 120 },
    });
  },
  /** Thunder: a low roll that swells and fades. */
  thunder: (e, p) => {
    e.noise({
      ...later(p, 0.06),
      colour: "brown",
      attack: 0.3,
      decay: 2.6,
      level: 0.6,
      filter: { type: "lowpass", freq: 260, freqEnd: 60 },
    });
  },
  /** A storm far off: only the roll. */
  rumble: (e, p) => {
    e.noise({
      ...p,
      colour: "brown",
      attack: 0.9,
      decay: 3.2,
      level: 0.6,
      filter: { type: "lowpass", freq: 200, freqEnd: 50 },
    });
  },
  /** A splash: a soft, short wash, kept dull. */
  splash: (e, p) => {
    e.noise({
      ...p,
      attack: 0.02,
      decay: 0.26,
      level: 0.2,
      filter: { type: "lowpass", freq: 900, freqEnd: 400 },
    });
    e.tone({
      ...p,
      type: "sine",
      freq: 420,
      freqEnd: 640,
      attack: 0.01,
      decay: 0.12,
      level: 0.1,
    });
  },
  /** A ship going down: a low crash and a falling note, then bubbles rising. */
  sink: (e, p) => {
    e.noise({
      ...p,
      attack: 0.02,
      decay: 0.5,
      level: 0.3,
      filter: { type: "lowpass", freq: 600, freqEnd: 120 },
    });
    e.tone({ ...p, type: "sine", freq: 280, freqEnd: 50, attack: 0.01, decay: 1.1, level: 0.3 });
    for (let i = 0; i < 6; i++)
      e.tone({
        ...later(p, 0.3 + i * 0.13),
        type: "sine",
        freq: 300 + i * 90,
        freqEnd: 500 + i * 130,
        attack: 0.01,
        decay: 0.07,
        level: 0.1,
      });
  },
  /** Sonar: a single long ping with an echo. */
  ping: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 880, decay: 1.5, level: 0.24 });
    e.tone({ ...later(p, 0.32), type: "sine", freq: 880, decay: 1.2, level: 0.09 });
  },
  /** The Great Work finished: a slow, rising chord. */
  fanfare: (e, p) => {
    for (const [i, n] of [48, 55, 60, 64, 67, 72].entries()) {
      e.tone({
        ...later(p, i * 0.16),
        type: "triangle",
        freq: hz(n),
        attack: 0.5,
        decay: 3.2,
        level: 0.16,
      });
      e.tone({
        ...later(p, i * 0.16),
        type: "sine",
        freq: hz(n + 12),
        attack: 0.6,
        decay: 3,
        level: 0.07,
      });
    }
  },
  /** A button: a tiny soft tick. */
  click: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 1100, attack: 0.004, decay: 0.04, level: 0.14 });
  },
  /** Picking something. */
  select: (e, p) => {
    e.tone({ ...p, type: "triangle", freq: 660, freqEnd: 880, decay: 0.05, level: 0.18 });
  },
  /** A refusal: a low buzz. */
  error: (e, p) => {
    e.tone({
      ...p,
      type: "sawtooth",
      freq: 120,
      freqEnd: 90,
      decay: 0.16,
      level: 0.16,
      filter: { type: "lowpass", freq: 600 },
    });
  },
  // Ambience stingers ---------------------------------------------------------------------
  /** A bird: two or three quick rising notes. */
  chirp: (e, p) => {
    const base = 2200 + ((p.pan ?? 0) + 1) * 500;
    for (let i = 0; i < 3; i++)
      e.tone({
        ...later(p, i * 0.085),
        type: "sine",
        freq: base,
        freqEnd: base * 1.45,
        decay: 0.06,
        level: 0.1,
      });
  },
  /** An owl. */
  hoot: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 340, freqEnd: 300, attack: 0.05, decay: 0.32, level: 0.12 });
    e.tone({
      ...later(p, 0.42),
      type: "sine",
      freq: 330,
      freqEnd: 280,
      attack: 0.05,
      decay: 0.45,
      level: 0.1,
    });
  },
  /** A frog. */
  croak: (e, p) => {
    e.tone({
      ...p,
      type: "square",
      freq: 130,
      freqEnd: 95,
      decay: 0.14,
      level: 0.17,
      filter: { type: "lowpass", freq: 500 },
      vibrato: { rate: 38, depth: 25 },
    });
  },
  /** Crystals sparkling. */
  sparkle: (e, p) => {
    for (let i = 0; i < 3; i++)
      e.tone({
        ...later(p, i * 0.05),
        type: "sine",
        freq: 1800 + i * 640,
        decay: 0.5,
        level: 0.06,
      });
  },
  /** Something bubbling in the fungal dark. */
  bubble: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 180, freqEnd: 420, decay: 0.08, level: 0.24 });
  },
  /** Embers popping. */
  crackle: (e, p) => {
    for (let i = 0; i < 3; i++)
      e.noise({
        ...later(p, i * 0.035),
        decay: 0.02,
        level: 0.07,
        filter: { type: "bandpass", freq: 1500, q: 0.8 },
      });
  },
  /** Blossom wind chimes: one soft bell. */
  windchime: (e, p) => {
    const n = [84, 88, 91, 93][Math.floor(((p.pan ?? 0) + 1) * 1.99)]!;
    e.tone({ ...p, type: "sine", freq: hz(n), decay: 1.4, level: 0.12 });
  },
  /** A footfall on grass: a low, round tap. */
  step_grass: (e, p) => {
    tap(e, p, scale(pick1([0, 2])), 0.07, 0.16);
  },
  /** A footfall on sand: a light, soft tap. */
  step_sand: (e, p) => {
    tap(e, p, scale(pick1([3, 4])), 0.06, 0.12);
  },
  /** A footfall on stone: a clearer, higher tick-note. */
  step_stone: (e, p) => {
    tap(e, p, scale(pick1([5, 7])), 0.06, 0.16);
  },
  /** A footfall on boards: a hollow wooden note. */
  step_wood: (e, p) => {
    tap(e, p, scale(pick1([2, 4])), 0.09, 0.2);
  },
  /** A footfall on bare earth: the lowest, dullest tap. */
  step_dirt: (e, p) => {
    tap(e, p, scale(pick1([0, 1])), 0.08, 0.2);
  },
  /** A footfall in shallow water: a small rising bubble note. */
  step_water: (e, p) => {
    e.tone({
      ...p,
      type: "sine",
      freq: scale(5),
      freqEnd: scale(8),
      attack: 0.01,
      decay: 0.09,
      level: 0.14,
      filter: { type: "lowpass", freq: 2000 },
    });
  },
  /** A door opening: a soft two-note rise. */
  door_open: (e, p) => {
    tap(e, p, scale(8), 0.16, 0.2);
    tap(e, later(p, 0.1), scale(10), 0.2, 0.2);
  },
  /** A door closing: one low, soft note. */
  door_close: (e, p) => {
    tap(e, p, scale(1), 0.22, 0.3);
  },
  /** One syllable of someone talking: a soft note from the scale. */
  voice: (e, p) => {
    e.tone({
      ...p,
      type: "sine",
      freq: scale(pick1([5, 6, 8, 9, 10])),
      attack: 0.02,
      decay: 0.14,
      level: 0.07,
      filter: { type: "lowpass", freq: 1400 },
    });
  },
};

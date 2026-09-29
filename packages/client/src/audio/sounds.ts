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
  | "windchime";

type Play = (e: Engine, p: Place) => void;

/** A note frequency from a MIDI-style number: 69 is A440. */
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Shift a place's start time, keeping its gain and pan. */
const later = (p: Place, seconds: number): Place => ({ ...p, delay: (p.delay ?? 0) + seconds });
const quieter = (p: Place, k: number): Place => ({ ...p, gain: (p.gain ?? 1) * k });

const knock: Play = (e, p) => {
  e.noise({
    ...p,
    decay: 0.05,
    level: 0.5,
    filter: { type: "bandpass", freq: 1100, freqEnd: 500, q: 1.2 },
  });
  e.tone({ ...p, type: "triangle", freq: 190, freqEnd: 110, decay: 0.09, level: 0.4 });
};

export const SOUNDS: Record<SoundName, Play> = {
  /** Two mallet knocks: a building going up. */
  hammer: (e, p) => {
    knock(e, p);
    knock(e, later(quieter(p, 0.8), 0.14));
  },
  /** An axe biting wood. */
  chop: (e, p) => {
    e.noise({
      ...p,
      decay: 0.07,
      level: 0.55,
      filter: { type: "lowpass", freq: 1500, freqEnd: 300 },
    });
    e.tone({ ...p, type: "square", freq: 150, freqEnd: 70, decay: 0.07, level: 0.16 });
  },
  /** A pick on rock: a dry click with a metallic ring. */
  pick: (e, p) => {
    e.noise({ ...p, decay: 0.025, level: 0.4, filter: { type: "highpass", freq: 2400 } });
    e.tone({ ...p, type: "triangle", freq: 930, decay: 0.16, level: 0.2 });
    e.tone({ ...p, type: "sine", freq: 1390, decay: 0.1, level: 0.1 });
  },
  /** A hoe in soil: a soft thud. */
  dig: (e, p) => {
    e.noise({
      ...p,
      decay: 0.09,
      level: 0.8,
      filter: { type: "lowpass", freq: 600, freqEnd: 180 },
    });
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
  /** A cannon: a low thump and the crack of the blast. */
  boom: (e, p) => {
    e.tone({ ...p, type: "sine", freq: 130, freqEnd: 34, decay: 0.42, level: 0.75 });
    e.noise({
      ...p,
      decay: 0.4,
      level: 0.7,
      filter: { type: "lowpass", freq: 1400, freqEnd: 120 },
    });
    e.noise({ ...p, decay: 0.05, level: 0.35, filter: { type: "highpass", freq: 1800 } });
  },
  /** Thunder: a crack, then a long low roll. */
  thunder: (e, p) => {
    e.noise({ ...p, decay: 0.12, level: 0.5, filter: { type: "highpass", freq: 1200 } });
    e.noise({
      ...later(p, 0.06),
      colour: "brown",
      attack: 0.25,
      decay: 2.6,
      level: 0.9,
      filter: { type: "lowpass", freq: 320, freqEnd: 70 },
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
  /** A splash. */
  splash: (e, p) => {
    e.noise({
      ...p,
      attack: 0.01,
      decay: 0.28,
      level: 0.4,
      filter: { type: "bandpass", freq: 1500, freqEnd: 600, q: 0.8 },
    });
    e.noise({
      ...later(p, 0.05),
      decay: 0.2,
      level: 0.18,
      filter: { type: "highpass", freq: 3000 },
    });
  },
  /** A ship going down: the crash, then bubbles rising. */
  sink: (e, p) => {
    e.noise({
      ...p,
      decay: 0.5,
      level: 0.55,
      filter: { type: "lowpass", freq: 900, freqEnd: 150 },
    });
    e.tone({ ...p, type: "sine", freq: 280, freqEnd: 50, decay: 1.1, level: 0.3 });
    for (let i = 0; i < 6; i++)
      e.tone({
        ...later(p, 0.3 + i * 0.13),
        type: "sine",
        freq: 300 + i * 90,
        freqEnd: 500 + i * 130,
        decay: 0.07,
        level: 0.12,
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
  /** A button. */
  click: (e, p) => {
    e.tone({ ...p, type: "square", freq: 1300, decay: 0.03, level: 0.16 });
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
        level: 0.16,
        filter: { type: "highpass", freq: 2600 },
      });
  },
  /** Blossom wind chimes: one soft bell. */
  windchime: (e, p) => {
    const n = [84, 88, 91, 93][Math.floor(((p.pan ?? 0) + 1) * 1.99)]!;
    e.tone({ ...p, type: "sine", freq: hz(n), decay: 1.4, level: 0.12 });
  },
};

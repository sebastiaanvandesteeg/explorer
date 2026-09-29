// The time of day. It is a pure function of the simulation clock (`GameState.time`), which the
// server keeps and every client mirrors, so all players in a world see the same sun. Night matters
// to the simulation: pirates raid after dark, and lookouts and ships see less of the sea.

/** Seconds of game time in one full day and night. */
export const DAY_SECONDS = 480;
/** How far into the day a new world starts (0 is sunrise): a bright morning. */
export const DAY_START = 0.1;

export type DayPeriod = "Dawn" | "Morning" | "Midday" | "Afternoon" | "Dusk" | "Night";

/** Where in the day the clock is, from 0 (sunrise) up to but not including 1. */
export function dayPhase(time: number): number {
  const p = (time / DAY_SECONDS + DAY_START) % 1;
  return p < 0 ? p + 1 : p;
}

/** Which day it is, counting from 1. */
export function dayNumber(time: number): number {
  return Math.floor(time / DAY_SECONDS + DAY_START) + 1;
}

export function dayPeriod(phase: number): DayPeriod {
  if (phase < 0.07 || phase >= 0.95) return "Dawn";
  if (phase < 0.2) return "Morning";
  if (phase < 0.3) return "Midday";
  if (phase < 0.54) return "Afternoon";
  if (phase < 0.66) return "Dusk";
  return "Night";
}

/** A clock face for a phase: sunrise is 06:00, and the day runs on the usual 24 hours. */
export function clockText(phase: number): string {
  const minutes = Math.floor(((phase * 24 + 6) % 24) * 60);
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * How dark it is, from 0 in daylight to 1 in the dead of night, at a point in the day. The client
 * grades the world with the same curve (a test keeps them in step).
 */
const NIGHT_KEYS: readonly (readonly [number, number])[] = [
  [0, 0.25],
  [0.06, 0],
  [0.5, 0],
  [0.58, 0.35],
  [0.66, 0.8],
  [0.74, 1],
  [0.9, 1],
  [0.96, 0.6],
];

export function nightAtPhase(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  let i = NIGHT_KEYS.length - 1;
  for (let k = 0; k < NIGHT_KEYS.length - 1; k++)
    if (p >= NIGHT_KEYS[k]![0] && p < NIGHT_KEYS[k + 1]![0]) i = k;
  const a = NIGHT_KEYS[i]!;
  // The last keyframe fades into the first one of the next day.
  const b = NIGHT_KEYS[(i + 1) % NIGHT_KEYS.length]!;
  const span = i === NIGHT_KEYS.length - 1 ? 1 - a[0] + b[0] : b[0] - a[0];
  const raw = Math.min(1, Math.max(0, (p >= a[0] ? p - a[0] : p + 1 - a[0]) / span));
  const t = raw * raw * (3 - 2 * raw);
  return a[1] + (b[1] - a[1]) * t;
}

/** How dark it is at a moment of game time. */
export function nightLevel(time: number): number {
  return nightAtPhase(dayPhase(time));
}

// The time of day. It is a pure function of the simulation clock (`GameState.time`), which the
// server keeps and every client mirrors, so all players in a world see the same sun. Nothing in
// the simulation depends on it: day and night are only how the world looks.

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

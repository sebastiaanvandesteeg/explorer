import { describe, expect, it } from "vitest";
import {
  DAY_SECONDS,
  DAY_START,
  clockText,
  dayNumber,
  dayPeriod,
  dayPhase,
} from "../src/sim/daylight";

describe("daylight", () => {
  it("starts in the morning and wraps once a day", () => {
    expect(dayPhase(0)).toBeCloseTo(DAY_START, 10);
    expect(dayPhase(DAY_SECONDS)).toBeCloseTo(DAY_START, 10);
    expect(dayPhase(DAY_SECONDS * 3.25)).toBeCloseTo((DAY_START + 0.25) % 1, 10);
    for (const t of [-500, 0, 12.5, 999, 123456]) {
      expect(dayPhase(t)).toBeGreaterThanOrEqual(0);
      expect(dayPhase(t)).toBeLessThan(1);
    }
  });

  it("counts days from 1 and rolls over at sunrise", () => {
    expect(dayNumber(0)).toBe(1);
    // Sunrise is phase 0: a fraction (1 - DAY_START) of a day after the start.
    const sunrise = (1 - DAY_START) * DAY_SECONDS;
    expect(dayNumber(sunrise - 1)).toBe(1);
    expect(dayNumber(sunrise + 1)).toBe(2);
    expect(dayNumber(sunrise + DAY_SECONDS)).toBe(3);
  });

  it("names the parts of the day", () => {
    expect(dayPeriod(0.02)).toBe("Dawn");
    expect(dayPeriod(0.98)).toBe("Dawn");
    expect(dayPeriod(0.12)).toBe("Morning");
    expect(dayPeriod(0.25)).toBe("Midday");
    expect(dayPeriod(0.4)).toBe("Afternoon");
    expect(dayPeriod(0.58)).toBe("Dusk");
    expect(dayPeriod(0.8)).toBe("Night");
  });

  it("reads the clock: sunrise at 06:00, noon a quarter of the way through", () => {
    expect(clockText(0)).toBe("06:00");
    expect(clockText(0.25)).toBe("12:00");
    expect(clockText(0.5)).toBe("18:00");
    expect(clockText(0.75)).toBe("00:00");
    expect(clockText(0.999)).toMatch(/^05:\d\d$/);
  });
});

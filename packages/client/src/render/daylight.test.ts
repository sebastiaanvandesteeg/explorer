import { describe, expect, it } from "vitest";
import { nightAtPhase } from "@explorer/shared";
import { daylight } from "./daylight";

describe("daylight grade", () => {
  it("darkens the world exactly as fast as the simulation says it is dark", () => {
    // The sim uses the night level for raids and sight; the screen must agree with it.
    for (let p = 0; p < 1; p += 0.005) {
      expect(daylight(p).night).toBeCloseTo(nightAtPhase(p), 9);
    }
  });

  it("is plain daylight at midday and dark blue in the dead of night", () => {
    const noon = daylight(0.25);
    expect(noon.night).toBe(0);
    expect(noon.brightness).toBeCloseTo(1, 2);
    for (const c of noon.tint) expect(c).toBeCloseTo(1, 1);
    const midnight = daylight(0.8);
    expect(midnight.night).toBe(1);
    expect(midnight.brightness).toBeLessThan(0.6);
    expect(midnight.tint[2]).toBeGreaterThan(midnight.tint[0] * 1.5);
  });

  it("is warm at sunset and cool at night", () => {
    const dusk = daylight(0.58);
    expect(dusk.tint[0]).toBeGreaterThan(dusk.tint[2]);
    const night = daylight(0.8);
    expect(night.tint[2]).toBeGreaterThan(night.tint[0]);
  });

  it("changes smoothly, and the end of the day meets the start of the next", () => {
    expect(daylight(0.9999).brightness).toBeCloseTo(daylight(0).brightness, 2);
    expect(daylight(0.9999).night).toBeCloseTo(daylight(0).night, 2);
    let step = 0;
    let last = daylight(0);
    for (let p = 0.002; p <= 1; p += 0.002) {
      const g = daylight(p);
      step = Math.max(
        step,
        Math.abs(g.brightness - last.brightness),
        Math.abs(g.night - last.night),
      );
      last = g;
    }
    // No jumps: at most a few percent per two-thousandth of a day.
    expect(step).toBeLessThan(0.04);
  });

  it("wraps phases outside 0..1", () => {
    expect(daylight(1.25).brightness).toBeCloseTo(daylight(0.25).brightness, 10);
    expect(daylight(-0.2).brightness).toBeCloseTo(daylight(0.8).brightness, 10);
  });
});

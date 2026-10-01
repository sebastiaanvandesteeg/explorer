import { describe, expect, it } from "vitest";
import type { Engine, NoiseSpec, ToneSpec } from "./engine";
import { isFoley } from "./mix";
import { SOUNDS, type SoundName } from "./sounds";

/** What a recipe asks the synthesiser for, without making any sound. */
function record(name: SoundName): { tones: ToneSpec[]; noises: NoiseSpec[] } {
  const tones: ToneSpec[] = [];
  const noises: NoiseSpec[] = [];
  const engine = { tone: (s: ToneSpec) => tones.push(s), noise: (s: NoiseSpec) => noises.push(s) };
  SOUNDS[name](engine as unknown as Engine, { gain: 1, pan: 0, delay: 0 });
  return { tones, noises };
}

describe("sound design", () => {
  const names = Object.keys(SOUNDS) as SoundName[];

  it("keeps people's movement tonal: no noise in footsteps, doors or voices", () => {
    for (const name of names.filter((n) => isFoley(n))) {
      expect(record(name).noises, name).toEqual([]);
    }
  });

  it("never uses a bright burst of noise", () => {
    for (const name of names) {
      for (const n of record(name).noises) {
        expect(n.filter?.type, name).not.toBe("highpass");
        expect(n.level, name).toBeLessThanOrEqual(1);
      }
    }
  });

  it("starts every repeating tap gently, with no click", () => {
    for (const name of names.filter((n) => isFoley(n) || ["chop", "pick", "dig"].includes(n))) {
      for (const t of record(name).tones) expect(t.attack ?? 0, name).toBeGreaterThanOrEqual(0.006);
    }
  });

  it("keeps footsteps quiet", () => {
    for (const name of names.filter((n) => n.startsWith("step_"))) {
      const loudest = Math.max(...record(name).tones.map((t) => t.level));
      expect(loudest, name).toBeLessThanOrEqual(0.25);
    }
  });
});

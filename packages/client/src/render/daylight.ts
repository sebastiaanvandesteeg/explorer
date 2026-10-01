// How the time of day colours the world: a grade (tint, brightness, saturation, contrast) that is
// multiplied into the biome's own grade, and how dark the night is for everything that reacts to
// it (windows glow, fireflies come out, the vignette closes in).

export interface DayGrade {
  tint: [number, number, number];
  brightness: number;
  saturation: number;
  contrast: number;
  /** 0 in daylight to 1 in the dead of night. */
  night: number;
}

/** Keyframes through one day, from sunrise; the last blends back into the first. */
const KEYS: { at: number; grade: DayGrade }[] = [
  {
    at: 0,
    grade: {
      tint: [1.12, 0.96, 0.9],
      brightness: 0.86,
      saturation: 0.96,
      contrast: 1,
      night: 0.25,
    },
  },
  {
    at: 0.06,
    grade: { tint: [1.05, 1, 0.95], brightness: 0.97, saturation: 1, contrast: 1, night: 0 },
  },
  { at: 0.14, grade: { tint: [1, 1, 1], brightness: 1, saturation: 1, contrast: 1, night: 0 } },
  { at: 0.4, grade: { tint: [1, 1, 0.99], brightness: 1, saturation: 1, contrast: 1, night: 0 } },
  {
    at: 0.5,
    grade: { tint: [1.1, 1, 0.86], brightness: 0.98, saturation: 1.08, contrast: 1, night: 0 },
  },
  {
    at: 0.58,
    grade: {
      tint: [1.2, 0.86, 0.72],
      brightness: 0.86,
      saturation: 1,
      contrast: 1.02,
      night: 0.35,
    },
  },
  {
    at: 0.66,
    grade: {
      tint: [0.72, 0.68, 0.92],
      brightness: 0.64,
      saturation: 0.9,
      contrast: 1.03,
      night: 0.8,
    },
  },
  {
    at: 0.74,
    grade: {
      tint: [0.52, 0.62, 0.98],
      brightness: 0.52,
      saturation: 0.8,
      contrast: 1.05,
      night: 1,
    },
  },
  {
    at: 0.9,
    grade: {
      tint: [0.52, 0.62, 0.98],
      brightness: 0.52,
      saturation: 0.8,
      contrast: 1.05,
      night: 1,
    },
  },
  {
    at: 0.96,
    grade: {
      tint: [0.74, 0.72, 0.98],
      brightness: 0.68,
      saturation: 0.9,
      contrast: 1.02,
      night: 0.6,
    },
  },
];

const ease = (t: number) => t * t * (3 - 2 * t);

/** The grade at a point in the day (0 is sunrise), blended smoothly between keyframes. */
export function daylight(phase: number): DayGrade {
  const p = ((phase % 1) + 1) % 1;
  let i = KEYS.length - 1;
  for (let k = 0; k < KEYS.length - 1; k++) if (p >= KEYS[k]!.at && p < KEYS[k + 1]!.at) i = k;
  const a = KEYS[i]!;
  // The last keyframe fades into the first one of the next day.
  const b = KEYS[(i + 1) % KEYS.length]!;
  const span = i === KEYS.length - 1 ? 1 - a.at + b.at : b.at - a.at;
  const t = ease(Math.min(1, Math.max(0, (p >= a.at ? p - a.at : p + 1 - a.at) / span)));
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    tint: [
      mix(a.grade.tint[0], b.grade.tint[0]),
      mix(a.grade.tint[1], b.grade.tint[1]),
      mix(a.grade.tint[2], b.grade.tint[2]),
    ],
    brightness: mix(a.grade.brightness, b.grade.brightness),
    saturation: mix(a.grade.saturation, b.grade.saturation),
    contrast: mix(a.grade.contrast, b.grade.contrast),
    night: mix(a.grade.night, b.grade.night),
  };
}

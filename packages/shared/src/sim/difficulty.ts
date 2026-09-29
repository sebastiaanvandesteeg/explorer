// How hostile a world is, chosen when it is created and shared by the whole co-op team.

export const DIFFICULTIES = ["peaceful", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  description: string;
  /** Whether pirates raid at all. */
  raids: boolean;
  /** Seconds of game time before the first raid, and the range between raids. */
  firstRaid: number;
  interval: readonly [number, number];
  /** Raiders added to every raid, and how many can be at sea at once. */
  extraRaiders: number;
  maxAtOnce: number;
  /** Multipliers on pirate hull points, pirate cannon damage and the share of a pile a raid takes. */
  pirateHp: number;
  pirateDamage: number;
  steal: number;
  /** Multiplier on how much storms hurt ships (0: storms are only weather) and on their spacing. */
  stormDamage: number;
  stormSpacing: number;
}

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  peaceful: {
    id: "peaceful",
    name: "Peaceful",
    description: "No pirates and harmless storms: explore, settle and trade in peace.",
    raids: false,
    firstRaid: 0,
    interval: [0, 0],
    extraRaiders: 0,
    maxAtOnce: 0,
    pirateHp: 1,
    pirateDamage: 1,
    steal: 1,
    stormDamage: 0,
    stormSpacing: 1.5,
  },
  normal: {
    id: "normal",
    name: "Normal",
    description:
      "Raiding ships come at dusk, every few minutes, once the expedition has found its feet.",
    raids: true,
    firstRaid: 420,
    interval: [200, 320],
    extraRaiders: 0,
    maxAtOnce: 3,
    pirateHp: 1,
    pirateDamage: 1,
    steal: 1,
    stormDamage: 1,
    stormSpacing: 1,
  },
  hard: {
    id: "hard",
    name: "Hard",
    description:
      "Earlier, bigger and tougher raids that take more of what you have stored, and fiercer storms.",
    raids: true,
    firstRaid: 300,
    interval: [130, 220],
    extraRaiders: 1,
    maxAtOnce: 4,
    pirateHp: 1.4,
    pirateDamage: 1.25,
    steal: 1.5,
    stormDamage: 1.5,
    stormSpacing: 0.7,
  },
};

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}

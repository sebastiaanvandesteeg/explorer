// What a player's character looks like: a class, a build and three colours. Purely cosmetic for
// now. The colours are indices into the palettes below so the server never trusts raw colours and
// the art can be retuned without touching saved worlds.

export const CHARACTER_CLASSES = [
  "mage",
  "thief",
  "knight",
  "archer",
  "cleric",
  "barbarian",
  "bard",
  "druid",
] as const;
export type CharacterClass = (typeof CHARACTER_CLASSES)[number];

export const CLASS_DEFS: Record<CharacterClass, { name: string; blurb: string }> = {
  mage: { name: "Mage", blurb: "A star-spangled hat, a long robe and a staff that glows." },
  thief: { name: "Thief", blurb: "A hooded cloak, soft boots and a blade kept out of sight." },
  knight: { name: "Knight", blurb: "Plate and a plumed helm, with a sword and a shield." },
  archer: { name: "Archer", blurb: "A feathered cap, a green jerkin and a bow across the back." },
  cleric: { name: "Cleric", blurb: "White and gold vestments, and a mace for the stubborn." },
  barbarian: { name: "Barbarian", blurb: "Furs, bare arms and an axe as big as the rest of them." },
  bard: { name: "Bard", blurb: "A plumed beret, a bright doublet and a lute." },
  druid: { name: "Druid", blurb: "Leaves, bark and a crooked staff from the old woods." },
};

export const BUILDS = ["slim", "average", "sturdy"] as const;
export type Build = (typeof BUILDS)[number];

/** Skin tones, light to dark: the mid-tone of each; the art shades it lighter and darker. */
export const SKIN_TONES = [
  "#f6d5b8",
  "#eebf98",
  "#dca67a",
  "#c68a5e",
  "#a66c45",
  "#85502f",
  "#63391f",
  "#45271a",
] as const;

/** Hair colours: naturals first, then a few that are not. */
export const HAIR_COLOURS = [
  "#1e1a1f",
  "#4a2f22",
  "#7a4a2a",
  "#b5763a",
  "#d8b45a",
  "#ece0b0",
  "#b64a2c",
  "#8a8a92",
  "#e8e8ee",
  "#3f6ad0",
  "#4aa85a",
  "#c75aa8",
] as const;

export const EYE_COLOURS = [
  "#3a2a1f",
  "#7a4a22",
  "#3f7ad0",
  "#3c9a64",
  "#8a8f99",
  "#7a5ac8",
  "#d0a020",
  "#c03a3a",
] as const;

export interface CharacterLook {
  class: CharacterClass;
  /** Index into BUILDS. */
  build: number;
  /** Indices into SKIN_TONES, HAIR_COLOURS and EYE_COLOURS. */
  skin: number;
  hair: number;
  eyes: number;
}

export const DEFAULT_LOOK: CharacterLook = {
  class: "mage",
  build: 1,
  skin: 1,
  hair: 1,
  eyes: 2,
};

const index = (v: unknown, length: number, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < length ? v : fallback;

/** A safe look from anything (a message from a client, an old save): bad fields fall back. */
export function sanitizeLook(raw: unknown, fallback: CharacterLook = DEFAULT_LOOK): CharacterLook {
  const v = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const cls = CHARACTER_CLASSES.find((c) => c === v.class) ?? fallback.class;
  return {
    class: cls,
    build: index(v.build, BUILDS.length, fallback.build),
    skin: index(v.skin, SKIN_TONES.length, fallback.skin),
    hair: index(v.hair, HAIR_COLOURS.length, fallback.hair),
    eyes: index(v.eyes, EYE_COLOURS.length, fallback.eyes),
  };
}

/** Whether a message's look is well formed (the server rejects malformed ones outright). */
export function isLook(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const v = raw as Record<string, unknown>;
  return (
    CHARACTER_CLASSES.some((c) => c === v.class) &&
    index(v.build, BUILDS.length, -1) >= 0 &&
    index(v.skin, SKIN_TONES.length, -1) >= 0 &&
    index(v.hair, HAIR_COLOURS.length, -1) >= 0 &&
    index(v.eyes, EYE_COLOURS.length, -1) >= 0
  );
}

/** A varied look for characters made without one (old saves, tests): stable for a given id. */
export function defaultLookFor(id: number): CharacterLook {
  return {
    class: CHARACTER_CLASSES[id % CHARACTER_CLASSES.length]!,
    build: (id + 1) % BUILDS.length,
    skin: (id * 3) % SKIN_TONES.length,
    hair: (id * 5) % HAIR_COLOURS.length,
    eyes: (id * 7) % EYE_COLOURS.length,
  };
}

export const hexToNumber = (hex: string): number => parseInt(hex.slice(1), 16);

/** The canvas every hero layer is drawn on (texels), with the feet at the anchor. */
export const HERO_FRAME = { width: 72, height: 92, anchorX: 36, anchorY: 84 } as const;

/** The part of that canvas a preview shows: every hero fits in it, hats and staffs included. */
export const HERO_CROP = { x: 12, y: 22, width: 48, height: 64 } as const;

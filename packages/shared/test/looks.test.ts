import { describe, expect, it } from "vitest";
import {
  applyPatch,
  BUILDS,
  CHARACTER_CLASSES,
  characterOf,
  createInitialState,
  DEFAULT_LOOK,
  defaultLookFor,
  ensureCharacter,
  EYE_COLOURS,
  fromSnapshot,
  fromWire,
  generateWorld,
  HAIR_COLOURS,
  isLook,
  sanitizeLook,
  setLook,
  SKIN_TONES,
  takePatch,
  toSnapshot,
  toWire,
  type CharacterLook,
} from "../src";

const world = generateWorld("look-tests");

describe("character looks", () => {
  it("offers eight classes, three builds and palettes of colours", () => {
    expect(CHARACTER_CLASSES).toHaveLength(8);
    expect(BUILDS).toHaveLength(3);
    for (const palette of [SKIN_TONES, HAIR_COLOURS, EYE_COLOURS])
      for (const hex of palette) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("repairs anything a client might send", () => {
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook("mage")).toEqual(DEFAULT_LOOK);
    const bad = { class: "wizard", build: 9, skin: -1, hair: 1.5, eyes: "x" };
    expect(sanitizeLook(bad)).toEqual(DEFAULT_LOOK);
    const ok: CharacterLook = { class: "thief", build: 0, skin: 7, hair: 11, eyes: 7 };
    expect(sanitizeLook(ok)).toEqual(ok);
    expect(isLook(ok)).toBe(true);
    expect(isLook(bad)).toBe(false);
    expect(isLook({ ...ok, build: 3 })).toBe(false);
    expect(isLook(undefined)).toBe(false);
  });

  it("gives characters made without a look a stable, varied one", () => {
    expect(defaultLookFor(3)).toEqual(defaultLookFor(3));
    const classes = new Set(Array.from({ length: 8 }, (_, i) => defaultLookFor(i).class));
    expect(classes.size).toBe(8);
    for (let i = 0; i < 40; i++) expect(isLook(defaultLookFor(i))).toBe(true);
  });

  it("makes a character with the chosen look, and changes it later", () => {
    const state = createInitialState(world);
    const look: CharacterLook = { class: "knight", build: 2, skin: 5, hair: 9, eyes: 3 };
    const c = ensureCharacter(state, "p1", look);
    expect(c.look).toEqual(look);
    // Asking again keeps the character as it is.
    expect(ensureCharacter(state, "p1", DEFAULT_LOOK).look).toEqual(look);
    state.dirty.clear();
    setLook(state, "p1", { class: "bard", build: 0, skin: 0, hair: 0, eyes: 0 });
    expect(characterOf(state, "p1")!.look.class).toBe("bard");
    expect(state.dirty.has(c.id)).toBe(true);
    // The same look again is not a change.
    state.dirty.clear();
    setLook(state, "p1", characterOf(state, "p1")!.look);
    expect(state.dirty.size).toBe(0);
  });

  it("travels in patches and snapshots", () => {
    const state = createInitialState(world);
    const look: CharacterLook = { class: "druid", build: 0, skin: 2, hair: 10, eyes: 5 };
    const c = ensureCharacter(state, "p1", look);
    const mirror = fromSnapshot(world, toSnapshot(state));
    expect(characterOf(mirror, "p1")!.look).toEqual(look);
    state.dirty.clear();
    setLook(state, "p1", { ...look, class: "cleric" });
    applyPatch(mirror, takePatch(state));
    expect(characterOf(mirror, "p1")!.look.class).toBe("cleric");
    expect((toWire(c) as { look: CharacterLook }).look).toEqual(c.look);
  });

  it("gives characters from older saves a look", () => {
    const state = createInitialState(world);
    const c = ensureCharacter(state, "p1");
    const wire = JSON.parse(JSON.stringify(toWire(c))) as Record<string, unknown>;
    delete wire.look;
    const back = fromWire(wire as never) as typeof c;
    expect(isLook(back.look)).toBe(true);
    expect(back.look).toEqual(defaultLookFor(c.id));
  });
});

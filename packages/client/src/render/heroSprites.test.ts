import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILDS, CHARACTER_CLASSES, type CharacterLook } from "@explorer/shared";
import { HERO_LAYER_ORDER, heroLayerSprite } from "./names";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/assets/atlas.json", import.meta.url), "utf8"),
) as { sprites: Record<string, { res?: number }> };

const look = (cls: CharacterLook["class"], build: number): CharacterLook => ({
  class: cls,
  build,
  skin: 0,
  hair: 0,
  eyes: 0,
});

describe("hero sprites", () => {
  it("has the body layers of every class, build, facing and pose, at double density", () => {
    for (const cls of CHARACTER_CLASSES)
      for (let build = 0; build < BUILDS.length; build++)
        for (const back of [false, true])
          for (const pose of ["stand", "walk0", "walk1"])
            for (const layer of ["outfit", "skin", "scarf", "hair", "hat", "rim"] as const) {
              const name = heroLayerSprite(layer, look(cls, build), back, pose);
              expect(name, `${cls} ${layer}`).not.toBeNull();
              expect(manifest.sprites[name!]?.res, name!).toBe(2);
            }
  });

  it("gives every class something to hold or wear besides its clothes", () => {
    for (const cls of CHARACTER_CLASSES)
      for (let build = 0; build < BUILDS.length; build++)
        for (const back of [false, true]) {
          const names = (["prop", "gear"] as const).map((l) =>
            heroLayerSprite(l, look(cls, build), back, "stand")!,
          );
          expect(
            names.some((n) => manifest.sprites[n]),
            `${cls} ${build}`,
          ).toBe(true);
        }
  });

  it("draws a face only from the front", () => {
    expect(heroLayerSprite("face", look("mage", 1), true, "stand")).toBeNull();
    expect(heroLayerSprite("iris", look("mage", 1), true, "stand")).toBeNull();
    for (const layer of ["face", "iris"] as const)
      expect(
        manifest.sprites[heroLayerSprite(layer, look("mage", 1), false, "stand")!],
      ).toBeDefined();
  });

  it("stacks the layers from the props behind to the rim on top", () => {
    expect(HERO_LAYER_ORDER[0]).toBe("prop");
    expect(HERO_LAYER_ORDER.at(-1)).toBe("rim");
    expect(HERO_LAYER_ORDER.indexOf("hair")).toBeLessThan(HERO_LAYER_ORDER.indexOf("hat"));
    expect(HERO_LAYER_ORDER.indexOf("skin")).toBeLessThan(HERO_LAYER_ORDER.indexOf("face"));
  });

  it("has no hero frames that nothing can show", () => {
    const valid = new Set<string>();
    for (const cls of CHARACTER_CLASSES)
      for (let build = 0; build < BUILDS.length; build++)
        for (const back of [false, true])
          for (const pose of ["stand", "walk0", "walk1"])
            for (const layer of HERO_LAYER_ORDER) {
              const name = heroLayerSprite(layer, look(cls, build), back, pose);
              if (name) valid.add(name);
            }
    const stray = Object.keys(manifest.sprites).filter(
      (n) => n.startsWith("hero_") && !valid.has(n),
    );
    expect(stray).toEqual([]);
  });
});

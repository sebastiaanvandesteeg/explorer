import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/assets/atlas.json", import.meta.url), "utf8"),
) as { sprites: Record<string, { res?: number }> };

const STYLES = ["scout", "cargo", "patrol", "pirate"] as const;

describe("ship sprites", () => {
  it("has every hull heading and its waterline layers for every kind of ship", () => {
    for (const style of STYLES)
      for (let k = 0; k < 16; k++) {
        const hull = `${style === "scout" ? "ship" : style}_${k}`;
        for (const name of [
          hull,
          `shipwet_${style}_${k}`,
          `shipshadow_${style}_${k}`,
          `shipfoam_${style}_${k}_0`,
          `shipfoam_${style}_${k}_1`,
        ]) {
          expect(manifest.sprites[name], name).toBeDefined();
          expect(manifest.sprites[name]?.res, name).toBe(2);
        }
      }
  });

  it("has the wake sprites", () => {
    for (const name of ["wake_foam_0", "wake_foam_1", "wake_foam_2", "wake_ring", "wake_spray"])
      expect(manifest.sprites[name], name).toBeDefined();
  });
});

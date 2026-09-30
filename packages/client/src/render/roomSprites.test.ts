import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOMS, roomPieces, roomSpriteNames, TRIBES, type BuildingKind } from "@explorer/shared";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/assets/atlas.json", import.meta.url), "utf8"),
) as { sprites: Record<string, { res?: number; lights?: unknown[] }> };

describe("the atlas and the rooms", () => {
  it.each(TRIBES)("has every sprite the rooms of the %s need, at double density", (tribe) => {
    for (const name of roomSpriteNames(tribe)) {
      const sprite = manifest.sprites[name];
      expect(sprite, name).toBeDefined();
      expect(sprite?.res, name).toBe(2);
    }
  });

  it("has no interior sprites that no room uses", () => {
    const used = new Set(TRIBES.flatMap((t) => roomSpriteNames(t)));
    const stray = Object.keys(manifest.sprites).filter((n) => n.startsWith("in_") && !used.has(n));
    expect(stray).toEqual([]);
  });

  it("lights the fires: hearths, forges, braziers and altars shine", () => {
    for (const [room, kind] of [
      ["house", "hearth"],
      ["blacksmith", "forge"],
      ["church", "brazier"],
      ["church", "altar"],
    ] as const) {
      const def = ROOMS[room as BuildingKind]!;
      const piece = roomPieces(room as BuildingKind, def, "islanders").find(
        (p) => p.item?.kind === kind,
      )!;
      expect(manifest.sprites[piece.sprite]?.lights?.length, `${room} ${kind}`).toBeGreaterThan(0);
    }
  });
});

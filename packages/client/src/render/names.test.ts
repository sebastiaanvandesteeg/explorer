import { describe, expect, it } from "vitest";
import { createInitialState, generateWorld, newBuilding } from "@explorer/shared";
import { buildingSprite, buildingThumb, scaffoldSprite } from "./names";

const world = generateWorld("names-tests");

describe("Great Work sprites", () => {
  it("shows the stage that stands, or a ghost of the one going up", () => {
    const s = createInitialState(world);
    const gw = newBuilding(s, "great_work", 10, 10, false);
    // Founding: the first stage's ghost.
    expect(buildingSprite(gw, "sylvan")).toBe("b_great_work_1_sylvan");
    gw.stage = 1;
    gw.complete = true;
    expect(buildingSprite(gw, "sylvan")).toBe("b_great_work_1_sylvan");
    // Funding stage two: its ghost under the scaffold.
    gw.complete = false;
    expect(buildingSprite(gw, "sylvan")).toBe("b_great_work_2_sylvan");
    gw.stage = 3;
    gw.complete = true;
    expect(buildingSprite(gw, "northfolk")).toBe("b_great_work_3_northfolk");
    expect(buildingThumb("great_work", "sunfolk")).toBe("b_great_work_3_sunfolk");
  });

  it("puts a big scaffold round a big building", () => {
    expect(scaffoldSprite(4, 4)).toBe("scaffold_4x4");
    expect(scaffoldSprite(3, 3)).toBe("scaffold_3x3");
    expect(scaffoldSprite(2, 3)).toBe("scaffold_2x3");
  });
});

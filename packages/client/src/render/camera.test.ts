import { describe, expect, it } from "vitest";
import { Camera } from "./camera";

describe("Camera", () => {
  it("maps screen and world coordinates both ways", () => {
    const cam = new Camera(192, 192);
    cam.resize(1280, 800);
    cam.centerOn(100, 1500);
    const w = cam.screenToWorld(400, 300);
    const s = cam.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(400);
    expect(s.y).toBeCloseTo(300);
  });
});

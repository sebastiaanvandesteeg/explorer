import { describe, expect, it } from "vitest";
import { Camera } from "./camera";

describe("Camera", () => {
  it("maps screen and world coordinates both ways", () => {
    const cam = new Camera(192, 192);
    cam.resize(1280, 800);
    cam.zoom = 3;
    cam.centerOn(100, 1500);
    const w = cam.screenToWorld(400, 300);
    const s = cam.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(400);
    expect(s.y).toBeCloseTo(300);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const cam = new Camera(192, 192);
    cam.resize(1280, 800);
    cam.centerOn(0, 1500);
    const before = cam.screenToWorld(900, 200);
    cam.zoomAt(1, 900, 200);
    expect(cam.zoom).toBe(3);
    const after = cam.screenToWorld(900, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to whole steps between 1 and 5", () => {
    const cam = new Camera(192, 192);
    cam.resize(800, 600);
    for (let i = 0; i < 10; i++) cam.zoomAt(1, 0, 0);
    expect(cam.zoom).toBe(5);
    for (let i = 0; i < 10; i++) cam.zoomAt(-1, 0, 0);
    expect(cam.zoom).toBe(1);
  });
});

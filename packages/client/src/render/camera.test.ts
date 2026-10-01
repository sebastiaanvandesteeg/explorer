import { describe, expect, it } from "vitest";
import { Camera, SAIL_ZOOM, ZOOM } from "./camera";

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

  it("eases the zoom towards a level without moving the centre", () => {
    const cam = new Camera(192, 192);
    cam.resize(1280, 800);
    cam.centerOn(300, 900);
    expect(cam.zoom).toBe(ZOOM);
    const centre = cam.screenToWorld(640, 400);
    for (let i = 0; i < 12; i++) cam.easeZoom(SAIL_ZOOM, 0.1);
    expect(cam.zoom).toBeLessThan(ZOOM);
    expect(cam.zoom).toBeGreaterThanOrEqual(SAIL_ZOOM);
    const now = cam.screenToWorld(640, 400);
    expect(now.x).toBeCloseTo(centre.x, 0);
    for (let i = 0; i < 200; i++) cam.easeZoom(SAIL_ZOOM, 0.1);
    expect(cam.zoom).toBe(SAIL_ZOOM);
    for (let i = 0; i < 200; i++) cam.easeZoom(ZOOM, 0.1);
    expect(cam.zoom).toBe(ZOOM);
  });
});

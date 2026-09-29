import { describe, expect, it } from "vitest";
import { isGamePath, movedPath, worldIdFromPath, worldPath } from "../src/routes";

describe("routes", () => {
  it("puts worlds under /play and reads their id back", () => {
    expect(worldPath("abcd1234")).toBe("/play/w/abcd1234");
    expect(worldIdFromPath(worldPath("abcd1234"))).toBe("abcd1234");
    expect(worldIdFromPath("/play/w/AbCd1234/")).toBe("abcd1234");
    expect(worldIdFromPath("/w/abcd1234")).toBeNull();
    expect(worldIdFromPath("/play/w/ab")).toBeNull();
    expect(worldIdFromPath("/play")).toBeNull();
  });

  it("tells game pages from the landing site and files", () => {
    for (const p of ["/play", "/play/", "/play/w/abcd1234", "/play/w/abcd1234/"])
      expect(isGamePath(p)).toBe(true);
    for (const p of ["/", "/player", "/playground/x", "/play/index.html", "/assets/atlas.json"])
      expect(isGamePath(p)).toBe(false);
  });

  it("sends links from before the move to the game", () => {
    expect(movedPath("/w/abcd1234", "")).toBe("/play/w/abcd1234");
    expect(movedPath("/w/ABCD1234/", "?x=1")).toBe("/play/w/abcd1234?x=1");
    expect(movedPath("/", "?offline&seed=reef&tribe=sylvan")).toBe(
      "/play?offline&seed=reef&tribe=sylvan",
    );
    expect(movedPath("/", "")).toBeNull();
    expect(movedPath("/", "?seed=x&offline")).toBe("/play?seed=x&offline");
    expect(movedPath("/", "?utm=x")).toBeNull();
    expect(movedPath("/", "?offlinex=1")).toBeNull();
    expect(movedPath("/play/w/abcd1234", "")).toBeNull();
    expect(movedPath("/w/../x", "")).toBeNull();
  });
});

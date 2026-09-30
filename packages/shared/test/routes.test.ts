import { describe, expect, it } from "vitest";
import {
  isGamePath,
  movedPath,
  newsPath,
  newsSlugFromPath,
  sitePagePath,
  worldIdFromPath,
  worldPath,
} from "../src/routes";

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

describe("site pages", () => {
  it("serves the landing page at /home, and each page at its pretty URL", () => {
    expect(sitePagePath("/home")).toBe("/index.html");
    expect(sitePagePath("/home/")).toBe("/index.html");
    expect(sitePagePath("/news")).toBe("/news/index.html");
    expect(sitePagePath("/news/")).toBe("/news/index.html");
    expect(sitePagePath("/about")).toBe("/about/index.html");
    expect(sitePagePath("/the-lore")).toBe("/the-lore/index.html");
  });

  it("serves a release's notes from the news page", () => {
    expect(sitePagePath("/news/black-sails")).toBe("/news/index.html");
    expect(sitePagePath("/news/black-sails/")).toBe("/news/index.html");
    expect(newsSlugFromPath("/news/black-sails/")).toBe("black-sails");
    expect(newsSlugFromPath("/news")).toBeNull();
    expect(newsPath()).toBe("/news");
    expect(newsPath("black-sails")).toBe("/news/black-sails");
  });

  it("leaves files, the game and everything else alone", () => {
    for (const p of [
      "/",
      "/play",
      "/news/index.html",
      "/news/a/b",
      "/news/-x",
      "/assets/atlas.json",
      "/newsletter",
      "/about/x",
      "/the-lore/x",
    ])
      expect(sitePagePath(p)).toBeNull();
    expect(newsSlugFromPath("/news/a/b")).toBeNull();
  });
});

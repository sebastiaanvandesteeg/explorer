import { describe, expect, it } from "vitest";
import type { GameEvent, StormEntity } from "@explorer/shared";
import { BIOMES } from "@explorer/shared";
import { Terrain } from "@explorer/shared";
import {
  floorSound,
  layerTargets,
  soundsFor,
  spatialMix,
  stingersFor,
  stormLevel,
  surfaceSound,
  Walkers,
  workSound,
  STRIDE,
} from "./mix";
import { SOUNDS } from "./sounds";

describe("spatial mix", () => {
  it("is full volume anywhere on screen, and pans by position", () => {
    expect(spatialMix(640, 400, 1280, 800)).toEqual({ gain: 1, pan: 0 });
    expect(spatialMix(0, 0, 1280, 800).gain).toBe(1);
    expect(spatialMix(1280, 400, 1280, 800).pan).toBeCloseTo(0.85);
    expect(spatialMix(100, 400, 1280, 800).pan).toBeLessThan(0);
  });

  it("fades with distance outside the screen, but never to silence", () => {
    const near = spatialMix(1280 + 200, 400, 1280, 800).gain;
    const far = spatialMix(1280 + 800, 400, 1280, 800).gain;
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
    expect(spatialMix(1280 + 5000, 400, 1280, 800).gain).toBe(0.1);
  });
});

describe("what plays for what happens", () => {
  const at = { x: 10, y: 12 };
  const events: GameEvent[] = [
    { type: "built", kind: "house", ...at },
    { type: "villager", ...at },
    { type: "ship", ...at },
    { type: "discovered", islandId: 1, biome: "desert", ...at },
    { type: "landed", count: 2, islandId: 1, ...at },
    { type: "cargo", amount: 10, ...at },
    { type: "upgrade", upgrade: "far_sight" },
    { type: "robbed", islandId: 0, ...at },
    { type: "sunk", kind: "scout", ...at },
    { type: "found", site: "ruin", ...at },
    { type: "salvaged", what: "a shipwreck", goods: {}, ...at },
    { type: "shot", kind: "cannon", from: at, to: { x: 14, y: 12 } },
    { type: "shot", kind: "bolt", from: at, to: at },
    { type: "storm", ...at },
    { type: "wonder", stage: 1, final: false },
    { type: "wonder", stage: 3, final: true },
  ];

  it("has a sound for every event that should be heard, and only real sounds", () => {
    for (const ev of events) {
      const cues = soundsFor(ev);
      expect(cues.length, ev.type).toBeGreaterThan(0);
      for (const c of cues)
        expect(SOUNDS[c.sound], `${ev.type} -> ${c.sound}`).toBeTypeOf("function");
    }
    expect(soundsFor({ type: "pirates", count: 1, ...at })).toEqual([]);
  });

  it("puts sounds where they happen", () => {
    expect(soundsFor(events[0]!)[0]).toMatchObject({ sound: "hammer", at: { x: 10, y: 12 } });
    const cannon = soundsFor(events[11]!);
    expect(cannon[0]).toMatchObject({ sound: "boom", at });
    expect(cannon[1]).toMatchObject({ sound: "splash", at: { x: 14, y: 12 } });
    expect(soundsFor(events[15]!)[0]).toMatchObject({ sound: "fanfare" });
    expect(soundsFor(events[14]!)[0]).toMatchObject({ sound: "upgrade" });
  });

  it("knows the sound of each tool", () => {
    expect(workSound("axe")).toBe("chop");
    expect(workSound("pick")).toBe("pick");
    expect(workSound("hammer")).toBe("hammer");
    expect(workSound("hoe")).toBe("dig");
    expect(workSound(null)).toBeNull();
  });
});

describe("ambience", () => {
  it("rises and falls with the night, storms and places", () => {
    const calm = layerTargets({ night: 0, storm: 0, biome: "temperate" });
    const night = layerTargets({ night: 1, storm: 0, biome: "temperate" });
    const storm = layerTargets({ night: 0, storm: 1, biome: "temperate" });
    expect(night.crickets).toBeGreaterThan(calm.crickets);
    expect(storm.rain).toBeGreaterThan(calm.rain);
    expect(storm.wind).toBeGreaterThan(calm.wind);
    expect(storm.crickets).toBe(0);
    expect(layerTargets({ night: 0, storm: 0, biome: "infernal" }).rumble).toBeGreaterThan(
      calm.rumble,
    );
    expect(layerTargets({ night: 0, storm: 0, biome: "tundra" }).wind).toBeGreaterThan(calm.wind);
    // Open sea at night has few insects.
    expect(layerTargets({ night: 1, storm: 0, biome: null }).crickets).toBeLessThan(night.crickets);
  });

  it("keeps every layer in a sane range", () => {
    for (const biome of [...BIOMES, null])
      for (const night of [0, 0.5, 1])
        for (const storm of [0, 0.5, 1])
          for (const v of Object.values(layerTargets({ night, storm, biome }))) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1.2);
          }
  });

  it("gives each place its own occasional sounds, by day and by night", () => {
    const names = (biome: (typeof BIOMES)[number] | null, night: number) =>
      stingersFor({ night, storm: 0, biome }).map((s) => s.sound);
    expect(names("temperate", 0)).toContain("chirp");
    expect(names("temperate", 1)).toContain("hoot");
    expect(names("swamp", 1)).toContain("croak");
    expect(names("crystal", 0)).toContain("sparkle");
    expect(names("infernal", 0)).toContain("crackle");
    expect(names("blossom", 0)).toContain("windchime");
    expect(names(null, 0)).toEqual([]);
    expect(stingersFor({ night: 0, storm: 0.9, biome: "temperate" })).toEqual([]);
    for (const b of BIOMES)
      for (const s of stingersFor({ night: 0.5, storm: 0, biome: b }))
        expect(SOUNDS[s.sound]).toBeTypeOf("function");
  });
});

describe("storm level", () => {
  const storm = (x: number, y: number): StormEntity => ({
    id: 1,
    type: "storm",
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 8,
    age: 40,
    life: 200,
  });

  it("is full inside a storm and fades away outside it", () => {
    expect(stormLevel([storm(50, 50)], 52, 50)).toBe(1);
    const edge = stormLevel([storm(50, 50)], 62, 50);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(stormLevel([storm(50, 50)], 90, 50)).toBe(0);
    expect(stormLevel([], 50, 50)).toBe(0);
  });

  it("follows the storm's own strength as it builds up", () => {
    const young = { ...storm(50, 50), age: 3 };
    expect(stormLevel([young], 50, 50)).toBeCloseTo(0.2);
  });
});

describe("footsteps", () => {
  it("sound like the ground, with boards winning on a pier", () => {
    expect(surfaceSound(Terrain.Grass, false)).toBe("step_grass");
    expect(surfaceSound(Terrain.Sand, false)).toBe("step_sand");
    expect(surfaceSound(Terrain.Rock, false)).toBe("step_stone");
    expect(surfaceSound(Terrain.Dirt, false)).toBe("step_dirt");
    expect(surfaceSound(Terrain.Shallow, false)).toBe("step_water");
    expect(surfaceSound(Terrain.Sand, true)).toBe("step_wood");
    expect(floorSound("church")).toBe("step_stone");
    expect(floorSound("house")).toBe("step_wood");
  });

  const at = (x: number, y: number, extra = {}) => ({
    id: 1,
    x,
    y,
    you: true,
    sound: "step_grass" as const,
    ...extra,
  });

  it("step once per stride and not at all when standing still", () => {
    const w = new Walkers();
    expect(w.update([at(0, 0)])).toEqual([]);
    expect(w.update([at(0, 0)])).toEqual([]);
    let steps = 0;
    for (let i = 1; i <= 11; i++) steps += w.update([at(i * (STRIDE / 2), 0)]).length;
    expect(steps).toBe(5);
  });

  it("alternate feet, and hear other players from where they are", () => {
    const w = new Walkers();
    w.update([at(0, 0), at(0, 0, { id: 2, you: false })]);
    const [a, b] = w.update([at(STRIDE, 0), at(STRIDE, 0, { id: 2, you: false })]);
    expect(a!.at).toBeUndefined();
    expect(b!.at).toEqual({ x: STRIDE, y: 0 });
    expect(b!.gain!).toBeLessThan(a!.gain!);
    const next = w.update([at(STRIDE * 2, 0)]);
    expect(next[0]!.gain).not.toBe(a!.gain);
  });

  it("ignore teleports, rooms and ships", () => {
    const w = new Walkers();
    w.update([at(0, 0)]);
    expect(w.update([at(40, 40)])).toEqual([]);
    expect(w.update([at(40, 42, { silent: true })])).toEqual([]);
    expect(w.update([at(40, 44, { silent: true })])).toEqual([]);
    expect(w.update([at(40, 44)])).toEqual([]);
  });
});

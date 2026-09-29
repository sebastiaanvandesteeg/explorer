import { describe, expect, it } from "vitest";
import {
  applyCommand,
  addEntity,
  applyPatch,
  canPlaceBuilding,
  characterOf,
  characters,
  CHARACTER,
  createInitialState,
  ensureCharacter,
  fromSnapshot,
  generateWorld,
  isAdjacentTo,
  isGameMode,
  isLandTerrain,
  landPath,
  newBuilding,
  settledIslands,
  takePatch,
  tick,
  toSnapshot,
  toWire,
  walkable,
  type CharacterEntity,
  type GameState,
  type NodeEntity,
} from "../src";

const world = generateWorld("character-tests");

const adventure = (): GameState => createInitialState(world, { mode: "adventure" });

function run(state: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(state);
}

const move = (state: GameState, player: string | null, x: number, y: number) =>
  applyCommand(state, { kind: "move-character", x, y }, player);

/** A walkable tile on the home island that a character can reach in a handful of steps. */
function nearbyGoal(state: GameState, c: CharacterEntity, minSteps: number, maxSteps: number) {
  const from = { x: Math.floor(c.x), y: Math.floor(c.y) };
  for (let r = minSteps; r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const to = { x: from.x + dx, y: from.y + dy };
        if (!walkable(state, to.x, to.y)) continue;
        const path = landPath(state, from, [to]);
        if (path && path.length >= minSteps && path.length <= maxSteps) return to;
      }
    }
  }
  throw new Error("no goal found");
}

describe("world modes", () => {
  it("recognises the two modes", () => {
    expect(isGameMode("colony")).toBe(true);
    expect(isGameMode("adventure")).toBe(true);
    expect(isGameMode("creative")).toBe(false);
    expect(isGameMode(undefined)).toBe(false);
  });

  it("starts as a colony unless asked otherwise", () => {
    expect(createInitialState(world).mode).toBe("colony");
    expect(adventure().mode).toBe("adventure");
  });

  it("colony worlds have no characters and refuse to move one", () => {
    const state = createInitialState(world);
    const res = move(state, "p1", 10, 10);
    expect(res).toEqual({ ok: false, reason: "This world has no characters" });
    expect(characters(state)).toHaveLength(0);
  });
});

describe("characters", () => {
  it("are made once per player, on the home island beside the town hall", () => {
    const state = adventure();
    const a = ensureCharacter(state, "p1");
    expect(ensureCharacter(state, "p1")).toBe(a);
    expect(characters(state)).toHaveLength(1);
    const tile = { x: Math.floor(a.x), y: Math.floor(a.y) };
    expect(walkable(state, tile.x, tile.y)).toBe(true);
    expect(world.island[tile.y * world.width + tile.x]).toBe(world.start.islandId);
    const hall = world.start.townHall;
    expect(isAdjacentTo(tile.x, tile.y, hall.x, hall.y, hall.w, hall.h)).toBe(true);
  });

  it("give eight players eight spots of their own", () => {
    const state = adventure();
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    for (const id of ids) ensureCharacter(state, id);
    const spots = new Set(characters(state).map((c) => `${Math.floor(c.x)},${Math.floor(c.y)}`));
    expect(spots.size).toBe(8);
    expect(new Set(characters(state).map((c) => c.playerId)).size).toBe(8);
  });

  it("count as a foothold on the island they stand on", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const island = world.island[Math.floor(c.y) * world.width + Math.floor(c.x)]!;
    expect(settledIslands(state).has(island)).toBe(true);
  });

  it("keep buildings from going up on top of them", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    let spot: { x: number; y: number } | null = null;
    for (let r = 3; r < 20 && !spot; r++)
      for (let y = c.y - r; y <= c.y + r && !spot; y++)
        for (let x = c.x - r; x <= c.x + r && !spot; x++)
          if (canPlaceBuilding(state, "house", Math.floor(x), Math.floor(y), {}).ok)
            spot = { x: Math.floor(x), y: Math.floor(y) };
    expect(spot).not.toBeNull();
    c.x = spot!.x + 0.5;
    c.y = spot!.y + 0.5;
    expect(canPlaceBuilding(state, "house", spot!.x, spot!.y)).toEqual({
      ok: false,
      reason: "Someone is standing there",
    });
  });
});

describe("moving a character", () => {
  it("walks to the tile that was asked for, at the character's own pace", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const goal = nearbyGoal(state, c, 8, 20);
    const start = { x: c.x, y: c.y };
    expect(move(state, "p1", goal.x, goal.y)).toEqual({ ok: true });
    expect(c.action).toBe("walk");
    expect(c.dest).toEqual(goal);
    run(state, 1);
    // A second in, it has covered about CHARACTER.speed tiles, but is not there yet.
    const walked = Math.hypot(c.x - start.x, c.y - start.y);
    expect(walked).toBeGreaterThan(CHARACTER.speed * 0.5);
    expect(c.action).toBe("walk");
    run(state, 20);
    expect(c.action).toBe("idle");
    expect(c.dest).toBeNull();
    expect([Math.floor(c.x), Math.floor(c.y)]).toEqual([goal.x, goal.y]);
  });

  it("only ever moves the character of the player who asked", () => {
    const state = adventure();
    const a = ensureCharacter(state, "p1");
    const b = ensureCharacter(state, "p2");
    const bAt = { x: b.x, y: b.y };
    const goal = nearbyGoal(state, a, 6, 20);
    expect(move(state, "p1", goal.x, goal.y).ok).toBe(true);
    run(state, 20);
    expect([Math.floor(a.x), Math.floor(a.y)]).toEqual([goal.x, goal.y]);
    expect({ x: b.x, y: b.y }).toEqual(bAt);
    expect(b.action).toBe("idle");
  });

  it("needs a character: nobody else can be moved", () => {
    const state = adventure();
    ensureCharacter(state, "p1");
    expect(move(state, "p2", 10, 10)).toEqual({ ok: false, reason: "You have no character here" });
    expect(move(state, null, 10, 10)).toEqual({ ok: false, reason: "You have no character here" });
  });

  it("walks to the ground beside something solid, such as a tree", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const trees = [...state.entities.values()].filter(
      (e): e is NodeEntity =>
        e.type === "node" &&
        e.stage === "grown" &&
        world.island[e.y * world.width + e.x] === world.start.islandId &&
        Math.hypot(e.x - c.x, e.y - c.y) < 14,
    );
    const target = trees.find(
      (t) =>
        landPath(state, { x: Math.floor(c.x), y: Math.floor(c.y) }, [{ x: t.x, y: t.y }]) === null,
    );
    expect(target).toBeDefined();
    expect(move(state, "p1", target!.x, target!.y)).toEqual({ ok: true });
    run(state, 30);
    expect(c.action).toBe("idle");
    expect(isAdjacentTo(Math.floor(c.x), Math.floor(c.y), target!.x, target!.y)).toBe(true);
  });

  it("turns down places nobody can walk to", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    expect(move(state, "p1", -5, 3)).toEqual({ ok: false, reason: "Outside the map" });
    // Open sea, well away from any shore.
    let sea: { x: number; y: number } | null = null;
    for (let y = 2; y < world.height - 2 && !sea; y++)
      for (let x = 2; x < world.width - 2 && !sea; x++) {
        let open = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (isLandTerrain(world.terrain[(y + dy) * world.width + x + dx]!)) open = false;
        if (open) sea = { x, y };
      }
    expect(move(state, "p1", sea!.x, sea!.y)).toEqual({ ok: false, reason: "Can't walk there" });
    // Dry land on another island: there is no way over the water on foot.
    const other = world.islands.find((i) => i.id !== world.start.islandId)!;
    let far: { x: number; y: number } | null = null;
    for (let y = 0; y < world.height && !far; y++)
      for (let x = 0; x < world.width && !far; x++)
        if (world.island[y * world.width + x] === other.id && walkable(state, x, y)) far = { x, y };
    expect(move(state, "p1", far!.x, far!.y)).toEqual({
      ok: false,
      reason: "There's no way there on foot",
    });
    expect(c.action).toBe("idle");
  });

  it("can change its mind halfway", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const first = nearbyGoal(state, c, 10, 25);
    expect(move(state, "p1", first.x, first.y).ok).toBe(true);
    run(state, 1);
    const from = { x: Math.floor(c.x), y: Math.floor(c.y) };
    const back = nearbyGoal(state, c, 3, 6);
    expect(move(state, "p1", back.x, back.y).ok).toBe(true);
    expect(c.dest).toEqual(back);
    run(state, 20);
    expect([Math.floor(c.x), Math.floor(c.y)]).toEqual([back.x, back.y]);
    expect(from).not.toEqual(first);
  });

  it("stops where it stands when the way is built over", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const goal = nearbyGoal(state, c, 12, 30);
    expect(move(state, "p1", goal.x, goal.y).ok).toBe(true);
    run(state, 0.5);
    // A building goes up on the route ahead of it.
    const ahead = c.path[1] ?? c.path[0]!;
    addEntity(state, newBuilding(state, "house", ahead.x, ahead.y, true));
    run(state, 3);
    expect(c.action).toBe("idle");
    expect(c.dest).toBeNull();
  });
});

describe("characters in snapshots and patches", () => {
  it("keep the mode and the characters through a save", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    ensureCharacter(state, "p2");
    run(state, 0.3);
    const back = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(state))));
    expect(back.mode).toBe("adventure");
    expect(characters(back)).toHaveLength(2);
    const again = characterOf(back, "p1")!;
    expect([again.x, again.y]).toEqual([c.x, c.y]);
    expect(again.path).toEqual([]);
  });

  it("stand still after a restart if they were on the move", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const goal = nearbyGoal(state, c, 10, 25);
    expect(move(state, "p1", goal.x, goal.y).ok).toBe(true);
    run(state, 0.5);
    expect(c.action).toBe("walk");
    const back = fromSnapshot(world, toSnapshot(state), true);
    const again = characterOf(back, "p1")!;
    expect(again.action).toBe("idle");
    expect(again.dest).toBeNull();
    // ...and can be sent on their way again.
    expect(move(back, "p1", goal.x, goal.y).ok).toBe(true);
  });

  it("load as a colony when the save is from before modes existed", () => {
    const snap = JSON.parse(JSON.stringify(toSnapshot(createInitialState(world))));
    delete snap.mode;
    expect(fromSnapshot(world, snap).mode).toBe("colony");
  });

  it("go over the wire without their route, and a mirror follows them", () => {
    const state = adventure();
    const c = ensureCharacter(state, "p1");
    const mirror = fromSnapshot(world, JSON.parse(JSON.stringify(toSnapshot(state))));
    takePatch(state);
    const goal = nearbyGoal(state, c, 8, 20);
    expect(move(state, "p1", goal.x, goal.y).ok).toBe(true);
    run(state, 1);
    expect(toWire(c)).not.toHaveProperty("path");
    const patch = takePatch(state);
    const sent = patch.entities.find((e) => e.id === c.id) as CharacterEntity;
    expect(sent).toBeDefined();
    expect(sent).not.toHaveProperty("path");
    applyPatch(mirror, JSON.parse(JSON.stringify(patch)));
    const seen = characterOf(mirror, "p1")!;
    expect([seen.x, seen.y]).toEqual([c.x, c.y]);
    expect(seen.dest).toEqual(c.dest);
    expect(seen.path).toEqual([]);
  });

  it("show up in the next patch when a newcomer joins", () => {
    const state = adventure();
    takePatch(state);
    const c = ensureCharacter(state, "p3");
    const patch = takePatch(state);
    expect(patch.entities.map((e) => e.id)).toContain(c.id);
  });
});

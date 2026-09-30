import { describe, expect, it } from "vitest";
import {
  addEntity,
  applyCommand,
  CHARACTER,
  characterOf,
  clearAt,
  createInitialState,
  ensureCharacter,
  fromWire,
  generateWorld,
  isLandTerrain,
  moveSolid,
  removeEntity,
  nodeRadius,
  PLAYER_RADIUS,
  tick,
  tileIndex,
  toWire,
  type CharacterEntity,
  type GameState,
  type NodeEntity,
  type NodeKind,
} from "../src";

const world = generateWorld("movement-tests");

function run(state: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(state);
}

const steer = (state: GameState, x: number, y: number) =>
  applyCommand(state, { kind: "steer-character", x, y }, "p1");

/** A state with a character and an open, flat patch of land (radius 3) around a centre tile. */
function field(): { state: GameState; c: CharacterEntity; cx: number; cy: number } {
  const state = createInitialState(world);
  const c = ensureCharacter(state, "p1");
  for (let cy = 8; cy < world.height - 8; cy++)
    for (let cx = 8; cx < world.width - 8; cx++) {
      let ok = true;
      const e0 = world.elevation[tileIndex(world, cx, cy)]!;
      for (let dy = -3; dy <= 3 && ok; dy++)
        for (let dx = -3; dx <= 3 && ok; dx++) {
          const k = tileIndex(world, cx + dx, cy + dy);
          if (
            Math.abs(world.elevation[k]! - e0) > 1 ||
            (state.occupancy[k] !== 0 &&
              state.entities.get(state.occupancy[k]!)?.type !== "node") ||
            !isLandTerrain(world.terrain[k]!)
          )
            ok = false;
        }
      if (ok) {
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const id = state.occupancy[tileIndex(world, cx + dx, cy + dy)]!;
            if (id !== 0) removeEntity(state, id);
          }
        c.x = cx + 0.5;
        c.y = cy + 0.5;
        return { state, c, cx, cy };
      }
    }
  throw new Error("no open field");
}

function plant(state: GameState, kind: NodeKind, x: number, y: number): void {
  addEntity(state, {
    id: state.nextId++,
    type: "node",
    kind,
    x,
    y,
    variant: 0,
    amount: 5,
    stage: "grown",
    timer: 0,
    marked: false,
    claimedBy: null,
  } satisfies NodeEntity);
}

describe("collision shapes", () => {
  it("makes trunks and rocks small and small plants walk-through", () => {
    expect(nodeRadius("oak")).toBeLessThan(nodeRadius("boulder"));
    expect(nodeRadius("berry")).toBe(0);
    expect(nodeRadius("fruit")).toBeGreaterThan(0);
  });

  it("walks past the side of a trunk but not through its centre", () => {
    const { state, cx, cy } = field();
    plant(state, "oak", cx, cy);
    // Brushing the trunk: stands just outside trunk + body.
    const side = moveSolid(state, cx - 1 + 0.5, cy + 0.5 + 0.4, 2, 0);
    expect(side.x).toBeCloseTo(cx + 1.5, 5);
    const head = moveSolid(state, cx - 1 + 0.5, cy + 0.5, 2, 0);
    expect(head.x).toBeLessThan(cx + 0.5 - nodeRadius("oak") - PLAYER_RADIUS + 0.01);
  });

  it("slides round a boulder instead of sticking", () => {
    const { state, cx, cy } = field();
    plant(state, "boulder", cx, cy);
    let p = { x: cx - 1 + 0.5, y: cy + 0.5 + 0.05 };
    for (let i = 0; i < 20; i++) p = moveSolid(state, p.x, p.y, 0.3, 0);
    expect(p.x).toBeGreaterThan(cx + 1);
  });

  it("does not block on bushes", () => {
    const { state, cx, cy } = field();
    plant(state, "berry", cx, cy);
    const p = moveSolid(state, cx - 1 + 0.5, cy + 0.5, 2, 0);
    expect(p.x).toBeCloseTo(cx + 1.5, 5);
  });

  it("does not cross water or leave the map", () => {
    const state = createInitialState(world);
    const c = ensureCharacter(state, "p1");
    const p = moveSolid(state, c.x, c.y, 500, 0);
    expect(p.x).toBeLessThan(world.width);
    expect(clearAt(state, p.x, p.y)).toBe(true);
  });
});

describe("steering", () => {
  it("covers about speed x time and is stopped by a zero vector", () => {
    const { state, c, cx } = field();
    const x0 = c.x;
    expect(steer(state, 1, 0)).toEqual({ ok: true });
    run(state, 0.5);
    expect(c.action).toBe("walk");
    expect(c.x - x0).toBeGreaterThan(CHARACTER.speed * 0.5 * 0.9);
    expect(c.x - x0).toBeLessThan(CHARACTER.speed * 0.5 * 1.3);
    expect(c.x).toBeGreaterThan(cx);
    steer(state, 0, 0);
    const at = c.x;
    run(state, 0.5);
    expect(c.x).toBe(at);
    expect(c.action).toBe("idle");
  });

  it("lapses when it is not renewed", () => {
    const { state, c } = field();
    steer(state, 0, 1);
    run(state, 0.5);
    run(state, 3);
    expect(c.steer).toBeNull();
    const y = c.y;
    run(state, 1);
    expect(c.y).toBe(y);
  });

  it("is cancelled by a click-walk", () => {
    const { state, c, cx, cy } = field();
    steer(state, 1, 0);
    run(state, 0.2);
    applyCommand(state, { kind: "move-character", x: cx - 2, y: cy }, "p1");
    expect(c.steer).toBeNull();
  });

  it("stops against a trunk head-on and slides when hitting it at an angle", () => {
    const { state, c, cx, cy } = field();
    plant(state, "oak", cx + 2, cy);
    c.x = cx + 0.5;
    c.y = cy + 0.5;
    steer(state, 1, 0);
    run(state, 1);
    expect(c.x).toBeLessThan(cx + 2.5 - nodeRadius("oak") - PLAYER_RADIUS + 0.01);
    expect(c.action).toBe("idle");
    c.x = cx + 0.5;
    c.y = cy + 0.5;
    steer(state, 1, 0.4);
    run(state, 1.5);
    expect(c.x).toBeGreaterThan(cx + 3);
  });

  it("does not send steering over the wire", () => {
    const { state, c } = field();
    steer(state, 1, 0);
    const wire = toWire(characterOf(state, "p1")!) as unknown as Record<string, unknown>;
    expect("steer" in wire).toBe(false);
    expect(fromWire(wire as never)).toMatchObject({ type: "character", steer: null });
    expect(c.steer).not.toBeNull();
  });

  it("pushes a character out of a tree that grows on them", () => {
    const { state, c, cx, cy } = field();
    c.x = cx + 0.5;
    c.y = cy + 0.5;
    plant(state, "boulder", cx, cy);
    steer(state, 0, 1);
    run(state, 0.3);
    expect(Math.hypot(c.x - (cx + 0.5), c.y - (cy + 0.5))).toBeGreaterThan(nodeRadius("boulder"));
  });
});

import { describe, expect, it } from "vitest";
import {
  addEntity,
  applyCommand,
  berthOf,
  captainOf,
  createInitialState,
  ensureCharacter,
  fromSnapshot,
  generateWorld,
  newShip,
  sailable,
  shipReveal,
  tick,
  toSnapshot,
  toWire,
  damageShip,
  type BuildingEntity,
  type CharacterEntity,
  type GameState,
  type ShipEntity,
} from "../src";

const world = generateWorld("sailing-tests");

function run(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / 0.1); i++) tick(s);
}

/** A world with a scout moored at the home berth and three players on the shore beside it. */
function harbourScene(): {
  s: GameState;
  ship: ShipEntity;
  a: CharacterEntity;
  b: CharacterEntity;
  c: CharacterEntity;
} {
  const s = createInitialState(world);
  s.nextRaid = s.nextStorm = 1e9;
  const h = [...s.entities.values()].find(
    (e): e is BuildingEntity => e.type === "building" && e.kind === "harbour",
  )!;
  const at = berthOf(s, h);
  const ship = addEntity(s, newShip(s, "scout", at.x, at.y, 0));
  const a = ensureCharacter(s, "p1");
  const b = ensureCharacter(s, "p2");
  const c = ensureCharacter(s, "p3");
  for (const p of [a, b, c]) {
    p.x = ship.x - 2.2;
    p.y = ship.y;
  }
  return { s, ship, a, b, c };
}

const cmd = (s: GameState, who: string, c: Parameters<typeof applyCommand>[1]) =>
  applyCommand(s, c, who);

describe("boarding", () => {
  it("makes the first to board the captain and the rest passengers", () => {
    const { s, ship, a, b, c } = harbourScene();
    expect(cmd(s, "p1", { kind: "board-ship", shipId: ship.id })).toEqual({ ok: true });
    expect(cmd(s, "p2", { kind: "board-ship", shipId: ship.id })).toEqual({ ok: true });
    expect(cmd(s, "p3", { kind: "board-ship", shipId: ship.id })).toEqual({ ok: true });
    expect(ship.riders).toEqual([a.id, b.id, c.id]);
    expect(captainOf(s, ship)).toBe(a);
    expect([a.aboard, b.aboard, c.aboard]).toEqual([ship.id, ship.id, ship.id]);
    // They stand on the deck, at different spots.
    expect(new Set([a, b, c].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(3);
    expect(cmd(s, "p1", { kind: "board-ship", shipId: ship.id }).ok).toBe(false);
  });

  it("hands the wheel to the next rider when the captain leaves", () => {
    const { s, ship, a, b } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    cmd(s, "p2", { kind: "board-ship", shipId: ship.id });
    expect(cmd(s, "p2", { kind: "steer-ship", x: 1, y: 0 }).ok).toBe(false);
    expect(cmd(s, "p1", { kind: "leave-ship" })).toEqual({ ok: true });
    expect(a.aboard).toBeNull();
    expect(captainOf(s, ship)).toBe(b);
    expect(cmd(s, "p2", { kind: "steer-ship", x: 1, y: 0 })).toEqual({ ok: true });
  });

  it("walks up to a ship that is a little way off, then climbs aboard", () => {
    const { s, ship, a } = harbourScene();
    a.x = ship.x - 6;
    a.y = ship.y;
    const res = cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    if (res.ok) {
      run(s, 12);
      expect(a.aboard === ship.id || a.board === ship.id).toBe(true);
    } else expect(res.reason.length).toBeGreaterThan(0);
  });

  it("refuses to step off in open water and limits the crew", () => {
    const { s, ship } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    ship.x += 14;
    ship.y += 14;
    const res = cmd(s, "p1", { kind: "leave-ship" });
    expect(res.ok).toBe(false);
  });
});

describe("sailing", () => {
  it("sees much further with a crew aboard", () => {
    const { s, ship } = harbourScene();
    const idle = shipReveal(s, ship);
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    expect(idle).toBe(8);
    expect(shipReveal(s, ship)).toBe(16);
    expect(shipReveal(s)).toBe(8);
    // Boarding reveals the sea around the ship at once.
    const edge = Math.floor(ship.x) + 15;
    const k = Math.floor(ship.y) * world.width + edge;
    if (sailable(s, edge, Math.floor(ship.y))) expect(s.explored[k]).toBe(1);
  });

  it("steers, turns smoothly and slides along the shore", () => {
    const { s, ship, a } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    const start = { x: ship.x, y: ship.y };
    expect(cmd(s, "p1", { kind: "steer-ship", x: 1, y: 1 })).toEqual({ ok: true });
    run(s, 0.3);
    // It does not snap round: it turns towards the wanted heading.
    expect(Math.abs(ship.angle)).toBeLessThan(Math.PI / 4 + 1e-6);
    run(s, 3);
    expect(ship.angle).toBeCloseTo(Math.PI / 4, 1);
    expect(Math.hypot(ship.x - start.x, ship.y - start.y)).toBeGreaterThan(2);
    expect(sailable(s, Math.floor(ship.x), Math.floor(ship.y))).toBe(true);
    // The captain and the ship keep together.
    expect(Math.hypot(a.x - ship.x, a.y - ship.y)).toBeLessThan(1.5);
    // Steering lapses when it is not renewed.
    run(s, 2);
    const at = { x: ship.x, y: ship.y };
    run(s, 1);
    expect(ship.x).toBe(at.x);
    expect(ship.steer).toBeNull();
  });

  it("never sails onto land or through the pier", () => {
    const { s, ship } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    for (const dir of [
      [-1, 0],
      [0, -1],
      [-1, -1],
      [1, -1],
    ] as const) {
      for (let i = 0; i < 12; i++) {
        cmd(s, "p1", { kind: "steer-ship", x: dir[0], y: dir[1] });
        run(s, 1);
        const r = 0.5;
        for (const [dx, dy] of [
          [-r, 0],
          [r, 0],
          [0, -r],
          [0, r],
        ] as const)
          expect(sailable(s, Math.floor(ship.x + dx * 0.9), Math.floor(ship.y + dy * 0.9))).toBe(
            true,
          );
      }
    }
  });

  it("drops the riders at the town hall if the ship sinks", () => {
    const { s, ship, a } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    damageShip(s, ship, 9999);
    expect(s.entities.has(ship.id)).toBe(false);
    expect(a.aboard).toBeNull();
    const hall = world.start.townHall;
    expect(Math.abs(a.x - (hall.x + hall.w / 2))).toBeLessThan(3);
  });

  it("does not send steering over the wire, and saves the riders", () => {
    const { s, ship } = harbourScene();
    cmd(s, "p1", { kind: "board-ship", shipId: ship.id });
    cmd(s, "p1", { kind: "steer-ship", x: 1, y: 0 });
    const wire = toWire(ship) as unknown as Record<string, unknown>;
    expect("steer" in wire).toBe(false);
    expect(wire.riders).toEqual(ship.riders);
    const back = fromSnapshot(world, toSnapshot(s));
    const copy = back.entities.get(ship.id) as ShipEntity;
    expect(copy.riders).toEqual(ship.riders);
    expect(copy.steer).toBeNull();
  });
});

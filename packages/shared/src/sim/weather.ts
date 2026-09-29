// Storms: dark fronts that roll across the sea, hurt ships caught in them and blow out again.
// Everything here is a pure function of the state, so server and clients agree.
import { hash2d } from "../rng";
import { DIFFICULTY_DEFS } from "./difficulty";
import { WEATHER } from "./catalogue";
import { dockSpawn } from "./ferry";
import { damageShip } from "./pirates";
import {
  addEntity,
  hasUpgrade,
  markDirty,
  presenceAt,
  ringPoint,
  removeEntity,
  tally,
  type GameState,
  type PirateEntity,
  type ShipEntity,
  type StormEntity,
} from "./state";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** How hard a storm blows: builds up over its first seconds and dies away over its last. */
export function stormStrength(s: StormEntity): number {
  return Math.max(0, Math.min(1, s.age / WEATHER.ramp, (s.life - s.age) / WEATHER.ramp));
}

export function storms(state: GameState): StormEntity[] {
  const out: StormEntity[] = [];
  for (const e of state.entities.values()) if (e.type === "storm") out.push(e);
  return out;
}

/** The storm over a point, if any. */
export function stormAt(state: GameState, x: number, y: number): StormEntity | null {
  for (const s of storms(state))
    if (stormStrength(s) > 0 && dist(s, { x, y }) <= s.radius) return s;
  return null;
}

/** Would a straight run from one point to another pass through (or close to) a storm? */
export function stormOnRoute(
  state: GameState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  margin = 4,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  for (const s of storms(state)) {
    if (stormStrength(s) <= 0) continue;
    const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy) / len2));
    if (dist(s, { x: a.x + dx * t, y: a.y + dy * t }) <= s.radius + margin) return true;
  }
  return false;
}

/** Is a ship tied up at a finished dock, out of the weather? */
export function inHarbour(state: GameState, ship: { x: number; y: number }): boolean {
  for (const e of state.entities.values()) {
    if (e.type !== "building" || e.kind !== "dock" || !e.complete) continue;
    if (dist(ship, dockSpawn(e)) <= WEATHER.harbour) return true;
  }
  return false;
}

export function updateWeather(state: GameState, dt: number): void {
  spawnStorm(state);
  const rules = DIFFICULTY_DEFS[state.difficulty];
  for (const s of storms(state)) {
    s.age += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    markDirty(state, s.id);
    if (s.age >= s.life) {
      removeEntity(state, s.id);
      continue;
    }
    const hurt = WEATHER.damage * rules.stormDamage * stormStrength(s) * dt;
    if (hurt <= 0) continue;
    for (const e of [...state.entities.values()]) {
      if (e.type === "ship") {
        if (dist(e, s) > s.radius || hasUpgrade(state, "calm_waters") || inHarbour(state, e))
          continue;
        damageShip(state, e as ShipEntity, hurt);
      } else if (e.type === "pirate") {
        if (dist(e, s) > s.radius) continue;
        (e as PirateEntity).hp -= hurt;
        markDirty(state, e.id);
      }
    }
  }
}

function spawnStorm(state: GameState): void {
  if (state.time < state.nextStorm) return;
  const w = state.world;
  const rules = DIFFICULTY_DEFS[state.difficulty];
  const [lo, hi] = WEATHER.interval;
  const r = (salt: number) => hash2d(state.tick, salt, 0x57a);
  state.nextStorm = state.time + (lo + r(1) * (hi - lo)) * rules.stormSpacing;
  // Form out at sea, some way from somewhere the team is, and blow across it.
  const target = presenceAt(state, r(2));
  const from = ringPoint(w, target, WEATHER.spawnRing[0], WEATHER.spawnRing[1], r(3), r(8));
  const aim = {
    x: target.x + (r(4) - 0.5) * 40,
    y: target.y + (r(5) - 0.5) * 40,
  };
  const d = dist(from, aim) || 1;
  const storm: StormEntity = {
    id: state.nextId++,
    type: "storm",
    x: from.x,
    y: from.y,
    vx: ((aim.x - from.x) / d) * WEATHER.speed,
    vy: ((aim.y - from.y) / d) * WEATHER.speed,
    radius: WEATHER.radius[0] + r(6) * (WEATHER.radius[1] - WEATHER.radius[0]),
    age: 0,
    life: WEATHER.life[0] + r(7) * (WEATHER.life[1] - WEATHER.life[0]),
  };
  addEntity(state, storm);
  tally(state, "storms");
  state.events.push({ type: "storm", x: storm.x, y: storm.y });
}

// Who can see what at sea. By day a settlement's lookouts and ships watch a wide stretch of water;
// after dark they only see what their own lamps light. A lighthouse's beam reaches far in both.
import { NIGHT, seesInTheDark, WATCH } from "./catalogue";
import { nightLevel } from "./daylight";
import type { GameState } from "./state";

interface Watcher {
  x: number;
  y: number;
  r: number;
  lighthouse: boolean;
}

const cache = new WeakMap<GameState, { key: string; watchers: Watcher[] }>();

/** Everything that keeps watch right now, with how far it sees. Rebuilt when the world changes. */
function watchers(state: GameState): Watcher[] {
  // The Glowkin keep their daytime sight after dark.
  const dark = nightLevel(state.time) >= NIGHT.dark && !seesInTheDark(state.world.tribe);
  const key = `${state.tick}:${state.entities.size}:${dark}`;
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit.watchers;
  const list: Watcher[] = [];
  for (const e of state.entities.values()) {
    if (e.type === "building" && e.complete) {
      const lighthouse = e.kind === "lighthouse";
      list.push({
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        r: lighthouse ? WATCH.lighthouse : dark ? WATCH.litBuilding : WATCH.building,
        lighthouse,
      });
    } else if (e.type === "ship") {
      list.push({ x: e.x, y: e.y, r: dark ? WATCH.litShip : WATCH.ship, lighthouse: false });
    }
  }
  cache.set(state, { key, watchers: list });
  return list;
}

/** Is this spot within sight of the team's buildings, ships or lighthouses? */
export function watched(state: GameState, x: number, y: number): boolean {
  for (const w of watchers(state)) if (Math.hypot(w.x - x, w.y - y) <= w.r) return true;
  return false;
}

/**
 * How much of its usual sight a villager or ship has at a spot: all of it by day, and less after
 * dark unless a lighthouse's beam reaches the spot.
 */
export function sightFactor(state: GameState, x: number, y: number): number {
  const night = nightLevel(state.time);
  if (night <= 0 || seesInTheDark(state.world.tribe)) return 1;
  for (const w of watchers(state)) {
    if (w.lighthouse && Math.hypot(w.x - x, w.y - y) <= w.r) return 1;
  }
  return 1 - NIGHT.sightLoss * night;
}

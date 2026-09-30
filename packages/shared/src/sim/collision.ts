// Where a person can stand. Characters move freely (not tile to tile), so what blocks them is
// what you can see blocking: a tree only at its trunk, a boulder at its base, while water, cliffs
// and buildings block whole tiles. Tile-based walking (villagers, click-to-walk routes) keeps using
// `walkable()`, where a tree or rock still makes its whole tile unwalkable.
import { inBounds, isLandTerrain, tileIndex } from "../world/grid";
import type { NodeKind } from "../world/types";
import { BUILDINGS, NODES } from "./catalogue";
import type { GameState } from "./state";

/** A person is a circle this big (in tiles) for collisions. */
export const PLAYER_RADIUS = 0.2;

const TRUNK = 0.16;
const ROCK = 0.34;
const CLUSTER = 0.28;
const CLUSTERS: ReadonlySet<NodeKind> = new Set(["crystal", "rimeglass", "glowcap", "mirepearl"]);

/**
 * How far from the middle of its tile a plant or rock blocks: trees only at the trunk, boulders,
 * ore and crystals at their base, and small plants (berry bushes, flowers, mushrooms, pumpkins)
 * not at all.
 */
export function nodeRadius(kind: NodeKind): number {
  const def = NODES[kind];
  if (def.tool === "axe" || kind === "fruit") return TRUNK;
  if (def.tool === "pick") return CLUSTERS.has(kind) ? CLUSTER : ROCK;
  return 0;
}

/** A tile nobody can walk on, whatever stands on it: water, buildings, cliffs, the map's edge. */
function tileSolid(state: GameState, tx: number, ty: number, elevation: number): boolean {
  const w = state.world;
  if (!inBounds(w, tx, ty)) return true;
  const k = tileIndex(w, tx, ty);
  const id = state.occupancy[k]!;
  const e = id === 0 ? undefined : state.entities.get(id);
  if (e?.type === "building") {
    if (!(BUILDINGS[e.kind].walkable && e.complete)) return true;
  } else if (!isLandTerrain(w.terrain[k]!)) return true;
  // One step up or down is fine; more is a cliff.
  return Math.abs(w.elevation[k]! - elevation) > 1;
}

/** The radius of the tree or rock in a tile that is in the way, or 0. */
function blockerRadius(state: GameState, tx: number, ty: number): number {
  const w = state.world;
  if (!inBounds(w, tx, ty)) return 0;
  const id = state.occupancy[tileIndex(w, tx, ty)]!;
  if (id === 0) return 0;
  const e = state.entities.get(id);
  if (e?.type !== "node" || e.stage === "stump" || e.stage === "sapling") return 0;
  return nodeRadius(e.kind);
}

/**
 * Push a person out of everything they overlap: boxes for solid tiles, circles for trunks and
 * rocks. `elevation` is that of the ground they stand on.
 */
export function resolveCollisions(
  state: GameState,
  x: number,
  y: number,
  elevation: number,
): { x: number; y: number } {
  const r = PLAYER_RADIUS;
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (tileSolid(state, tx, ty, elevation)) {
          const cx = Math.min(Math.max(x, tx), tx + 1);
          const cy = Math.min(Math.max(y, ty), ty + 1);
          const dx = x - cx;
          const dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          pushed = true;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            x += (dx / d) * (r - d);
            y += (dy / d) * (r - d);
          } else {
            // The middle is inside the tile: leave by the nearest side.
            const left = x - tx;
            const right = tx + 1 - x;
            const up = y - ty;
            const down = ty + 1 - y;
            const m = Math.min(left, right, up, down);
            if (m === left) x = tx - r;
            else if (m === right) x = tx + 1 + r;
            else if (m === up) y = ty - r;
            else y = ty + 1 + r;
          }
        } else {
          const rn = blockerRadius(state, tx, ty);
          if (rn <= 0) continue;
          const dx = x - (tx + 0.5);
          const dy = y - (ty + 0.5);
          const d = Math.hypot(dx, dy);
          if (d >= r + rn) continue;
          pushed = true;
          if (d > 1e-9) {
            x += (dx / d) * (r + rn - d);
            y += (dy / d) * (r + rn - d);
          } else x += r + rn;
        }
      }
    }
    if (!pushed) break;
  }
  return { x, y };
}

const elevationOf = (state: GameState, x: number, y: number): number => {
  const w = state.world;
  const tx = Math.min(w.width - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(w.height - 1, Math.max(0, Math.floor(y)));
  return w.elevation[tileIndex(w, tx, ty)]!;
};

/**
 * Move a person by (dx, dy), sliding along whatever is in the way. The move is cut into small
 * steps, so a fast mover cannot slip through a trunk or a wall.
 */
export function moveSolid(
  state: GameState,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.25));
  for (let i = 0; i < steps; i++) {
    const elevation = elevationOf(state, x, y);
    ({ x, y } = resolveCollisions(state, x + dx / steps, y + dy / steps, elevation));
  }
  return { x, y };
}

/** Whether a person of this size could stand at (x, y) without touching anything. */
export function clearAt(state: GameState, x: number, y: number): boolean {
  const there = resolveCollisions(state, x, y, elevationOf(state, x, y));
  return Math.abs(there.x - x) < 1e-9 && Math.abs(there.y - y) < 1e-9;
}

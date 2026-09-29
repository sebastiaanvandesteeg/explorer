// Walking, shared by villagers and player characters.
import { VILLAGER } from "./catalogue";
import { isPathTile, lookAround, markDirty, walkable, type GameState, type Walker } from "./state";

export const tileOf = (w: { x: number; y: number }): { x: number; y: number } => ({
  x: Math.floor(w.x),
  y: Math.floor(w.y),
});

export function setFacing(w: Walker, dx: number, dy: number): void {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
  if (Math.abs(dx) >= Math.abs(dy)) w.facing = dx > 0 ? 0 : 2;
  else w.facing = dy > 0 ? 1 : 3;
}

export function faceTowards(w: Walker, x: number, y: number): void {
  setFacing(w, x - w.x, y - w.y);
}

/**
 * Advance along the path at `speed` tiles a second (faster on paths), looking around from every
 * tile reached. Returns true on arrival; goes idle and returns false if the way is blocked.
 */
export function stepAlong(
  state: GameState,
  w: Walker,
  dt: number,
  speed: number = VILLAGER.speed,
  reveal: number = VILLAGER.reveal,
): boolean {
  const here = tileOf(w);
  let budget = speed * dt * (isPathTile(state, here.x, here.y) ? VILLAGER.pathSpeedBonus : 1);
  while (budget > 1e-6 && w.path.length > 0) {
    const next = w.path[0]!;
    if (!walkable(state, next.x, next.y)) {
      w.path = [];
      w.action = "idle";
      markDirty(state, w.id);
      return false;
    }
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dx = tx - w.x;
    const dy = ty - w.y;
    const dist = Math.hypot(dx, dy);
    setFacing(w, dx, dy);
    if (dist <= budget) {
      w.x = tx;
      w.y = ty;
      budget -= dist;
      w.path.shift();
      lookAround(state, w.x, w.y, reveal);
    } else {
      w.x += (dx / dist) * budget;
      w.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  markDirty(state, w.id);
  return w.path.length === 0;
}

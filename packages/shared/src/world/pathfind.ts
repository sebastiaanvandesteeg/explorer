// Grid A* with 8-way movement and no corner cutting.
import { NEIGHBOURS_8 } from "./grid";

export interface PathQuery {
  width: number;
  height: number;
  /** Can a walker move directly from (ax, ay) to the adjacent tile (bx, by)? */
  canMove(ax: number, ay: number, bx: number, by: number): boolean;
  /** Cost multiplier for entering a tile (1 = normal). */
  cost?(x: number, y: number): number;
  /** Search budget in expanded nodes. */
  maxNodes?: number;
}

export interface Tile {
  x: number;
  y: number;
}

class MinHeap {
  private readonly items: number[] = [];
  private readonly prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= p) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0]!;
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Shortest path from `start` to any tile in `goals` (excluding `start` itself unless it is a
 * goal). Returns the tiles after `start`, ending on a goal; [] when already there; null when
 * unreachable.
 */
export function findPath(q: PathQuery, start: Tile, goals: readonly Tile[]): Tile[] | null {
  if (goals.length === 0) return null;
  const W = q.width;
  const goalSet = new Set(goals.map((g) => g.y * W + g.x));
  const startKey = start.y * W + start.x;
  if (goalSet.has(startKey)) return [];
  const h = (x: number, y: number) => {
    let best = Infinity;
    for (const g of goals) {
      const dx = Math.abs(g.x - x);
      const dy = Math.abs(g.y - y);
      const d = Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
      if (d < best) best = d;
    }
    // Paths make walking cheaper, so scale the heuristic to stay admissible. Without tile costs
    // every step costs at least one, and the exact distance is the sharpest honest guess: long
    // sea crossings depend on it.
    return q.cost ? best * 0.6 : best;
  };
  const gScore = new Map<number, number>([[startKey, 0]]);
  const came = new Map<number, number>();
  const open = new MinHeap();
  open.push(startKey, h(start.x, start.y));
  const closed = new Set<number>();
  const budget = q.maxNodes ?? 40_000;
  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    if (goalSet.has(cur)) {
      const path: Tile[] = [];
      let k = cur;
      while (k !== startKey) {
        path.push({ x: k % W, y: Math.floor(k / W) });
        k = came.get(k)!;
      }
      return path.reverse();
    }
    closed.add(cur);
    if (closed.size > budget) return null;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    const g0 = gScore.get(cur)!;
    for (const [dx, dy] of NEIGHBOURS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= q.height) continue;
      const nk = ny * W + nx;
      if (closed.has(nk)) continue;
      if (!q.canMove(cx, cy, nx, ny)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!q.canMove(cx, cy, cx + dx, cy) || !q.canMove(cx, cy, cx, cy + dy)))
        continue;
      const step = (diagonal ? SQRT2 : 1) * (q.cost?.(nx, ny) ?? 1);
      const g = g0 + step;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        came.set(nk, cur);
        open.push(nk, g + h(nx, ny));
      }
    }
  }
  return null;
}

/** Breadth-first flood over 4-neighbours; returns tile keys (y * width + x) reached. */
export function flood(
  width: number,
  height: number,
  start: Tile,
  canMove: (ax: number, ay: number, bx: number, by: number) => boolean,
): Set<number> {
  const seen = new Set<number>([start.y * width + start.x]);
  const queue: Tile[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = ny * width + nx;
      if (seen.has(k) || !canMove(x, y, nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

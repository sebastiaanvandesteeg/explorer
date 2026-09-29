import { describe, expect, it } from "vitest";
import { findPath } from "../src";

const grid = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  canMove: (_ax: number, _ay: number, bx: number, by: number) => rows[by]![bx] !== "#",
});

describe("findPath", () => {
  it("finds a route around walls without cutting corners", () => {
    const q = grid(["....", ".##.", "....", "...."]);
    const path = findPath(q, { x: 0, y: 1 }, [{ x: 3, y: 1 }])!;
    expect(path.at(-1)).toEqual({ x: 3, y: 1 });
    for (const t of path) expect(q.canMove(0, 0, t.x, t.y)).toBe(true);
    // Never steps diagonally past a wall corner.
    let prev = { x: 0, y: 1 };
    for (const t of path) {
      if (t.x !== prev.x && t.y !== prev.y) {
        expect(q.canMove(0, 0, t.x, prev.y) && q.canMove(0, 0, prev.x, t.y)).toBe(true);
      }
      prev = t;
    }
  });

  it("returns null when the goal is walled off", () => {
    const q = grid(["..#.", "..#.", "..#.", "..#."]);
    expect(findPath(q, { x: 0, y: 0 }, [{ x: 3, y: 3 }])).toBeNull();
  });

  it("returns an empty path when already at a goal", () => {
    const q = grid(["..", ".."]);
    expect(findPath(q, { x: 1, y: 1 }, [{ x: 1, y: 1 }])).toEqual([]);
  });

  it("stops at the nearest of several goals", () => {
    const q = grid(["......"]);
    const path = findPath(q, { x: 2, y: 0 }, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ])!;
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

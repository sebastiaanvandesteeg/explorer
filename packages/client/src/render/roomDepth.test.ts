import { describe, expect, it } from "vitest";
import { depthOrder, personBox, type DepthBox } from "./roomDepth";

const box = (x0: number, y0: number, w: number, h: number): DepthBox => ({
  x0,
  y0,
  x1: x0 + w,
  y1: y0 + h,
});

/** The position of each box in the drawing order: later is nearer the camera. */
const rank = (boxes: DepthBox[]) => {
  const order = depthOrder(boxes);
  return boxes.map((_, i) => order.indexOf(i));
};

describe("depthOrder", () => {
  const counter = box(3, 1, 4, 1);

  it("draws a person standing behind a long counter before it, wherever along it", () => {
    for (const x of [3.5, 4.5, 5.5, 6.5]) {
      const [person, table] = rank([personBox(x, 0.5), counter]);
      expect(person, `x=${x}`).toBeLessThan(table!);
    }
  });

  it("draws a person in front of the counter after it, even beside one end", () => {
    for (const x of [3.5, 6.5, 8.5]) {
      const [person, table] = rank([personBox(x, 2.5), counter]);
      expect(person, `x=${x}`).toBeGreaterThan(table!);
    }
  });

  it("does not care about things that can never overlap on screen", () => {
    // Left and in front of the counter: they are separated diagonally.
    const order = depthOrder([personBox(0.5, 2.5), counter]);
    expect([...order].sort()).toEqual([0, 1]);
  });

  it("puts a person to the right of a bed in front of it, and to the left behind it", () => {
    const bed = box(0, 0, 2, 2);
    expect(rank([personBox(2.6, 1), bed])[0]).toBeGreaterThan(rank([personBox(2.6, 1), bed])[1]!);
    const order = rank([personBox(1, 2.6), bed]);
    expect(order[0]).toBeGreaterThan(order[1]!);
  });

  it("orders a row of pews and the people between them consistently", () => {
    const pews = [box(1, 4, 3, 1), box(5, 4, 3, 1), box(1, 6, 3, 1), box(5, 6, 3, 1)];
    const people = [personBox(4.5, 5.5), personBox(0.5, 5.5), personBox(2.5, 7.5)];
    const all = [...pews, ...people];
    const order = depthOrder(all);
    expect([...order].sort()).toEqual(all.map((_, i) => i));
    const at = (i: number) => order.indexOf(i);
    // The people between the rows are in front of the first row and behind the second.
    expect(at(4)).toBeGreaterThan(at(0));
    expect(at(4)).toBeLessThan(at(2));
    expect(at(6)).toBeGreaterThan(at(2));
  });

  it("respects every pair where one thing is clearly behind the other", () => {
    // A scatter of non-overlapping footprints.
    const boxes: DepthBox[] = [];
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let tries = 0; boxes.length < 14 && tries < 400; tries++) {
      const b = box(Math.floor(next() * 9), Math.floor(next() * 7), 1 + Math.floor(next() * 3), 1);
      if (!boxes.some((o) => o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1))
        boxes.push(b);
    }
    const order = depthOrder(boxes);
    const at = (i: number) => order.indexOf(i);
    for (let i = 0; i < boxes.length; i++)
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        const a = boxes[i]!;
        const b = boxes[j]!;
        const aBehind = a.x1 <= b.x0 || a.y1 <= b.y0;
        const bBehind = b.x1 <= a.x0 || b.y1 <= a.y0;
        if (aBehind && !bBehind) expect(at(i), `${i} behind ${j}`).toBeLessThan(at(j));
      }
  });

  it("copes with nothing, and with one thing", () => {
    expect(depthOrder([])).toEqual([]);
    expect(depthOrder([box(0, 0, 1, 1)])).toEqual([0]);
  });
});

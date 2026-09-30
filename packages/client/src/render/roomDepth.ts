// Which of the things in a room is drawn in front of which. Everything in a room stands on a
// rectangle of floor (furniture on its footprint, a person on a small one), and the camera looks
// from the +x, +y corner: a thing is behind another when it lies entirely towards smaller x or
// smaller y. A single number per thing (like the sum of its centre) gets long pieces wrong: a
// person behind one end of a four-tile counter would be drawn over its top.

export interface DepthBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** `a` is hidden by `b`: it lies wholly to the far side of it in x or in y. */
const behind = (a: DepthBox, b: DepthBox): boolean => a.x1 <= b.x0 || a.y1 <= b.y0;

/** A person's footprint: a small square around where they stand. */
export const personBox = (x: number, y: number, r = 0.3): DepthBox => ({
  x0: x - r,
  y0: y - r,
  x1: x + r,
  y1: y + r,
});

/**
 * The indices of `boxes` from back to front. Boxes that do not constrain each other (they are
 * separated diagonally, so they never overlap on screen) keep the order of their far corners; a
 * cycle, which cannot happen with floor rectangles that do not overlap, is broken the same way.
 */
export function depthOrder(boxes: readonly DepthBox[]): number[] {
  const n = boxes.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const waiting = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (behind(boxes[i]!, boxes[j]!) && !behind(boxes[j]!, boxes[i]!)) {
        after[i]!.push(j);
        waiting[j]!++;
      }
    }
  }
  const key = (i: number) => boxes[i]!.x1 + boxes[i]!.y1;
  const placed = new Array<boolean>(n).fill(false);
  const order: number[] = [];
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++)
      if (!placed[i] && waiting[i] === 0 && (pick < 0 || key(i) < key(pick))) pick = i;
    if (pick < 0)
      for (let i = 0; i < n; i++) if (!placed[i] && (pick < 0 || key(i) < key(pick))) pick = i;
    placed[pick] = true;
    order.push(pick);
    for (const j of after[pick]!) waiting[j]!--;
  }
  return order;
}

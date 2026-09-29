// Small, fast, deterministic noise for the painters. Pure functions of their arguments, so two
// chunks painting the same world position always agree.

/** Hash of two integers to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Random lattice values, so value noise is four table reads instead of four hashes. */
const TABLE = new Float32Array(65536);
for (let i = 0; i < TABLE.length; i++) TABLE[i] = hash2(i & 255, i >> 8, 0x2545f491);

/** Smooth value noise in [0, 1). Repeats every 256 lattice units, which no pattern here reveals. */
export function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  let fx = x - x0;
  let fy = y - y0;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  // Each seed reads the table at its own offset.
  const i0 = (x0 + (Math.imul(seed, 0x9e3779b1) >>> 24)) & 255;
  const j0 = (y0 + (Math.imul(seed, 0x85ebca6b) >>> 24)) & 255;
  const i1 = (i0 + 1) & 255;
  const j1 = (j0 + 1) & 255;
  const a = TABLE[i0 | (j0 << 8)]!;
  const b = TABLE[i1 | (j0 << 8)]!;
  const c = TABLE[i0 | (j1 << 8)]!;
  const d = TABLE[i1 | (j1 << 8)]!;
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}

/** Two octaves of value noise, roughly in [0, 1). */
export function fbm2(x: number, y: number, seed: number): number {
  return (
    vnoise(x, y, seed) * 0.65 + vnoise(x * 2.17 + 5.3, y * 2.17 + 1.7, seed ^ 0x9e3779b9) * 0.35
  );
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

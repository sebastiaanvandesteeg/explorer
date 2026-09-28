// Value noise + fbm, ported from city_simulation (packages/core/src/map/noise.ts).
import { hash2d } from "./rng";

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v00 = hash2d(x0, y0, seed);
  const v10 = hash2d(x0 + 1, y0, seed);
  const v01 = hash2d(x0, y0 + 1, seed);
  const v11 = hash2d(x0 + 1, y0 + 1, seed);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/** Three-octave fractal value noise in roughly [0, 1]. */
export function fbm(x: number, y: number, seed: number): number {
  return (
    0.55 * valueNoise(x, y, seed) +
    0.3 * valueNoise(x * 2.13, y * 2.13, seed ^ 0x9e3779b9) +
    0.15 * valueNoise(x * 4.31, y * 4.31, seed ^ 0x85ebca6b)
  );
}

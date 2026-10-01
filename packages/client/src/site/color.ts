// Small colour helpers for deriving page themes from the game's biome palettes.

export type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const v = Number.parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** `t` of the way from colour `a` to colour `b`. */
export function mix(a: Rgb | string, b: Rgb | string, t: number): Rgb {
  const x = typeof a === "string" ? parseHex(a) : a;
  const y = typeof b === "string" ? parseHex(b) : b;
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

export function css(c: Rgb, alpha = 1): string {
  const [r, g, b] = c.map(Math.round);
  return alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

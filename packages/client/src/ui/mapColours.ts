// Ground colours for the minimap and the full map: what each tile looks like once explored, and
// the region-coloured fog it wears before that.
import { BIOMES, Terrain, type WorldMap } from "@explorer/shared";
import { ATMOSPHERE, OCEAN } from "../render/biomeStyle";

/** "#rrggbb" as a little-endian ABGR word, for writing straight into ImageData. */
export function abgr(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
}

export interface MapColours {
  base: Uint32Array;
  fog: Uint32Array;
}

const cache = new WeakMap<WorldMap, MapColours>();

export function mapColours(w: WorldMap): MapColours {
  const hit = cache.get(w);
  if (hit) return hit;
  const n = w.width * w.height;
  const base = new Uint32Array(n);
  const fog = new Uint32Array(n);
  const deep = abgr("#1b5866");
  const shallow = abgr("#349f98");
  const dirt = abgr("#a07650");
  for (let k = 0; k < n; k++) {
    const biome = BIOMES[w.biome[k]!];
    const style = biome ? ATMOSPHERE[biome] : OCEAN;
    fog[k] = abgr(style.fog);
    const t = w.terrain[k]!;
    base[k] =
      t === Terrain.Deep
        ? deep
        : t === Terrain.Shallow
          ? shallow
          : t === Terrain.Dirt
            ? dirt
            : abgr(
                t === Terrain.Sand
                  ? style.map.beach
                  : t === Terrain.Rock
                    ? style.map.rock
                    : style.map.ground,
              );
  }
  const colours = { base, fog };
  cache.set(w, colours);
  return colours;
}

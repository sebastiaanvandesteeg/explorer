// Seeded archipelago generation. Deterministic: the same seed always yields the same world, so
// the server only sends the seed and clients rebuild the terrain themselves.
import { fbm } from "../noise";
import { createRng, hash2d, hashSeed, type Rng } from "../rng";
import { TRIBE_DEFS, type TribeId } from "../tribes";
import {
  BIOME_DEFS,
  BIOMES,
  biomeIndex,
  NO_BIOME,
  SIGNATURE,
  type BiomeDef,
  type BiomeId,
} from "./biomes";
import { canStep, inBounds, isLandTerrain, NEIGHBOURS_4, NEIGHBOURS_8, tileIndex } from "./grid";
import { findPath } from "./pathfind";
import {
  DIR_VECTORS,
  Terrain,
  type DecoSpawn,
  type SiteSpawn,
  type Dir,
  type Island,
  type IslandFlavor,
  type NodeKind,
  type NodeSpawn,
  type StartSite,
  type WorldMap,
} from "./types";

export const WORLD_SIZE = 192;
const HOME_RADIUS = 19;

interface IslandSeed extends Island {
  sx: number;
  sy: number;
  rot: number;
  noiseSeed: number;
}

/** Region biome colours spread this far out to sea (tiles). */
const REGION_REACH = 16;

export function generateWorld(
  seed: string,
  tribe: TribeId = "islanders",
  size = WORLD_SIZE,
): WorldMap {
  for (let attempt = 0; attempt < 24; attempt++) {
    const world = attemptWorld(seed, tribe, attempt, size);
    if (world) return world;
  }
  throw new Error(`could not generate a valid world for seed "${seed}"`);
}

function attemptWorld(
  seed: string,
  tribe: TribeId,
  attempt: number,
  size: number,
): WorldMap | null {
  const genSeed = attempt === 0 ? seed : `${seed}#${attempt}`;
  const base = hashSeed(genSeed);
  const rng = createRng(`${genSeed}:islands`);
  const islands = placeIslands(rng, size, TRIBE_DEFS[tribe].homeBiome);
  const partial = shapeTerrain(islands, base, size);
  const world: WorldMap = {
    seed,
    tribe,
    width: size,
    height: size,
    ...partial,
    islands: islands.map(({ id, cx, cy, radius, biome, flavor, tiles }) => ({
      id,
      cx,
      cy,
      radius,
      biome,
      flavor,
      tiles,
    })),
    start: undefined as unknown as StartSite,
    nodes: [],
    decor: [],
    sites: [],
  };
  const start = findStartSite(world);
  if (!start) return null;
  world.start = start.site;
  const reserved = start.reserved;
  for (const k of start.path) {
    if (world.terrain[k] === Terrain.Grass) world.terrain[k] = Terrain.Dirt;
  }
  world.nodes = placeNodes(world, base, reserved);
  if (!ensureHomeResources(world, base, reserved)) return null;
  placeSignatureNodes(world, base, reserved);
  world.decor = placeDecor(world, base, reserved);
  world.sites = placeSites(world, base);
  return world;
}

/**
 * Make sure every far biome carries the deposits its signature good comes from, on its real
 * islands (not islets). Natural deposits count towards the total; the rest are added on free
 * ground. Uses its own hash stream, so the ordinary nodes of a world are not disturbed.
 */
function placeSignatureNodes(world: WorldMap, base: number, reserved: Set<number>): void {
  const taken = new Set(world.nodes.map((n) => tileIndex(world, n.x, n.y)));
  for (const [biome, sig] of Object.entries(SIGNATURE) as [
    BiomeId,
    { node: NodeKind; deposits: number },
  ][]) {
    const islands = world.islands.filter((i) => i.biome === biome && i.flavor !== "islet");
    if (islands.length === 0) continue;
    const ids = new Set(islands.map((i) => i.id));
    const have = world.nodes.filter(
      (n) => n.kind === sig.node && ids.has(world.island[tileIndex(world, n.x, n.y)]!),
    ).length;
    if (have >= sig.deposits) continue;
    const salt = hashSeed(`signature:${sig.node}`);
    const free: { k: number; r: number }[] = [];
    for (let k = 0; k < world.terrain.length; k++) {
      if (!ids.has(world.island[k]!) || !isLandTerrain(world.terrain[k]!)) continue;
      if (reserved.has(k) || taken.has(k)) continue;
      const x = k % world.width;
      const y = Math.floor(k / world.width);
      free.push({ k, r: hash2d(x, y, base ^ salt) });
    }
    free.sort((a, b) => a.r - b.r);
    for (const { k } of free.slice(0, sig.deposits - have)) {
      taken.add(k);
      world.nodes.push({
        kind: sig.node,
        x: k % world.width,
        y: Math.floor(k / world.width),
        variant: 0,
      });
    }
  }
}

/**
 * Sunken ruins (many) and fortresses (a few, far from home) in deep water, spread out so ships
 * meet them one at a time. Uses its own hash stream, so older worlds keep their islands.
 */
function placeSites(world: WorldMap, base: number): SiteSpawn[] {
  const sites: SiteSpawn[] = [];
  const home = world.start.townHall;
  const wanted = { fortress: 3, ruin: 8 };
  for (const kind of ["fortress", "ruin"] as const) {
    const minHome = kind === "fortress" ? 55 : 22;
    const spacing = kind === "fortress" ? 40 : 20;
    const candidates: { x: number; y: number; r: number }[] = [];
    for (let y = 4; y < world.height - 4; y++) {
      for (let x = 4; x < world.width - 4; x++) {
        const k = tileIndex(world, x, y);
        if (isLandTerrain(world.terrain[k]!) || world.shore[k]! < 4) continue;
        if (Math.hypot(x - home.x, y - home.y) < minHome) continue;
        candidates.push({ x, y, r: hash2d(x, y, base ^ (kind === "fortress" ? 0x5f1 : 0x5f2)) });
      }
    }
    candidates.sort((a, b) => a.r - b.r);
    let placed = 0;
    for (const c of candidates) {
      if (placed >= wanted[kind]) break;
      if (sites.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < spacing)) continue;
      sites.push({ kind, x: c.x, y: c.y, variant: Math.floor(c.r * 1000) % 2 });
      placed++;
    }
  }
  return sites;
}

function placeIslands(rng: Rng, size: number, homeBiome: BiomeId): IslandSeed[] {
  const list: IslandSeed[] = [];
  const add = (cx: number, cy: number, radius: number, flavor: IslandFlavor, stretch: number) => {
    list.push({
      id: list.length,
      cx,
      cy,
      radius,
      biome: homeBiome,
      flavor,
      tiles: 0,
      sx: rng.float(1 - stretch, 1 + stretch),
      sy: rng.float(1 - stretch, 1 + stretch),
      rot: rng.float(0, Math.PI),
      noiseSeed: rng.int(1, 0x7fffffff),
    });
  };
  add(
    size / 2 + rng.float(-4, 4),
    size / 2 + rng.float(-4, 4),
    HOME_RADIUS + rng.float(0, 3),
    "home",
    0.1,
  );
  const flavors: IslandFlavor[] = ["wooded", "fertile", "rocky"];
  const target = rng.int(10, 14);
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < target; tries++) {
    const r = rng.float(7, 15);
    const cx = rng.float(r + 7, size - r - 7);
    const cy = rng.float(r + 7, size - r - 7);
    if (list.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < (o.radius + r) * 1.28 + 6)) continue;
    add(cx, cy, r, flavors[rng.int(0, 2)]!, 0.25);
    placed++;
  }
  assignBiomes(rng, list, homeBiome);
  const islets = rng.int(14, 24);
  let isletCount = 0;
  for (let tries = 0; tries < 900 && isletCount < islets; tries++) {
    const r = rng.float(1.3, 2.8);
    const cx = rng.float(4, size - 4);
    const cy = rng.float(4, size - 4);
    if (list.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < o.radius * 1.28 + r + 4)) continue;
    add(cx, cy, r, "islet", 0.2);
    // Islets belong to the nearest real island's biome.
    const islet = list[list.length - 1]!;
    let nearest = list[0]!;
    for (const o of list) {
      if (o.flavor === "islet") continue;
      if (
        Math.hypot(o.cx - cx, o.cy - cy) - o.radius <
        Math.hypot(nearest.cx - cx, nearest.cy - cy) - nearest.radius
      )
        nearest = o;
    }
    islet.biome = nearest.biome;
    isletCount++;
  }
  return list;
}

/**
 * Spread every biome over the archipelago by distance from home: gentle tier-0 biomes nearby,
 * tier-1 further out and the hostile or magical tier-2 biomes at the edges.
 */
function assignBiomes(rng: Rng, list: IslandSeed[], homeBiome: BiomeId): void {
  const home = list[0]!;
  const others = list
    .slice(1)
    .sort(
      (a, b) =>
        Math.hypot(a.cx - home.cx, a.cy - home.cy) - Math.hypot(b.cx - home.cx, b.cy - home.cy),
    );
  const shuffled = (tier: number) => {
    const ids = BIOMES.filter((b) => BIOME_DEFS[b].tier === tier && b !== homeBiome);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return ids;
  };
  const sequence = [...shuffled(0), ...shuffled(1), ...shuffled(2)];
  others.forEach((is, i) => {
    is.biome =
      sequence[Math.min(sequence.length - 1, Math.floor((i * sequence.length) / others.length))]!;
  });
}

function shapeTerrain(islands: IslandSeed[], base: number, size: number) {
  const n = size * size;
  const heightField = new Float32Array(n).fill(-1);
  const island = new Int16Array(n).fill(-1);
  for (const is of islands) {
    const reach = is.radius * 1.9 + 3;
    const cos = Math.cos(is.rot);
    const sin = Math.sin(is.rot);
    const x0 = Math.max(0, Math.floor(is.cx - reach));
    const x1 = Math.min(size - 1, Math.ceil(is.cx + reach));
    const y0 = Math.max(0, Math.floor(is.cy - reach));
    const y1 = Math.min(size - 1, Math.ceil(is.cy + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - is.cx;
        const dy = y + 0.5 - is.cy;
        const u = (dx * cos + dy * sin) / is.sx;
        const v = (-dx * sin + dy * cos) / is.sy;
        const d = Math.hypot(u, v);
        const wobble = fbm(x * 0.065, y * 0.065, is.noiseSeed);
        const rEff = is.radius * (is.flavor === "islet" ? 0.8 + 0.4 * wobble : 0.6 + 0.8 * wobble);
        let h = 1 - d / rEff;
        h += (fbm(x * 0.23, y * 0.23, is.noiseSeed ^ 0x5bd1e995) - 0.5) * 0.14;
        const k = y * size + x;
        if (h > heightField[k]!) {
          heightField[k] = h;
          island[k] = is.id;
        }
      }
    }
  }

  const land = new Uint8Array(n);
  for (let k = 0; k < n; k++) land[k] = heightField[k]! > 0 ? 1 : 0;
  const landN4 = (x: number, y: number) =>
    NEIGHBOURS_4.reduce((c, [dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return c + (nx >= 0 && ny >= 0 && nx < size && ny < size ? land[ny * size + nx]! : 0);
    }, 0);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const k = y * size + x;
        const c = landN4(x, y);
        if (land[k] && c <= 1) land[k] = 0;
        else if (!land[k] && c >= 3) {
          land[k] = 1;
          heightField[k] = 0.02;
        }
      }
    }
  }

  const flavorOf = (k: number): IslandFlavor => islands[island[k]!]?.flavor ?? "islet";
  const elevation = new Uint8Array(n);
  const cliffSeed = base ^ 0x1234567;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      if (!land[k]) continue;
      const h = heightField[k]!;
      const flavor = flavorOf(k);
      // Islands are one broad plateau, like the concept art: a narrow bank steps down to the
      // beaches, cliffy stretches drop straight into the sea, and outer islands get hills.
      let e: number;
      // Islets are rock stacks: a beach, a ledge and a tall crown, higher the bigger the islet.
      if (flavor === "islet") e = h > 0.52 ? 3 : h > 0.3 ? 2 : h > 0.12 ? 1 : 0;
      else {
        e = h < 0.1 ? 0 : h < 0.2 ? 1 : flavor !== "home" && h > 0.72 ? 3 : 2;
        if (e < 2 && fbm(x * 0.13, y * 0.13, cliffSeed) > 0.58) e = 2;
      }
      elevation[k] = e;
    }
  }
  // Mode filter removes single-tile bumps so plateaus stay buildable.
  for (let pass = 0; pass < 2; pass++) {
    const copy = elevation.slice();
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const k = y * size + x;
        if (!land[k]) continue;
        const counts = [0, 0, 0, 0];
        for (const [dx, dy] of NEIGHBOURS_8) {
          const nk = (y + dy) * size + x + dx;
          if (land[nk]) counts[copy[nk]!]!++;
        }
        const mine = copy[k]!;
        let best = mine;
        for (let e = 0; e < 4; e++) if (counts[e]! > counts[best]! + 1) best = e;
        elevation[k] = best;
      }
    }
  }

  // Shore distance, island attribution and biome regions for water, by multi-source BFS.
  const shore = new Uint8Array(n).fill(255);
  const biome = new Uint8Array(n).fill(NO_BIOME);
  const queue: number[] = [];
  for (let k = 0; k < n; k++) {
    if (land[k]) {
      shore[k] = 0;
      biome[k] = biomeIndex(islands[island[k]!]!.biome);
      queue.push(k);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]!;
    const x = k % size;
    const y = Math.floor(k / size);
    const d = shore[k]!;
    if (d >= 254) continue;
    for (const [dx, dy] of NEIGHBOURS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nk = ny * size + nx;
      if (shore[nk]! <= d + 1) continue;
      shore[nk] = d + 1;
      island[nk] = d + 1 <= 6 ? island[k]! : -1;
      biome[nk] = d + 1 <= REGION_REACH ? biome[k]! : NO_BIOME;
      queue.push(nk);
    }
  }

  // Interior level-0 pockets become level 1: beaches only exist near the water.
  for (let k = 0; k < n; k++) {
    if (!land[k] || elevation[k] !== 0) continue;
    const x = k % size;
    const y = Math.floor(k / size);
    let nearWater = false;
    for (let dy = -2; dy <= 2 && !nearWater; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && !land[ny * size + nx]) {
          nearWater = true;
          break;
        }
      }
    if (!nearWater) elevation[k] = 1;
  }

  const terrain = new Uint8Array(n);
  const rockSeed = base ^ 0x2468ace;
  for (let k = 0; k < n; k++) {
    const x = k % size;
    const y = Math.floor(k / size);
    if (!land[k]) {
      terrain[k] = shore[k]! <= 2 ? Terrain.Shallow : Terrain.Deep;
      continue;
    }
    const flavor = flavorOf(k);
    const rocky = BIOME_DEFS[islands[island[k]!]!.biome].rocky * (flavor === "rocky" ? 2.2 : 1);
    if (elevation[k] === 0) terrain[k] = Terrain.Sand;
    else if (flavor === "islet") terrain[k] = elevation[k]! >= 2 ? Terrain.Grass : Terrain.Rock;
    else if (flavor !== "home" && fbm(x * 0.15, y * 0.15, rockSeed) > 0.72 - rocky * 0.7)
      terrain[k] = Terrain.Rock;
    else terrain[k] = Terrain.Grass;
  }
  for (const is of islands) is.tiles = 0;
  for (let k = 0; k < n; k++) if (land[k]) islands[island[k]!]!.tiles++;
  return { terrain, elevation, island, shore, biome };
}

const PERP: Record<Dir, { x: number; y: number }> = {
  "+x": { x: 0, y: 1 },
  "-x": { x: 0, y: 1 },
  "+y": { x: 1, y: 0 },
  "-y": { x: 1, y: 0 },
};

function bfsDistances(world: WorldMap, start: { x: number; y: number }): Map<number, number> {
  const dist = new Map<number, number>([[tileIndex(world, start.x, start.y), 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head]!;
    const d = dist.get(tileIndex(world, x, y))!;
    for (const [dx, dy] of NEIGHBOURS_4) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = tileIndex(world, nx, ny);
      if (!inBounds(world, nx, ny) || dist.has(nk) || !canStep(world, x, y, nx, ny)) continue;
      dist.set(nk, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function findStartSite(
  world: WorldMap,
): { site: StartSite; reserved: Set<number>; path: number[] } | null {
  const home = world.islands[0]!;
  const isHomeLand = (x: number, y: number) =>
    inBounds(world, x, y) &&
    isLandTerrain(world.terrain[tileIndex(world, x, y)]!) &&
    world.island[tileIndex(world, x, y)] === home.id;

  // Town hall: the flat 5×5 grass patch closest to the island centre (3×3 hall + margin).
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < world.height - 2; y++) {
    for (let x = 2; x < world.width - 2; x++) {
      if (!isHomeLand(x, y)) continue;
      candidates.push({ x, y, d: Math.hypot(x + 0.5 - home.cx, y + 0.5 - home.cy) });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  let hall: { x: number; y: number } | null = null;
  for (const c of candidates) {
    const e = world.elevation[tileIndex(world, c.x, c.y)]!;
    if (e === 0) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) {
      for (let dx = -2; dx <= 2 && ok; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        const k = tileIndex(world, x, y);
        ok = isHomeLand(x, y) && world.elevation[k] === e && world.terrain[k] === Terrain.Grass;
      }
    }
    if (ok) {
      hall = { x: c.x - 1, y: c.y - 1 };
      break;
    }
  }
  if (!hall) return null;
  const front = { x: hall.x + 1, y: hall.y + 3 };
  const reach = bfsDistances(world, front);

  // Dock: a 2-wide, 3-long pier running straight out from a low coastal tile into open water.
  let best: { score: number; L: { x: number; y: number }; dir: Dir } | null = null;
  for (const [k, dist] of reach) {
    const L = { x: k % world.width, y: Math.floor(k / world.width) };
    if (world.elevation[k]! > 1 || !isHomeLand(L.x, L.y)) continue;
    for (const dir of ["+x", "+y", "-x", "-y"] as Dir[]) {
      const d = DIR_VECTORS[dir];
      const p = PERP[dir];
      if (!reach.has(tileIndex(world, L.x + p.x, L.y + p.y))) continue;
      let ok = true;
      for (let s = 1; s <= 6 && ok; s++) {
        for (let j = s <= 3 ? 0 : -1; j <= (s <= 3 ? 1 : 2) && ok; j++) {
          const x = L.x + d.x * s + p.x * j;
          const y = L.y + d.y * s + p.y * j;
          ok = inBounds(world, x, y) && !isLandTerrain(world.terrain[tileIndex(world, x, y)]!);
        }
      }
      if (!ok) continue;
      const score = dist + (dir === "+x" || dir === "+y" ? 0 : 10);
      if (!best || score < best.score) best = { score, L, dir };
    }
  }
  if (!best) return null;
  const d = DIR_VECTORS[best.dir];
  const p = PERP[best.dir];
  const tiles: { x: number; y: number }[] = [];
  for (let s = 1; s <= 3; s++)
    for (let j = 0; j <= 1; j++)
      tiles.push({ x: best.L.x + d.x * s + p.x * j, y: best.L.y + d.y * s + p.y * j });
  const minX = Math.min(...tiles.map((t) => t.x));
  const minY = Math.min(...tiles.map((t) => t.y));
  const alongX = best.dir === "+x" || best.dir === "-x";
  const dock = {
    x: minX,
    y: minY,
    w: alongX ? 3 : 2,
    h: alongX ? 2 : 3,
    dir: best.dir,
    landing: best.L,
  };

  // A dirt trail from the hall to the dock, like the paths in the concept art.
  const trail = findPath(
    {
      width: world.width,
      height: world.height,
      canMove: (ax, ay, bx, by) => canStep(world, ax, ay, bx, by),
    },
    front,
    [best.L],
  );
  if (!trail) return null;
  const path = [
    tileIndex(world, front.x, front.y),
    ...trail.map((t) => tileIndex(world, t.x, t.y)),
  ];

  const reserved = new Set<number>(path);
  for (let y = hall.y - 2; y < hall.y + 5; y++)
    for (let x = hall.x - 2; x < hall.x + 5; x++)
      if (inBounds(world, x, y)) reserved.add(tileIndex(world, x, y));
  for (const t of [best.L, { x: best.L.x + p.x, y: best.L.y + p.y }]) {
    for (const [dx, dy] of NEIGHBOURS_8) {
      if (inBounds(world, t.x + dx, t.y + dy)) reserved.add(tileIndex(world, t.x + dx, t.y + dy));
    }
    reserved.add(tileIndex(world, t.x, t.y));
  }
  const spawn = [
    { x: hall.x, y: hall.y + 3 },
    { x: hall.x + 1, y: hall.y + 3 },
    { x: hall.x + 2, y: hall.y + 3 },
  ].filter((t) => reach.has(tileIndex(world, t.x, t.y)));
  if (spawn.length === 0) spawn.push(front);
  return {
    site: { islandId: home.id, townHall: { ...hall, w: 3, h: 3 }, dock, spawn },
    reserved,
    path,
  };
}

interface FlavorWeights {
  tree: number;
  food: number;
  stone: number;
  deposit: number;
  /** Cluster-noise threshold above which trees grow densely. */
  woods: number;
}

const FLAVORS: Record<IslandFlavor, FlavorWeights> = {
  home: { tree: 1, food: 1.2, stone: 1.2, deposit: 1.2, woods: 0.56 },
  wooded: { tree: 1.35, food: 0.8, stone: 0.8, deposit: 0.8, woods: 0.46 },
  fertile: { tree: 0.8, food: 2.2, stone: 0.8, deposit: 0.8, woods: 0.58 },
  rocky: { tree: 0.6, food: 0.6, stone: 2.2, deposit: 2.2, woods: 0.62 },
  islet: { tree: 1, food: 0.5, stone: 1, deposit: 1, woods: 1 },
};

const pick = <T>(list: readonly T[], v: number): T =>
  list[Math.min(list.length - 1, Math.floor(v * list.length))]!;

function chooseNode(
  def: BiomeDef,
  flavor: IslandFlavor,
  terrain: number,
  cluster: number,
  r: number,
  v: number,
): NodeKind | null {
  const f = FLAVORS[flavor];
  if (terrain === Terrain.Sand) return r < 0.02 * f.stone ? def.stone : null;
  if (terrain === Terrain.Rock) {
    if (flavor === "islet") return r < 0.22 ? def.stone : r < 0.3 ? pick(def.trees, v) : null;
    const stone = 0.08 * f.stone;
    const deposit = stone + 0.045 * f.deposit;
    return r < stone
      ? def.stone
      : r < deposit
        ? pick(def.deposits, v)
        : r < deposit + 0.03
          ? pick(def.trees, v)
          : null;
  }
  if (terrain !== Terrain.Grass) return null;
  if (cluster > f.woods) return r < def.cluster * f.tree ? pick(def.trees, v) : null;
  const s = def.scatter;
  let edge = s.tree * f.tree;
  if (r < edge) return pick(def.trees, v);
  edge += s.food * f.food;
  if (r < edge) return pick(def.food, v);
  edge += s.stone * f.stone;
  if (r < edge) return def.stone;
  edge += s.deposit * f.deposit;
  if (r < edge) return pick(def.deposits, v);
  return null;
}

/** Sprite variants per node kind (the generator draws this many). */
export const NODE_VARIANTS: Record<NodeKind, number> = {
  oak: 3,
  pine: 3,
  fruit: 1,
  berry: 1,
  boulder: 2,
  ore: 1,
  palm: 2,
  cactus: 2,
  sandstone: 2,
  gold_vein: 1,
  charred_tree: 2,
  ember_fruit: 1,
  obsidian: 2,
  hellstone: 1,
  snow_pine: 2,
  frost_berry: 1,
  ice_rock: 2,
  jungle_tree: 2,
  banana: 1,
  willow: 2,
  swamp_shroom: 1,
  bog_ore: 1,
  giant_mushroom: 2,
  glowshroom: 1,
  silver_tree: 2,
  crystal: 2,
  sunstone: 1,
  rimeglass: 1,
  mirepearl: 1,
  glowcap: 1,
  autumn_tree: 3,
  pumpkin: 1,
  blossom_tree: 2,
  flower_bush: 1,
};

function placeNodes(world: WorldMap, base: number, reserved: Set<number>): NodeSpawn[] {
  const nodes: NodeSpawn[] = [];
  const clusterSeed = base ^ 0xc3c3c3;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      const t = world.terrain[k]!;
      if (!isLandTerrain(t) || reserved.has(k)) continue;
      const island = world.islands[world.island[k]!];
      if (!island) continue;
      const r = hash2d(x, y, base ^ 0xa1);
      const v = hash2d(x, y, base ^ 0xb2);
      const kind = chooseNode(
        BIOME_DEFS[island.biome],
        island.flavor,
        t,
        fbm(x * 0.11, y * 0.11, clusterSeed),
        r,
        v,
      );
      if (kind)
        nodes.push({
          kind,
          x,
          y,
          variant: Math.floor(hash2d(x, y, base ^ 0xb3) * NODE_VARIANTS[kind]),
        });
    }
  }
  crownIslets(world, base, nodes);
  return nodes;
}

/** Every islet with a grassy crown carries a tree on its highest ground, like the concept art. */
function crownIslets(world: WorldMap, base: number, nodes: NodeSpawn[]): void {
  const taken = new Set(nodes.map((n) => tileIndex(world, n.x, n.y)));
  for (const island of world.islands) {
    if (island.flavor !== "islet") continue;
    let best = -1;
    let bestScore = -Infinity;
    for (
      let y = Math.floor(island.cy - island.radius - 1);
      y <= island.cy + island.radius + 1;
      y++
    ) {
      for (
        let x = Math.floor(island.cx - island.radius - 1);
        x <= island.cx + island.radius + 1;
        x++
      ) {
        if (!inBounds(world, x, y)) continue;
        const k = tileIndex(world, x, y);
        if (world.island[k] !== island.id || world.terrain[k] !== Terrain.Grass) continue;
        const score =
          world.elevation[k]! * 10 - Math.hypot(x + 0.5 - island.cx, y + 0.5 - island.cy);
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
    }
    if (best < 0 || taken.has(best)) continue;
    const kind =
      BIOME_DEFS[island.biome].trees[
        Math.floor(hash2d(island.id, best, base ^ 0xc7) * BIOME_DEFS[island.biome].trees.length)
      ]!;
    nodes.push({
      kind,
      x: best % world.width,
      y: Math.floor(best / world.width),
      variant: Math.floor(hash2d(island.id, best, base ^ 0xc8) * NODE_VARIANTS[kind]),
    });
  }
}

/** The home island always has enough of everything to get going, whatever its biome. */
function ensureHomeResources(world: WorldMap, base: number, reserved: Set<number>): boolean {
  const home = world.start.islandId;
  const def = BIOME_DEFS[world.islands[home]!.biome];
  const onHome = (n: { x: number; y: number }) => world.island[tileIndex(world, n.x, n.y)] === home;
  const count = (kinds: readonly NodeKind[]) =>
    world.nodes.filter((n) => kinds.includes(n.kind) && onHome(n)).length;
  const taken = new Set(world.nodes.map((n) => tileIndex(world, n.x, n.y)));
  const hall = world.start.townHall;
  const free: { x: number; y: number }[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      if (world.island[k] !== home || world.terrain[k] !== Terrain.Grass) continue;
      if (reserved.has(k) || taken.has(k)) continue;
      if (Math.hypot(x - hall.x - 1, y - hall.y - 1) < 4) continue;
      free.push({ x, y });
    }
  }
  const rng = createRng(base ^ 0xfeed);
  for (let i = free.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [free[i], free[j]] = [free[j]!, free[i]!];
  }
  const add = (kinds: readonly NodeKind[], want: number) => {
    for (let i = count(kinds); i < want; i++) {
      const t = free.pop();
      if (!t) return false;
      const kind = kinds[i % kinds.length]!;
      world.nodes.push({ kind, x: t.x, y: t.y, variant: rng.int(0, NODE_VARIANTS[kind] - 1) });
    }
    return true;
  };
  // Ore for the blacksmith must exist at home: the biome's own iron (plain ore or bog iron), or
  // plain ore where the biome has none (the Infernal Isles only yield hellstone).
  const ore: NodeKind[] = [def.deposits.find((k) => k === "ore" || k === "bog_ore") ?? "ore"];
  return add(def.trees, 30) && add([def.stone], 8) && add(def.food, 5) && add(ore, 5);
}

/** Rock arches standing in the shallows beside a coast; each blocks two water tiles. */
function placeArches(
  world: WorldMap,
  base: number,
  nearDock: (x: number, y: number) => boolean,
): DecoSpawn[] {
  const arches: DecoSpawn[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      if (isLandTerrain(world.terrain[k]!) || world.shore[k] !== 1 || nearDock(x, y)) continue;
      if (hash2d(x, y, base ^ 0xa7) > 0.004) continue;
      const variant = hash2d(x, y, base ^ 0xa8) < 0.5 ? 0 : 1;
      const bx = variant === 0 ? x + 1 : x;
      const by = variant === 0 ? y : y + 1;
      if (!inBounds(world, bx, by) || nearDock(bx, by)) continue;
      const bk = tileIndex(world, bx, by);
      if (isLandTerrain(world.terrain[bk]!) || world.shore[bk]! > 2) continue;
      if (arches.some((a) => Math.hypot(a.x - x, a.y - y) < 18)) continue;
      arches.push({ kind: "sea_arch", x, y, variant });
    }
  }
  return arches;
}

function placeDecor(world: WorldMap, base: number, reserved: Set<number>): DecoSpawn[] {
  const decor: DecoSpawn[] = [];
  const taken = new Set(world.nodes.map((n) => tileIndex(world, n.x, n.y)));
  const dock = world.start.dock;
  const nearDock = (x: number, y: number) =>
    x >= dock.x - 5 && x < dock.x + dock.w + 5 && y >= dock.y - 5 && y < dock.y + dock.h + 5;
  const arches = placeArches(world, base, nearDock);
  const archTiles = new Set<number>();
  for (const a of arches) {
    archTiles.add(tileIndex(world, a.x, a.y));
    archTiles.add(
      a.variant === 0 ? tileIndex(world, a.x + 1, a.y) : tileIndex(world, a.x, a.y + 1),
    );
  }
  decor.push(...arches);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      const t = world.terrain[k]!;
      const r = hash2d(x, y, base ^ 0xd4);
      const v = hash2d(x, y, base ^ 0xe5);
      if (!isLandTerrain(t)) {
        const shore = world.shore[k]!;
        if (nearDock(x, y) || archTiles.has(k)) continue;
        if ((shore >= 1 && shore <= 3 && r < 0.01) || (shore > 3 && r < 0.0008)) {
          decor.push({ kind: "sea_rock", x, y, variant: v < 0.5 ? 0 : 1 });
        }
        continue;
      }
      if (t !== Terrain.Grass || taken.has(k) || reserved.has(k)) continue;
      const flavor = world.islands[world.island[k]!]?.flavor;
      const tall = flavor === "fertile" ? 0.04 : 0.018;
      if (r < tall) decor.push({ kind: "tall", x, y, variant: 0 });
      else if (r < 0.16) decor.push({ kind: "small", x, y, variant: v < 0.5 ? 0 : 1 });
    }
  }
  return decor;
}

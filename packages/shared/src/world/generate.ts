// Seeded archipelago generation. Deterministic: the same seed always yields the same world, so
// the server only sends the seed and clients rebuild the terrain themselves.
import { fbm } from "../noise";
import { createRng, hash2d, hashSeed, type Rng } from "../rng";
import { canStep, inBounds, isLandTerrain, NEIGHBOURS_4, NEIGHBOURS_8, tileIndex } from "./grid";
import { findPath } from "./pathfind";
import {
  DIR_VECTORS,
  Terrain,
  type DecoSpawn,
  type Dir,
  type Island,
  type IslandTheme,
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

export function generateWorld(seed: string, size = WORLD_SIZE): WorldMap {
  for (let attempt = 0; attempt < 24; attempt++) {
    const world = attemptWorld(seed, attempt, size);
    if (world) return world;
  }
  throw new Error(`could not generate a valid world for seed "${seed}"`);
}

function attemptWorld(seed: string, attempt: number, size: number): WorldMap | null {
  const genSeed = attempt === 0 ? seed : `${seed}#${attempt}`;
  const base = hashSeed(genSeed);
  const rng = createRng(`${genSeed}:islands`);
  const islands = placeIslands(rng, size);
  const partial = shapeTerrain(islands, base, size);
  const world: WorldMap = {
    seed,
    width: size,
    height: size,
    ...partial,
    islands: islands.map(({ id, cx, cy, radius, theme, tiles }) => ({
      id,
      cx,
      cy,
      radius,
      theme,
      tiles,
    })),
    start: undefined as unknown as StartSite,
    nodes: [],
    decor: [],
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
  world.decor = placeDecor(world, base, reserved);
  return world;
}

function placeIslands(rng: Rng, size: number): IslandSeed[] {
  const list: IslandSeed[] = [];
  const add = (cx: number, cy: number, radius: number, theme: IslandTheme, stretch: number) => {
    list.push({
      id: list.length,
      cx,
      cy,
      radius,
      theme,
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
  const themes: IslandTheme[] = ["forest", "farmland", "rocky"];
  const target = rng.int(10, 14);
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < target; tries++) {
    const r = rng.float(7, 15);
    const cx = rng.float(r + 7, size - r - 7);
    const cy = rng.float(r + 7, size - r - 7);
    if (list.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < (o.radius + r) * 1.28 + 6)) continue;
    add(cx, cy, r, themes[placed % 3 === 0 ? rng.int(0, 2) : placed % 3]!, 0.25);
    placed++;
  }
  const islets = rng.int(14, 24);
  let isletCount = 0;
  for (let tries = 0; tries < 900 && isletCount < islets; tries++) {
    const r = rng.float(1.3, 2.8);
    const cx = rng.float(4, size - 4);
    const cy = rng.float(4, size - 4);
    if (list.some((o) => Math.hypot(o.cx - cx, o.cy - cy) < o.radius * 1.28 + r + 4)) continue;
    add(cx, cy, r, "islet", 0.2);
    isletCount++;
  }
  return list;
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
        const rEff = is.radius * (is.theme === "islet" ? 0.8 + 0.4 * wobble : 0.6 + 0.8 * wobble);
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

  const themeOf = (k: number) => islands[island[k]!]?.theme ?? "islet";
  const elevation = new Uint8Array(n);
  const cliffSeed = base ^ 0x1234567;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      if (!land[k]) continue;
      const h = heightField[k]!;
      const theme = themeOf(k);
      let e: number;
      if (theme === "islet") e = h > 0.45 ? 1 : 0;
      else if (theme === "home") e = h < 0.1 ? 0 : h < 0.46 ? 1 : 2;
      else e = h < 0.1 ? 0 : h < 0.36 ? 1 : h < 0.66 ? 2 : 3;
      if (e === 0 && fbm(x * 0.13, y * 0.13, cliffSeed) > 0.56) e = 1;
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

  // Shore distance and island attribution for water, by multi-source BFS from land.
  const shore = new Uint8Array(n).fill(255);
  const queue: number[] = [];
  for (let k = 0; k < n; k++) {
    if (land[k]) {
      shore[k] = 0;
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
    const theme = themeOf(k);
    if (elevation[k] === 0) terrain[k] = Terrain.Sand;
    else if (theme === "islet") terrain[k] = Terrain.Rock;
    else if (theme === "rocky" && fbm(x * 0.15, y * 0.15, rockSeed) > 0.5)
      terrain[k] = Terrain.Rock;
    else terrain[k] = Terrain.Grass;
  }
  for (const is of islands) is.tiles = 0;
  for (let k = 0; k < n; k++) if (land[k]) islands[island[k]!]!.tiles++;
  return { terrain, elevation, island, shore };
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

function chooseNode(
  theme: IslandTheme,
  terrain: number,
  cluster: number,
  r: number,
  v: number,
): NodeKind | null {
  if (terrain === Terrain.Sand) return r < 0.02 ? "boulder" : null;
  if (terrain === Terrain.Rock) {
    if (theme === "islet") return r < 0.22 ? "boulder" : r < 0.27 ? "pine" : null;
    return r < 0.12 ? "boulder" : r < 0.17 ? "ore" : r < 0.2 ? "pine" : null;
  }
  if (terrain !== Terrain.Grass) return null;
  switch (theme) {
    case "home":
      if (cluster > 0.56) return r < 0.42 ? (v < 0.65 ? "oak" : "pine") : null;
      return r < 0.035
        ? "oak"
        : r < 0.045
          ? "fruit"
          : r < 0.06
            ? "berry"
            : r < 0.07
              ? "boulder"
              : null;
    case "forest":
      if (cluster > 0.45) return r < 0.5 ? (v < 0.85 ? "pine" : "oak") : null;
      return r < 0.12 ? "pine" : r < 0.14 ? "berry" : null;
    case "farmland":
      if (cluster > 0.55) return r < 0.32 ? (v < 0.6 ? "oak" : "fruit") : null;
      return r < 0.04 ? "fruit" : r < 0.08 ? "berry" : r < 0.1 ? "oak" : null;
    case "rocky":
      return r < 0.06 ? "pine" : r < 0.09 ? "boulder" : null;
    case "islet":
      return r < 0.2 ? "pine" : null;
  }
}

const VARIANTS: Record<NodeKind, number> = {
  oak: 3,
  pine: 3,
  fruit: 1,
  berry: 1,
  boulder: 2,
  ore: 1,
};

function placeNodes(world: WorldMap, base: number, reserved: Set<number>): NodeSpawn[] {
  const nodes: NodeSpawn[] = [];
  const clusterSeed = base ^ 0xc3c3c3;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      const t = world.terrain[k]!;
      if (!isLandTerrain(t) || reserved.has(k)) continue;
      const theme = world.islands[world.island[k]!]?.theme ?? "islet";
      const r = hash2d(x, y, base ^ 0xa1);
      const v = hash2d(x, y, base ^ 0xb2);
      const kind = chooseNode(theme, t, fbm(x * 0.11, y * 0.11, clusterSeed), r, v);
      if (kind) nodes.push({ kind, x, y, variant: Math.floor(v * VARIANTS[kind]) });
    }
  }
  return nodes;
}

function ensureHomeResources(world: WorldMap, base: number, reserved: Set<number>): boolean {
  const home = world.start.islandId;
  const onHome = (n: { x: number; y: number }) => world.island[tileIndex(world, n.x, n.y)] === home;
  const count = (kinds: NodeKind[]) =>
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
  const add = (kind: NodeKind, want: number, have: number) => {
    for (let i = have; i < want; i++) {
      const t = free.pop();
      if (!t) return false;
      world.nodes.push({ kind, x: t.x, y: t.y, variant: rng.int(0, VARIANTS[kind] - 1) });
    }
    return true;
  };
  return (
    add("oak", 30, count(["oak", "pine", "fruit"])) &&
    add("boulder", 8, count(["boulder", "ore"])) &&
    add("berry", 4, count(["berry", "fruit"]))
  );
}

function placeDecor(world: WorldMap, base: number, reserved: Set<number>): DecoSpawn[] {
  const decor: DecoSpawn[] = [];
  const taken = new Set(world.nodes.map((n) => tileIndex(world, n.x, n.y)));
  const dock = world.start.dock;
  const nearDock = (x: number, y: number) =>
    x >= dock.x - 5 && x < dock.x + dock.w + 5 && y >= dock.y - 5 && y < dock.y + dock.h + 5;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = tileIndex(world, x, y);
      const t = world.terrain[k]!;
      const r = hash2d(x, y, base ^ 0xd4);
      const v = hash2d(x, y, base ^ 0xe5);
      if (!isLandTerrain(t)) {
        const shore = world.shore[k]!;
        if (nearDock(x, y)) continue;
        if ((shore >= 1 && shore <= 3 && r < 0.01) || (shore > 3 && r < 0.0008)) {
          decor.push({ kind: "sea_rock", x, y, variant: v < 0.5 ? 0 : 1 });
        }
        continue;
      }
      if (t !== Terrain.Grass || taken.has(k) || reserved.has(k)) continue;
      const theme = world.islands[world.island[k]!]?.theme;
      if (theme === "farmland" && r < 0.035) decor.push({ kind: "sunflowers", x, y, variant: 0 });
      else if ((theme === "farmland" || theme === "home") && r < 0.09)
        decor.push({ kind: "flowers", x, y, variant: v < 0.5 ? 0 : 1 });
      else if (r < 0.15) decor.push({ kind: "grass", x, y, variant: v < 0.5 ? 0 : 1 });
    }
  }
  return decor;
}

// Threats and treasure at sea: pirate raids, ship combat, wrecks, sunken sites and divers.
import { hash2d } from "../rng";
import { DIVE, GUNS, PATROL, PIRATE, RESOURCES, STORM, BUILDINGS, type Stock } from "./catalogue";
import { DIFFICULTY_DEFS } from "./difficulty";
import { dockSpawn } from "./ferry";
import { sailable, seaPath } from "./navigation";
import { nearestWater } from "./rules";
import {
  addEntity,
  hasUpgrade,
  islandAt,
  markDirty,
  pirateMaxHp,
  removeEntity,
  shipMaxHp,
  stockOf,
  touchStock,
  walkable,
  type BuildingEntity,
  type GameState,
  type PirateEntity,
  type ShipEntity,
  type SiteEntity,
  type WreckEntity,
} from "./state";

type Goods = Partial<Stock>;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const tileOf = (e: { x: number; y: number }) => ({ x: Math.floor(e.x), y: Math.floor(e.y) });

function add(into: Goods, more: Goods): void {
  for (const r of RESOURCES) if (more[r]) into[r] = (into[r] ?? 0) + more[r]!;
}

const total = (g: Goods) => RESOURCES.reduce((n, r) => n + (g[r] ?? 0), 0);

/** All entities of one type, as an array (the sim mutates the map while iterating). */
function all<T extends { type: string }>(state: GameState, type: T["type"]): T[] {
  const out: T[] = [];
  for (const e of state.entities.values()) if (e.type === type) out.push(e as unknown as T);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Entry point

export function updateThreats(state: GameState, dt: number): void {
  discoverSites(state);
  spawnRaids(state);
  for (const p of all<PirateEntity>(state, "pirate")) updatePirate(state, p, dt);
  for (const s of all<ShipEntity>(state, "ship")) updateShipDuty(state, s, dt);
  stormBolt(state);
}

// ---------------------------------------------------------------------------------------------
// Wrecks

/** Take everything a wreck holds into the treasury and remove it. */
export function collectWreck(state: GameState, w: WreckEntity): void {
  addToTreasury(state, w.loot);
  state.events.push({
    type: "salvaged",
    what: w.kind === "skeleton" ? "the bones of a raider" : "a shipwreck",
    goods: { ...w.loot },
    x: w.x,
    y: w.y,
  });
  removeEntity(state, w.id);
}

function addToTreasury(state: GameState, goods: Goods): void {
  for (const r of RESOURCES) if (goods[r]) state.stock[r] += goods[r]!;
  state.stockDirty = true;
}

function leaveWreck(
  state: GameState,
  kind: "shipwreck" | "skeleton",
  x: number,
  y: number,
  loot: Goods,
): void {
  addEntity(state, {
    id: state.nextId++,
    type: "wreck",
    kind,
    x,
    y,
    variant: Math.floor(hash2d(x, y, 0x77) * 4),
    loot,
  } satisfies WreckEntity);
}

/** What a beaten pirate crew leaves for whoever picks through the wreck. */
function bounty(state: GameState, p: PirateEntity): Goods {
  const loot: Goods = { ...p.loot };
  const roll = (salt: number) => hash2d(state.tick, p.id, salt);
  add(loot, { gold: 10 + Math.floor(roll(1) * 18) });
  if (roll(2) < 0.35) add(loot, { relic: 1 });
  if (roll(3) < 0.5) add(loot, { tools: 1 + Math.floor(roll(4) * 3) });
  return loot;
}

// ---------------------------------------------------------------------------------------------
// Damage

function damageShip(state: GameState, s: ShipEntity, dmg: number): void {
  s.hp -= dmg;
  markDirty(state, s.id);
  if (s.hp > 0) return;
  // Everyone aboard goes down with the ship; its cargo floats free in the wreck.
  for (const id of s.passengers) removeEntity(state, id);
  const loot: Goods = { ...s.cargo };
  add(loot, { gold: 4 });
  leaveWreck(state, "shipwreck", Math.floor(s.x), Math.floor(s.y), loot);
  state.events.push({ type: "sunk", kind: s.kind, x: s.x, y: s.y });
  removeEntity(state, s.id);
}

function sinkPirate(state: GameState, p: PirateEntity): void {
  const raiding = p.phase === "raid";
  const tile = tileOf(p);
  const loot = bounty(state, p);
  state.events.push({ type: "sunk", kind: "pirate", x: p.x, y: p.y });
  removeEntity(state, p.id);
  if (raiding) {
    // The crew was ashore when the ship went down: they leave bones on the beach.
    const land = nearestLand(state, tile.x, tile.y, 6);
    if (land) return leaveWreck(state, "skeleton", land.x, land.y, loot);
  }
  leaveWreck(state, "shipwreck", tile.x, tile.y, loot);
}

function nearestLand(
  state: GameState,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let ty = y - radius; ty <= y + radius; ty++)
    for (let tx = x - radius; tx <= x + radius; tx++) {
      if (!walkable(state, tx, ty)) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (!best || d < best.d) best = { x: tx, y: ty, d };
    }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Pirates

function spawnRaids(state: GameState): void {
  const rules = DIFFICULTY_DEFS[state.difficulty];
  if (!rules.raids || state.time < state.nextRaid) return;
  const [lo, hi] = rules.interval;
  state.nextRaid = state.time + lo + hash2d(state.tick, 1, 0x9b) * (hi - lo);
  const alive = all<PirateEntity>(state, "pirate").length;
  const day = Math.floor(state.time / 480);
  const count = Math.min(rules.maxAtOnce - alive, 1 + rules.extraRaiders + Math.floor(day / 3));
  let first: PirateEntity | null = null;
  for (let i = 0; i < count; i++) {
    const p = spawnPirate(state, i);
    first ??= p;
  }
  if (first) state.events.push({ type: "pirates", count, x: first.x, y: first.y });
}

function spawnPirate(state: GameState, index: number): PirateEntity | null {
  const w = state.world;
  const hall = w.start.townHall;
  for (let attempt = 0; attempt < 80; attempt++) {
    const r = (salt: number) => hash2d(state.tick + index * 7919, attempt, 0x9a0 + salt);
    const along = Math.floor(r(1) * (w.width - 8)) + 4;
    const side = Math.floor(r(2) * 4);
    const inset = 3;
    const x = side === 0 ? inset : side === 1 ? w.width - 1 - inset : along;
    const y = side === 2 ? inset : side === 3 ? w.height - 1 - inset : along;
    if (!sailable(state, x, y)) continue;
    if (Math.hypot(x - hall.x, y - hall.y) < PIRATE.spawnDistance) continue;
    const p: PirateEntity = {
      id: state.nextId++,
      type: "pirate",
      x: x + 0.5,
      y: y + 0.5,
      heading: 0,
      hp: pirateMaxHp(state),
      path: [],
      phase: "hunt",
      target: null,
      timer: 0,
      cooldown: 2,
      loot: {},
      home: { x, y },
    };
    return addEntity(state, p);
  }
  return null;
}

/** Our ships, nearest to a point first. */
function shipsNear(state: GameState, at: { x: number; y: number }, range: number): ShipEntity[] {
  return all<ShipEntity>(state, "ship")
    .filter((s) => dist(s, at) <= range)
    .sort((a, b) => dist(a, at) - dist(b, at));
}

function updatePirate(state: GameState, p: PirateEntity, dt: number): void {
  if (p.hp <= 0) return sinkPirate(state, p);
  p.cooldown = Math.max(0, p.cooldown - dt);
  const foe = shipsNear(state, p, PIRATE.range)[0];
  if (foe && p.cooldown === 0) {
    p.cooldown = PIRATE.cooldown;
    damageShip(state, foe, PIRATE.damage * DIFFICULTY_DEFS[state.difficulty].pirateDamage);
    state.events.push({
      type: "shot",
      kind: "cannon",
      from: { x: p.x, y: p.y },
      to: { x: foe.x, y: foe.y },
    });
  }
  if (p.phase === "raid") return raid(state, p, dt);
  if (p.phase === "flee") {
    if (dist(p, p.home) < 2) return removeEntity(state, p.id);
    if (p.path.length === 0) planPath(state, p, p.home);
  } else hunt(state, p, dt);
  const before = p.path.length;
  if (before > 0) stepSail(state, p, PIRATE.speed, dt);
}

function planPath(state: GameState, p: PirateEntity, to: { x: number; y: number }): boolean {
  const goal = sailable(state, Math.floor(to.x), Math.floor(to.y))
    ? { x: Math.floor(to.x), y: Math.floor(to.y) }
    : nearestWater(state, Math.floor(to.x), Math.floor(to.y), 6);
  if (!goal) return false;
  const path = seaPath(state, tileOf(p), goal);
  if (!path) return false;
  p.path = path;
  markDirty(state, p.id);
  return true;
}

function hunt(state: GameState, p: PirateEntity, dt: number): void {
  p.timer -= dt;
  if (p.timer > 0 && p.path.length > 0) return;
  // Every couple of seconds: pick the nearest ship in reach, else a settlement to rob.
  p.timer = 2;
  const prey = shipsNear(state, p, 40)[0];
  if (prey) {
    p.target = prey.id;
    if (dist(p, prey) <= PIRATE.range * 0.8) {
      p.path = [];
      return;
    }
    planPath(state, p, prey);
    return;
  }
  const target = p.target === null ? undefined : state.entities.get(p.target);
  if (target?.type !== "building") {
    p.target = pickRaidTarget(state, p);
    if (p.target === null) {
      // Nothing worth robbing: sail home.
      p.phase = "flee";
      return;
    }
  }
  const b = state.entities.get(p.target!);
  if (b?.type !== "building") return;
  const shore = nearestWater(state, Math.floor(b.x + b.w / 2), Math.floor(b.y + b.h / 2), 6);
  if (!shore) {
    p.target = null;
    return;
  }
  if (dist(p, { x: shore.x + 0.5, y: shore.y + 0.5 }) <= 1.6) {
    p.phase = "raid";
    p.path = [];
    p.timer = PIRATE.raidSeconds;
    markDirty(state, p.id);
    return;
  }
  if (p.path.length === 0) planPath(state, p, shore);
}

/** A storehouse, camp or dock that a ship could reach: favour ones near where the pirate is. */
function pickRaidTarget(state: GameState, p: PirateEntity): number | null {
  const candidates = all<BuildingEntity>(state, "building").filter(
    (b) =>
      b.complete && (BUILDINGS[b.kind as keyof typeof BUILDINGS]?.dropOff || b.kind === "dock"),
  );
  const near = candidates
    .map((b) => ({ b, d: dist(p, b), c: nearestWater(state, b.x, b.y, 5) }))
    .filter((c) => c.c)
    .sort((a, c) => a.d - c.d)
    .slice(0, 3);
  if (near.length === 0) return null;
  return near[Math.floor(hash2d(state.tick, p.id, 0x9c) * near.length)]!.b.id;
}

function raid(state: GameState, p: PirateEntity, dt: number): void {
  const b = p.target === null ? undefined : state.entities.get(p.target);
  const before = Math.ceil(p.timer);
  p.timer -= dt;
  if (b?.type !== "building" || p.timer <= 0) {
    p.phase = "flee";
    p.path = [];
    markDirty(state, p.id);
    return;
  }
  if (Math.ceil(p.timer) === before) return;
  // Once a second, grab a share of every pile on the island.
  const island = islandAt(state, b.x, b.y);
  const pile = stockOf(state, island);
  let took = 0;
  for (const r of RESOURCES) {
    const n = pile[r];
    const take = Math.min(
      n,
      Math.max(
        n >= 8 ? 1 : 0,
        Math.floor(n * PIRATE.stealShare * DIFFICULTY_DEFS[state.difficulty].steal),
      ),
    );
    if (take <= 0) continue;
    pile[r] -= take;
    p.loot[r] = (p.loot[r] ?? 0) + take;
    took += take;
  }
  if (took === 0) return;
  touchStock(state, island);
  markDirty(state, p.id);
  if (total(p.loot) === took)
    state.events.push({ type: "robbed", islandId: island, x: b.x, y: b.y });
}

/** Advance along a sea path (pirates and patrol boats share the ship's stepping). */
function stepSail(
  state: GameState,
  e: { x: number; y: number; heading: number; id: number; path: { x: number; y: number }[] },
  speed: number,
  dt: number,
): void {
  let budget = speed * dt;
  while (budget > 1e-6 && e.path.length > 0) {
    const next = e.path[0]!;
    const dx = next.x + 0.5 - e.x;
    const dy = next.y + 0.5 - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) e.heading = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    if (d <= budget) {
      e.x = next.x + 0.5;
      e.y = next.y + 0.5;
      budget -= d;
      e.path.shift();
    } else {
      e.x += (dx / d) * budget;
      e.y += (dy / d) * budget;
      budget = 0;
    }
  }
  markDirty(state, e.id);
}

// ---------------------------------------------------------------------------------------------
// Our ships: guns, patrols, repairs, salvage and diving

export function shipGuns(state: GameState, s: ShipEntity) {
  if (s.kind === "patrol" || hasUpgrade(state, "cannons")) return GUNS[s.kind];
  return null;
}

function updateShipDuty(state: GameState, s: ShipEntity, dt: number): void {
  if (!state.entities.has(s.id)) return;
  s.cooldown = Math.max(0, s.cooldown - dt);
  fireGuns(state, s);
  repair(state, s, dt);
  if (s.kind === "patrol") patrol(state, s);
  if (s.salvage) salvage(state, s, dt);
  if (s.dive) dive(state, s, dt);
}

function fireGuns(state: GameState, s: ShipEntity): void {
  const guns = shipGuns(state, s);
  if (!guns || s.cooldown > 0) return;
  let best: PirateEntity | null = null;
  for (const p of all<PirateEntity>(state, "pirate")) {
    if (dist(p, s) <= guns.range && (!best || dist(p, s) < dist(best, s))) best = p;
  }
  if (!best) return;
  s.cooldown = guns.cooldown;
  best.hp -= guns.damage;
  markDirty(state, best.id);
  markDirty(state, s.id);
  state.events.push({
    type: "shot",
    kind: "cannon",
    from: { x: s.x, y: s.y },
    to: { x: best.x, y: best.y },
  });
}

/** Ships mend slowly while moored beside a finished dock. */
function repair(state: GameState, s: ShipEntity, dt: number): void {
  if (s.hp >= shipMaxHp(state, s.kind) || s.path.length > 0) return;
  for (const b of all<BuildingEntity>(state, "building")) {
    if (b.kind !== "dock" || !b.complete) continue;
    if (dist(s, dockSpawn(b)) > 4) continue;
    s.hp = Math.min(shipMaxHp(state, s.kind), s.hp + 2 * dt);
    markDirty(state, s.id);
    return;
  }
}

/** Patrol boats chase pirates within reach whenever they are not following an order. */
function patrol(state: GameState, s: ShipEntity): void {
  if (s.salvage || s.dive || state.time < s.waitUntil) return;
  const prey = all<PirateEntity>(state, "pirate")
    .filter((p) => dist(p, s) <= PATROL.engage)
    .sort((a, b) => dist(a, s) - dist(b, s))[0];
  if (!prey) {
    if (s.hunt) {
      s.hunt = false;
      s.path = [];
      s.dest = null;
      markDirty(state, s.id);
    }
    return;
  }
  if (!s.hunt && s.path.length > 0) return; // following a player's order
  const guns = GUNS.patrol!;
  s.waitUntil = state.time + 2;
  s.hunt = true;
  if (dist(prey, s) <= guns.range * 0.75) {
    s.path = [];
    s.dest = null;
    markDirty(state, s.id);
    return;
  }
  const goal = tileOf(prey);
  const path = seaPath(state, tileOf(s), goal);
  if (!path) return;
  s.path = path;
  s.dest = goal;
  markDirty(state, s.id);
}

function salvage(state: GameState, s: ShipEntity, dt: number): void {
  const job = s.salvage!;
  const wreck = state.entities.get(job.wreckId);
  if (wreck?.type !== "wreck" || wreck.kind !== "shipwreck") {
    s.salvage = null;
    markDirty(state, s.id);
    return;
  }
  if (s.path.length > 0) return;
  if (dist(s, wreck) > 1.8) {
    const path = seaPath(state, tileOf(s), tileOf(wreck));
    if (!path) {
      s.salvage = null;
      markDirty(state, s.id);
      return;
    }
    s.path = path;
    s.dest = tileOf(wreck);
    markDirty(state, s.id);
    return;
  }
  job.remaining -= dt;
  markDirty(state, s.id);
  if (job.remaining > 0) return;
  s.salvage = null;
  collectWreck(state, wreck);
}

function dive(state: GameState, s: ShipEntity, dt: number): void {
  const job = s.dive!;
  const site = state.entities.get(job.siteId);
  if (site?.type !== "site" || total(site.loot) === 0 || s.passengers.length === 0) {
    s.dive = null;
    markDirty(state, s.id);
    return;
  }
  if (s.path.length > 0) return;
  if (dist(s, site) > DIVE.reach) {
    const path = seaPath(state, tileOf(s), tileOf(site));
    if (!path) {
      s.dive = null;
      markDirty(state, s.id);
      return;
    }
    s.path = path;
    s.dest = tileOf(site);
    markDirty(state, s.id);
    return;
  }
  job.remaining -= dt;
  markDirty(state, s.id);
  if (job.remaining > 0) return;
  s.dive = null;
  const share = Math.min(1, DIVE.share * s.passengers.length);
  const haul: Goods = {};
  for (const r of RESOURCES) {
    const have = site.loot[r] ?? 0;
    if (have <= 0) continue;
    const take = Math.min(have, Math.max(1, Math.round(have * share)));
    haul[r] = take;
    site.loot[r] = have - take;
  }
  addToTreasury(state, haul);
  markDirty(state, site.id);
  state.events.push({
    type: "salvaged",
    what: "divers from the deep",
    goods: haul,
    x: site.x,
    y: site.y,
  });
}

function discoverSites(state: GameState): void {
  const ships = all<ShipEntity>(state, "ship");
  if (ships.length === 0) return;
  for (const site of all<SiteEntity>(state, "site")) {
    if (site.found) continue;
    if (!ships.some((s) => dist(s, site) <= DIVE.discover)) continue;
    site.found = true;
    markDirty(state, site.id);
    state.events.push({ type: "found", site: site.kind, x: site.x, y: site.y });
  }
}

function stormBolt(state: GameState): void {
  if (!hasUpgrade(state, "storm_bolt") || state.time < state.nextBolt) return;
  const guarded = [
    ...all<ShipEntity>(state, "ship"),
    ...all<BuildingEntity>(state, "building").filter((b) => b.complete),
  ];
  let best: PirateEntity | null = null;
  for (const p of all<PirateEntity>(state, "pirate")) {
    if (!guarded.some((g) => dist(g, p) <= STORM.range)) continue;
    if (!best || p.hp < best.hp) best = p;
  }
  if (!best) return;
  state.nextBolt = state.time + STORM.interval;
  best.hp -= STORM.damage;
  markDirty(state, best.id);
  state.events.push({
    type: "shot",
    kind: "bolt",
    from: { x: best.x, y: best.y - 8 },
    to: { x: best.x, y: best.y },
  });
}

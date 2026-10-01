// What the map screen shows, worked out from the game state. No DOM in here, so it can be tested.
import {
  BUILDINGS,
  homeDockFor,
  islandAt,
  islandName,
  RESOURCES,
  inHarbour,
  settledIslands,
  stormStrength,
  tileIndex,
  watched,
  type BuildingEntity,
  type GameState,
  type PirateEntity,
  type Resource,
  type ShipEntity,
  type ShipKind,
  type SiteEntity,
  type Stock,
  type StormEntity,
  type WreckEntity,
} from "@explorer/shared";
import { biomeName, describeShip } from "./describe";

export type Goods = Partial<Record<Resource, number>>;

/** Only the goods that are actually there, in the usual order. */
export function goodsList(goods: Goods): { res: Resource; n: number }[] {
  return RESOURCES.filter((r) => (goods[r] ?? 0) > 0).map((res) => ({ res, n: goods[res]! }));
}

export interface IslandRow {
  id: number;
  name: string;
  biome: string;
  x: number;
  y: number;
  radius: number;
  islet: boolean;
  home: boolean;
  settled: boolean;
  villagers: number;
  buildings: number;
  docks: number;
  /** Cargo ships whose trade route collects goods here. */
  cargoShips: number;
  /** Goods on the island: the shared treasury at home, the local pile everywhere else. */
  pile: Goods;
  /** What stops the pile reaching home, if anything: no dock, or no cargo ship. */
  stuck: "dock" | "ship" | null;
}

const nonEmpty = (stock: Partial<Stock> | undefined): Goods => {
  const out: Goods = {};
  if (!stock) return out;
  for (const r of RESOURCES) {
    const n = stock[r] ?? 0;
    if (n > 0) out[r] = n;
  }
  return out;
};

/** Every island the team has found, with what is going on there. */
export function islandRows(state: GameState): IslandRow[] {
  const w = state.world;
  const home = w.start.islandId;
  const settled = settledIslands(state);
  const rows = new Map<number, IslandRow>();
  for (const island of w.islands) {
    if (island.id !== home && !state.discovered.has(island.id)) continue;
    const isHome = island.id === home;
    rows.set(island.id, {
      id: island.id,
      name: islandName(w, island.id),
      biome: biomeName(state, island.id),
      x: island.cx,
      y: island.cy,
      radius: island.radius,
      islet: island.flavor === "islet",
      home: isHome,
      settled: settled.has(island.id),
      villagers: 0,
      buildings: 0,
      docks: 0,
      cargoShips: 0,
      pile: nonEmpty(isHome ? state.stock : state.outposts.get(island.id)),
      stuck: null,
    });
  }
  for (const e of state.entities.values()) {
    if (e.type === "villager" && e.aboard === null) {
      const row = rows.get(islandAt(state, Math.floor(e.x), Math.floor(e.y)));
      if (row) row.villagers++;
    } else if (e.type === "building" && e.kind !== "path") {
      // A harbour's pier is part of the harbour, not a building of its own.
      if (e.kind === "dock" && e.harbour !== undefined) continue;
      const row = rows.get(islandAt(state, e.x, e.y));
      if (!row) continue;
      row.buildings++;
      if ((e.kind === "harbour" || e.kind === "dock") && e.complete) row.docks++;
    } else if (e.type === "ship" && e.kind === "cargo" && e.route !== null) {
      const pickup = state.entities.get(e.route);
      if (pickup?.type === "building") {
        const row = rows.get(islandAt(state, pickup.x, pickup.y));
        if (row) row.cargoShips++;
      }
    }
  }
  for (const row of rows.values()) {
    if (row.home || !row.settled) continue;
    if (row.docks === 0) row.stuck = "dock";
    else if (row.cargoShips === 0) row.stuck = "ship";
  }
  return [...rows.values()];
}

export interface RouteLine {
  shipId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** One line per cargo ship on a route: from the dock it collects at to the dock it unloads at. */
export function routeLines(state: GameState): RouteLine[] {
  const lines: RouteLine[] = [];
  for (const e of state.entities.values()) {
    if (e.type !== "ship" || e.kind !== "cargo" || e.route === null) continue;
    const pickup = state.entities.get(e.route);
    if (pickup?.type !== "building") continue;
    const drop = homeDockFor(state, pickup);
    if (!drop) continue;
    lines.push({
      shipId: e.id,
      from: { x: pickup.x + pickup.w / 2, y: pickup.y + pickup.h / 2 },
      to: { x: drop.x + drop.w / 2, y: drop.y + drop.h / 2 },
    });
  }
  return lines;
}

export interface FleetRow {
  id: number;
  kind: ShipKind;
  /** "Scout ship 2": the ships of a kind are numbered in the order they were built. */
  label: string;
  status: string;
  hull: string;
  hurt: boolean;
  x: number;
  y: number;
}

const KIND_LABEL: Record<ShipKind, string> = {
  scout: "Scout ship",
  cargo: "Cargo ship",
  patrol: "Patrol boat",
};

export function fleetRows(state: GameState): FleetRow[] {
  const ships = [...state.entities.values()]
    .filter((e): e is ShipEntity => e.type === "ship")
    .sort((a, b) => a.id - b.id);
  const seen: Record<ShipKind, number> = { scout: 0, cargo: 0, patrol: 0 };
  return ships.map((s) => {
    const report = describeShip(state, s);
    const status = [report.doing, report.extra].filter(Boolean).join(" · ");
    const max = Number(report.hull.split("/")[1]);
    return {
      id: s.id,
      kind: s.kind,
      label: `${KIND_LABEL[s.kind]} ${++seen[s.kind]}`,
      status: report.route && s.route !== null ? `${status} · ${report.route}` : status,
      hull: report.hull,
      hurt: s.hp < max,
      x: s.x,
      y: s.y,
    };
  });
}

/** Can the team see this pirate: on explored water, and after dark only within a light's reach? */
export function pirateSpotted(state: GameState, p: PirateEntity): boolean {
  const k = tileIndex(state.world, Math.floor(p.x), Math.floor(p.y));
  return state.explored[k] === 1 && watched(state, p.x, p.y);
}

export interface SeaSights {
  /** Pirates the team can see. */
  pirates: PirateEntity[];
  /** Storms over explored water. */
  storms: StormEntity[];
  wrecks: WreckEntity[];
  /** Sunken sites a ship has found, emptied or not. */
  sites: SiteEntity[];
}

/** What is out on the water that the team knows about. */
export function seaSights(state: GameState): SeaSights {
  const w = state.world;
  const sights: SeaSights = { pirates: [], storms: [], wrecks: [], sites: [] };
  for (const e of state.entities.values()) {
    const seen = () => state.explored[tileIndex(w, Math.floor(e.x), Math.floor(e.y))] === 1;
    if (e.type === "pirate" && pirateSpotted(state, e)) sights.pirates.push(e);
    else if (e.type === "storm" && seen() && stormStrength(e) > 0) sights.storms.push(e);
    else if (e.type === "wreck" && seen()) sights.wrecks.push(e);
    else if (e.type === "site" && e.found) sights.sites.push(e);
  }
  return sights;
}

/** Compass point of a place as seen from another, in the isometric view the player looks at. */
export function compassFrom(from: { x: number; y: number }, to: { x: number; y: number }): string {
  // The screen is the grid turned 45 degrees: east on screen is +x and -y.
  const sx = to.x - to.y - (from.x - from.y);
  const sy = to.x + to.y - (from.x + from.y);
  const names = [
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
    "north",
    "north-east",
  ];
  return names[(Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) + 8) % 8]!;
}

export interface Threat {
  pirates: number;
  /** Where the nearest one is, and the town it is heading for or hunting near. */
  nearest: PirateEntity;
  direction: string;
  /** How many are robbing a settlement right now. */
  raiding: number;
  /** The place under attack or most likely to be: the building nearest the nearest pirate. */
  target: BuildingEntity | null;
}

/** The pirates in sight, for the alert banner. Null when the seas are quiet. */
export function currentThreat(state: GameState): Threat | null {
  const pirates: PirateEntity[] = [];
  const buildings: BuildingEntity[] = [];
  for (const e of state.entities.values()) {
    if (e.type === "pirate") {
      if (pirateSpotted(state, e)) pirates.push(e);
    } else if (
      e.type === "building" &&
      e.complete &&
      (e.kind === "harbour" || e.kind === "dock" || BUILDINGS[e.kind].dropOff)
    )
      buildings.push(e);
  }
  if (pirates.length === 0) return null;
  const hall = state.world.start.townHall;
  const ahead = (p: PirateEntity) => Math.hypot(p.x - hall.x, p.y - hall.y);
  pirates.sort((a, b) => ahead(a) - ahead(b));
  const nearest = pirates[0]!;
  let target: BuildingEntity | null = null;
  for (const b of buildings) {
    if (
      !target ||
      Math.hypot(b.x - nearest.x, b.y - nearest.y) <
        Math.hypot(target.x - nearest.x, target.y - nearest.y)
    )
      target = b;
  }
  return {
    pirates: pirates.length,
    nearest,
    direction: compassFrom(hall, nearest),
    raiding: pirates.filter((p) => p.phase === "raid").length,
    target,
  };
}

export interface StormWarning {
  storm: StormEntity;
  direction: string;
  /** Ships of ours that are out in the open and close to it. */
  ships: number;
}

/** The storm to warn about: one in sight with unsheltered ships near it. Null when none. */
export function currentStorm(state: GameState): StormWarning | null {
  if (state.upgrades.has("calm_waters")) return null;
  const hall = state.world.start.townHall;
  const ships = [...state.entities.values()].filter(
    (e): e is ShipEntity => e.type === "ship" && !inHarbour(state, e),
  );
  let best: StormWarning | null = null;
  for (const storm of seaSights(state).storms) {
    const near = ships.filter((s) => Math.hypot(s.x - storm.x, s.y - storm.y) <= storm.radius + 16);
    if (near.length === 0) continue;
    if (!best || near.length > best.ships)
      best = { storm, direction: compassFrom(hall, storm), ships: near.length };
  }
  return best;
}

/** Which way a storm is heading, as the screen shows it. */
export function stormHeading(storm: StormEntity): string {
  return compassFrom({ x: 0, y: 0 }, { x: storm.vx, y: storm.vy });
}

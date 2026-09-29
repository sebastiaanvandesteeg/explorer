// Plain-text descriptions of things in the world, shared by the selection panel and the map.
import {
  cargoCapacity,
  cargoLoad,
  discoveryName,
  islandAt,
  islandName,
  pirateMaxHp,
  RESOURCES,
  SHIP,
  shipMaxHp,
  type GameState,
  type PirateEntity,
  type ShipEntity,
  type SiteEntity,
  type Stock,
} from "@explorer/shared";

/** "Wrenhaven" — an island's own name. */
export function describeIsland(state: GameState, islandId: number): string {
  return state.world.islands[islandId] ? islandName(state.world, islandId) : "another island";
}

/** "the Greenlands", "Murkmire": what kind of place an island is. */
export function biomeName(state: GameState, islandId: number): string {
  const island = state.world.islands[islandId];
  return island ? discoveryName(island.biome).replace(/^the /, "The ") : "open sea";
}

export function goodsText(goods: Partial<Stock>): string {
  const items = RESOURCES.filter((r) => (goods[r] ?? 0) > 0).map((r) => `${goods[r]} ${r}`);
  return items.length > 0 ? items.join(", ") : "nothing";
}

export function describePirate(state: GameState, p: PirateEntity): string {
  const what =
    p.phase === "raid" ? "Robbing a settlement" : p.phase === "flee" ? "Fleeing" : "Hunting";
  const loot = Object.values(p.loot).reduce((n, v) => n + (v ?? 0), 0);
  return `${what} · Hull ${Math.ceil(p.hp)}/${pirateMaxHp(state)}${loot > 0 ? ` · ${loot} goods stolen` : ""}`;
}

export interface ShipReport {
  /** What the ship is doing right now. */
  doing: string;
  /** Load, passengers and the like. */
  extra: string | null;
  hull: string;
  /** Cargo ships: where the trade route collects from. */
  route: string | null;
}

export function describeShip(state: GameState, ship: ShipEntity): ShipReport {
  const hull = `Hull ${Math.ceil(ship.hp)}/${shipMaxHp(state, ship.kind)}`;
  if (ship.kind === "patrol") {
    const doing = ship.hunt ? "Chasing pirates" : ship.dest ? "Sailing…" : "On patrol";
    return { doing, extra: null, hull, route: null };
  }
  if (ship.kind === "cargo") {
    const dock = ship.route === null ? undefined : state.entities.get(ship.route);
    const route =
      dock?.type === "building"
        ? `Route: ${describeIsland(state, islandAt(state, dock.x, dock.y))}`
        : "No trade route";
    const doing =
      ship.route === null
        ? "Idle"
        : ship.dest
          ? ship.leg === "drop"
            ? "Sailing home"
            : "Sailing to collect"
          : ship.leg === "pickup"
            ? "Waiting for goods"
            : "In port";
    return { doing, extra: `${cargoLoad(ship)}/${cargoCapacity(state)} goods`, hull, route };
  }
  const doing = ship.dive
    ? "Divers below…"
    : ship.salvage
      ? "Salvaging…"
      : ship.dest
        ? "Sailing…"
        : "Anchored";
  return { doing, extra: `${ship.passengers.length}/${SHIP.capacity} aboard`, hull, route: null };
}

/** The closest uncleared sunken site within reach of a ship. */
export function nearestSite(state: GameState, ship: ShipEntity): SiteEntity | null {
  let best: SiteEntity | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "site" || !e.found) continue;
    if (!Object.values(e.loot).some((n) => (n ?? 0) > 0)) continue;
    const d = Math.hypot(e.x - ship.x, e.y - ship.y);
    if (d <= 14 && (!best || d < Math.hypot(best.x - ship.x, best.y - ship.y))) best = e;
  }
  return best;
}

// The Great Work as the player sees it: what each stage asks for, where to find it and how far the
// team has got, and the chronicle of the expedition shown when it is finished. No DOM in here.
import {
  BIOME_DEFS,
  canAfford,
  dayNumber,
  DIFFICULTY_DEFS,
  greatWorkStages,
  islandName,
  population,
  RESOURCES,
  settledIslands,
  signatureGoods,
  TRIBE_DEFS,
  UPGRADE_IDS,
  type BuildingEntity,
  type GameState,
  type Resource,
} from "@explorer/shared";

export interface GoodRow {
  res: Resource;
  need: number;
  have: number;
  /** Where to look for it, when that is not obvious. */
  hint: string | null;
}

export interface StageRow {
  index: number;
  name: string;
  blurb: string;
  /** Finished, being built now, the one to fund next, or further off. */
  state: "done" | "building" | "next" | "later";
  cost: GoodRow[];
  /** The treasury covers it. */
  ready: boolean;
}

export function greatWorkOf(state: GameState): BuildingEntity | null {
  for (const e of state.entities.values())
    if (e.type === "building" && e.kind === "great_work") return e;
  return null;
}

/** Where a good comes from, for the goods that need explaining. */
export function goodHint(state: GameState, res: Resource): string | null {
  const sig = signatureGoods().find((g) => g.resource === res);
  if (sig) {
    const found = state.world.islands
      .filter((i) => i.biome === sig.biome && i.flavor !== "islet" && state.discovered.has(i.id))
      .map((i) => islandName(state.world, i.id));
    const where = BIOME_DEFS[sig.biome].name;
    return found.length > 0
      ? `${where}: ${found.slice(0, 3).join(", ")}`
      : `${where}: not found yet`;
  }
  switch (res) {
    case "relic":
      return "Wrecks, sunken ruins and fortresses";
    case "faith":
      return "Churches";
    case "tools":
      return "The blacksmith";
    case "gold":
      return "The market, gold veins and salvage";
    default:
      return null;
  }
}

export function stageRows(state: GameState, gw: BuildingEntity | null): StageRow[] {
  const stage = gw?.stage ?? 0;
  return greatWorkStages(state.world).map((s, index) => {
    const cost = RESOURCES.filter((r) => (s.cost[r] ?? 0) > 0).map((res) => ({
      res,
      need: s.cost[res]!,
      have: state.stock[res],
      hint: goodHint(state, res),
    }));
    const rowState: StageRow["state"] =
      index < stage
        ? "done"
        : index === stage
          ? gw && !gw.complete
            ? "building"
            : "next"
          : "later";
    return {
      index,
      name: s.name,
      blurb: s.blurb,
      state: rowState,
      cost,
      ready: index === stage && !!gw?.complete && canAfford(state.stock, s.cost),
    };
  });
}

export interface ChronicleRow {
  label: string;
  value: string;
}

/** The story of the expedition so far, in numbers. */
export function chronicleRows(state: GameState): ChronicleRow[] {
  const w = state.world;
  const real = w.islands.filter((i) => i.flavor !== "islet");
  const found = real.filter((i) => state.discovered.has(i.id)).length;
  const buildings = [...state.entities.values()].filter(
    (e) => e.type === "building" && e.kind !== "path",
  ).length;
  const s = state.stats;
  return [
    {
      label: "Tribe",
      value: `${TRIBE_DEFS[w.tribe].name} (${DIFFICULTY_DEFS[state.difficulty].name})`,
    },
    { label: "Days at sea", value: String(dayNumber(s.wonderAt ?? state.time)) },
    { label: "Islands found", value: `${found} of ${real.length}` },
    { label: "Islands settled", value: String(settledIslands(state).size) },
    { label: "Villagers", value: String(population(state)) },
    { label: "Buildings raised", value: String(buildings) },
    { label: "Goods hauled home by sea", value: String(s.hauled) },
    { label: "Wrecks and sunken sites salvaged", value: String(s.salvaged) },
    { label: "Pirate ships sunk", value: String(s.pirates) },
    { label: "Ships lost", value: String(s.shipsLost) },
    { label: "Raids on your stores", value: String(s.raids) },
    { label: "Storms weathered", value: String(s.storms) },
    { label: "Upgrades learned", value: `${state.upgrades.size} of ${UPGRADE_IDS.length}` },
  ];
}

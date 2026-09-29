// Names for islands, so a map can say more than "the desert to the north-east". They are derived
// from the world seed and the island's biome and shape, so every player sees the same names and
// nothing needs saving.
import { hashSeed } from "../rng";
import type { BiomeId } from "./biomes";
import type { IslandFlavor, WorldMap } from "./types";

const PREFIXES: Record<BiomeId, readonly string[]> = {
  temperate: ["Alder", "Fair", "Green", "Oak", "Mead", "Bram", "Wren", "Lark", "Hazel", "Elm"],
  desert: ["Sun", "Saha", "Dune", "Ochre", "Ras", "Zahr", "Kesh", "Mirage", "Scorch", "Tamar"],
  infernal: ["Cinder", "Ash", "Ember", "Blaze", "Char", "Sear", "Pyre", "Brim", "Soot", "Smolder"],
  tundra: ["Frost", "Rime", "Nor", "Skadi", "Hoar", "Snow", "Ice", "Grim", "Bjorn", "Yule"],
  jungle: ["Tam", "Bora", "Kuri", "Zan", "Mango", "Vine", "Rain", "Ayu", "Liana", "Orchid"],
  swamp: ["Mire", "Bog", "Murk", "Fen", "Reed", "Dank", "Peat", "Gloam", "Toad", "Lurk"],
  fungal: ["Spore", "Cap", "Mush", "Gill", "Myc", "Puff", "Truff", "Damp", "Glow", "Morel"],
  crystal: ["Prism", "Lumen", "Gleam", "Quartz", "Spire", "Aether", "Shard", "Opal", "Sky", "Halo"],
  autumn: [
    "Russet",
    "Fall",
    "Maple",
    "Rust",
    "Harvest",
    "Gold",
    "Copper",
    "Acorn",
    "Sienna",
    "Umber",
  ],
  blossom: [
    "Petal",
    "Bloom",
    "Rose",
    "Cherry",
    "Lilac",
    "Honey",
    "Iris",
    "Peony",
    "Dew",
    "Wisteria",
  ],
};

const SUFFIXES: Record<Exclude<IslandFlavor, "islet">, readonly string[]> = {
  home: ["haven", "landing", "harbour"],
  wooded: ["wood", "holt", "grove", "weald"],
  fertile: ["meadow", "field", "vale", "acre"],
  rocky: ["crag", "tor", "scar", "fell"],
};

const ISLET_WORDS = ["Skerry", "Stack", "Rock", "Cay", "Key", "Holm"];
const ISLET_PREFIXES = ["Gull", "Kelp", "Brine", "Spray", "Tern", "Shag", "Limpet", "Barnacle"];

const cache = new WeakMap<WorldMap, readonly string[]>();

function nameFor(world: WorldMap, id: number, attempt: number): string {
  const island = world.islands[id]!;
  const h = hashSeed(`${world.seed}:isle:${id}:${attempt}`);
  const pick = <T>(list: readonly T[], salt: number): T =>
    list[Math.floor(((h >>> salt) ^ Math.imul(h, 2654435761 + salt)) >>> 0) % list.length]!;
  if (island.flavor === "islet") {
    return `${pick(ISLET_PREFIXES, 3)} ${pick(ISLET_WORDS, 11)}`;
  }
  const prefix = pick(PREFIXES[island.biome], 5);
  const suffix = pick(SUFFIXES[island.flavor], 13);
  return `${prefix}${suffix}`;
}

/** Every island's name, by island id. Unique within a world. */
export function islandNames(world: WorldMap): readonly string[] {
  let names = cache.get(world);
  if (names) return names;
  const used = new Set<string>();
  const out: string[] = [];
  for (const island of world.islands) {
    let name = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      name = nameFor(world, island.id, attempt);
      if (!used.has(name)) break;
    }
    // Vanishingly rare: 40 collisions in a row. Number it rather than repeat a name.
    if (used.has(name)) name = `${name} ${island.id + 1}`;
    used.add(name);
    out.push(name);
  }
  names = out;
  cache.set(world, names);
  return names;
}

export function islandName(world: WorldMap, islandId: number): string {
  return islandNames(world)[islandId] ?? "Uncharted waters";
}

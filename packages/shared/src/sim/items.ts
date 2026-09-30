// Items: what a player carries about in an adventure world. They are separate from the settlement's
// stock of goods (which villagers earn and buildings spend): an item belongs to whoever holds it,
// can be dropped on land for anyone to pick up, and can be found lying about or in sunken places.
import type { BiomeId } from "../world/biomes";

export const ITEM_KINDS = [
  "bread",
  "timber",
  "stone",
  "ore",
  "rope",
  "lantern",
  "old_coin",
  "rusty_key",
  "sea_glass",
  "pearl",
  "amber",
  "crystal_shard",
  "relic_shard",
  "map_scrap",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Rarity = "common" | "uncommon" | "rare";

export interface ItemDef {
  name: string;
  blurb: string;
  /** How many fit in one slot. */
  stack: number;
  rarity: Rarity;
  /** Colours of the little icon (0xRRGGBB): body, then highlight. */
  colour: [number, number];
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  bread: {
    name: "Bread",
    blurb: "A warm loaf. Good for the road.",
    stack: 10,
    rarity: "common",
    colour: [0xd9a05b, 0xf3d08f],
  },
  timber: {
    name: "Timber",
    blurb: "A sturdy plank, cut and ready.",
    stack: 20,
    rarity: "common",
    colour: [0x9a6a3a, 0xc99a62],
  },
  stone: {
    name: "Stone",
    blurb: "A good building stone.",
    stack: 20,
    rarity: "common",
    colour: [0x8d9399, 0xc4c9ce],
  },
  ore: {
    name: "Iron ore",
    blurb: "Heavy, rust-streaked rock.",
    stack: 20,
    rarity: "common",
    colour: [0x6d5a52, 0xb98a72],
  },
  rope: {
    name: "Rope",
    blurb: "Twenty fathoms of tarred rope.",
    stack: 5,
    rarity: "common",
    colour: [0xb59a66, 0xe0cc94],
  },
  lantern: {
    name: "Lantern",
    blurb: "It burns low and steady, however the wind blows.",
    stack: 1,
    rarity: "uncommon",
    colour: [0xd9b338, 0xfff0a0],
  },
  old_coin: {
    name: "Old coin",
    blurb: "Stamped with a face nobody remembers.",
    stack: 50,
    rarity: "uncommon",
    colour: [0xc99a2e, 0xf7dc78],
  },
  rusty_key: {
    name: "Rusty key",
    blurb: "It fits a lock somewhere. Probably.",
    stack: 1,
    rarity: "uncommon",
    colour: [0x8a5a3c, 0xc88a5e],
  },
  sea_glass: {
    name: "Sea glass",
    blurb: "Worn smooth by a hundred years of tides.",
    stack: 10,
    rarity: "uncommon",
    colour: [0x5fc2b0, 0xbdf2e6],
  },
  pearl: {
    name: "Pearl",
    blurb: "Cool and perfectly round.",
    stack: 5,
    rarity: "rare",
    colour: [0xe8e4f0, 0xffffff],
  },
  amber: {
    name: "Amber",
    blurb: "Something small and ancient sleeps inside.",
    stack: 5,
    rarity: "rare",
    colour: [0xe0892a, 0xffc766],
  },
  crystal_shard: {
    name: "Crystal shard",
    blurb: "It hums when you hold it still.",
    stack: 5,
    rarity: "rare",
    colour: [0x7a6bf0, 0xc8c0ff],
  },
  relic_shard: {
    name: "Relic shard",
    blurb: "A piece of the people from before.",
    stack: 3,
    rarity: "rare",
    colour: [0x58d6e8, 0xd6fbff],
  },
  map_scrap: {
    name: "Map scrap",
    blurb: "Half a coast, and a cross where the other half should be.",
    stack: 1,
    rarity: "rare",
    colour: [0xd8c79a, 0xf4ead0],
  },
};

export const isItemKind = (v: unknown): v is ItemKind =>
  typeof v === "string" && (ITEM_KINDS as readonly string[]).includes(v);

export interface ItemStack {
  kind: ItemKind;
  amount: number;
}

/** Slots in a character's pack. */
export const PACK_SLOTS = 12;

/** What every character starts with. */
export const STARTER_PACK: ItemStack[] = [{ kind: "bread", amount: 3 }];

/** What lies about on islands of each biome, besides everyday things. */
export const BIOME_TREASURE: Record<BiomeId, ItemKind> = {
  temperate: "old_coin",
  desert: "amber",
  infernal: "relic_shard",
  tundra: "sea_glass",
  jungle: "pearl",
  swamp: "rusty_key",
  fungal: "pearl",
  crystal: "crystal_shard",
  autumn: "amber",
  blossom: "map_scrap",
};

/**
 * Put items into a pack, topping up matching stacks before using free slots. Returns how many did
 * not fit. The pack is changed in place.
 */
export function addToPack(pack: ItemStack[], kind: ItemKind, amount: number): number {
  const max = ITEMS[kind].stack;
  let left = amount;
  for (const s of pack) {
    if (left <= 0) break;
    if (s.kind !== kind || s.amount >= max) continue;
    const put = Math.min(max - s.amount, left);
    s.amount += put;
    left -= put;
  }
  while (left > 0 && pack.length < PACK_SLOTS) {
    const put = Math.min(max, left);
    pack.push({ kind, amount: put });
    left -= put;
  }
  return left;
}

/** How many of this kind would fit in the pack right now. */
export function packRoom(pack: readonly ItemStack[], kind: ItemKind): number {
  const max = ITEMS[kind].stack;
  let room = Math.max(0, PACK_SLOTS - pack.length) * max;
  for (const s of pack) if (s.kind === kind) room += max - s.amount;
  return room;
}

/** Take up to `amount` out of a slot (removing it when empty); returns what was taken. */
export function takeFromPack(pack: ItemStack[], slot: number, amount: number): ItemStack | null {
  const s = pack[slot];
  if (!s || !(amount >= 1)) return null;
  const n = Math.min(Math.floor(amount), s.amount);
  s.amount -= n;
  const taken = { kind: s.kind, amount: n };
  if (s.amount <= 0) pack.splice(slot, 1);
  return taken;
}

// The story of the Sundered Sea. Each chapter is dressed in a biome: scrolling the page turns the
// whole site into whichever chapter is on screen. Names, homes and gifts of the tribes come from
// the game data (TRIBE_DEFS / BIOME_DEFS); the stories are told here.
import type { BiomeId } from "@explorer/shared";

interface Chapter {
  id: string;
  title: string;
  /** The biome the page is dressed in while this chapter is on screen. */
  theme: BiomeId;
  /** Shown above the title. */
  kicker: string;
  paragraphs: string[];
  /** Short facts, shown as labelled cards. */
  facts?: { label: string; value: string }[];
  proverb?: string;
  /** Show this biome's plants and rocks under the title. */
  skyline?: boolean;
}

/** Chapter headings that stand apart from the biome chapters in the side menu. */
export const PART_TITLES = { tale: "The tale", isles: "The isles", beyond: "Beyond" } as const;
export type Part = keyof typeof PART_TITLES;

export interface LoreEntry extends Chapter {
  part: Part;
  /** For isle chapters: the tribe that lives there (a key of TRIBE_DEFS). */
  tribe?:
    | "islanders"
    | "northfolk"
    | "sunfolk"
    | "sylvan"
    | "glowkin"
    | "freebooters"
    | "mirefolk"
    | "amberwrights"
    | "cinderborn";
}

export const LORE: LoreEntry[] = [
  {
    id: "the-hearth",
    part: "tale",
    title: "The Hearth",
    theme: "temperate",
    kicker: "Before",
    paragraphs: [
      "There was once one land, and it was called the Hearth. It was not large, but it was kind: green enough to feed everyone, stony enough to build with, and warm in the middle where the first fire was lit and never let go out.",
      "The people of the Hearth learned the world by walking it. They learned which mushroom fed and which one did not, which stone split clean, which tree made a mast. They named the winds. They were, in every way that mattered, at home.",
    ],
    proverb: "Keep the fire and the fire keeps you.",
    skyline: true,
  },
  {
    id: "the-sundering",
    part: "tale",
    title: "The Sundering",
    theme: "infernal",
    kicker: "The night the ground gave way",
    paragraphs: [
      "Nobody agrees on what woke beneath the Hearth. The Cinderborn say a fire older than the first fire. The Glowkin say the ground was only tired. The Freebooters say it was a debt coming due.",
      "What everyone agrees on is the sound, and then the sea. In one night the Hearth broke into a thousand islands and the water came in between them. The great fire went out. What was left of the people found themselves on small green plots, each certain they were the last.",
      "They were wrong. Over the years that followed, every island learned it was not alone, usually by watching a sail go past.",
    ],
    facts: [
      { label: "What broke", value: "The Hearth, into islands of every climate" },
      { label: "What remained", value: "Nine peoples, and the sea between them" },
    ],
  },
  {
    id: "greenlands",
    part: "isles",
    title: "The Greenlands",
    theme: "temperate",
    tribe: "islanders",
    kicker: "Where the fire was first lit",
    paragraphs: [
      "The Islanders kept the most of what the Hearth had been: soft hills, oak and pine, berries by the path. Because the Greenlands are easy, the Islanders had time to look at the horizon, and so they became the first people to build a hull that could cross it.",
      "They do not think of the sea as a wall. They think of it as a road nobody has finished.",
    ],
    proverb: "A full hold is just a short trip.",
    skyline: true,
  },
  {
    id: "frostfang",
    part: "isles",
    title: "The Frozen North",
    theme: "tundra",
    tribe: "northfolk",
    kicker: "Where the night is long",
    paragraphs: [
      "The Northfolk raise log halls on islands of pine and snow, and they raise them quickly, because winter does not wait. Their axes are the best in the sea and their songs are mostly about axes.",
      "They trade timber south and come home with stories. Nobody is certain which they value more.",
    ],
    proverb: "Cut twice the wood you need; the winter will need the rest.",
    skyline: true,
  },
  {
    id: "dunes",
    part: "isles",
    title: "The Sunscorch Dunes",
    theme: "desert",
    tribe: "sunfolk",
    kicker: "Where the stone is warm",
    paragraphs: [
      "The Sunfolk build in sandstone and they build for centuries. Their cities hold the heat all night, their cisterns are cut into the rock, and their veins of gold are the reason the rest of the sea has learned to pay attention to the dunes.",
      "They are patient. They once outwaited a storm for eleven days and considered it a short conversation.",
    ],
    proverb: "The mountain is only a slow caravan.",
    skyline: true,
  },
  {
    id: "blossom",
    part: "isles",
    title: "The Blossom Isles",
    theme: "blossom",
    tribe: "sylvan",
    kicker: "Where it is always the first week of spring",
    paragraphs: [
      "The Sylvan keep gardens the way other peoples keep armies. Their isles are drifted with petals, their orchards outlive generations, and every tree has a name and a chair beneath it.",
      "They are the gentlest of the nine, which is not the same as the softest. The pirates of the sea have learned this once each.",
    ],
    proverb: "Plant for the ones who will outlive the shade.",
    skyline: true,
  },
  {
    id: "luminous",
    part: "isles",
    title: "The Glowing Caverns",
    theme: "fungal",
    tribe: "glowkin",
    kicker: "Where the dark is friendly",
    paragraphs: [
      "The Glowkin tend forests of mushrooms taller than houses, lit from within. Their islands are never quite night, never quite day: a soft blue twilight that the Glowkin say is the colour the Hearth remembers.",
      "They are the best at listening. Ask them about the Sundering and they will tell you what the ground said.",
    ],
    proverb: "Even the dark has a shine, if you let your eyes rest.",
    skyline: true,
  },
  {
    id: "jungle",
    part: "isles",
    title: "The Verdant Jungle",
    theme: "jungle",
    tribe: "freebooters",
    kicker: "Where everyone owes everyone",
    paragraphs: [
      "Beneath the canopy of the jungle isles sits the free port of the Freebooters: a town of rope bridges, rum barrels and handshake contracts. They are traders first, raiders when the trade is poor, and sentimental about the difference.",
      "Every ship in the sea has, at some point, bought something from the Freebooters it didn't quite mean to.",
    ],
    proverb: "A deal is a knot; tie it tight and loosen it for friends.",
    skyline: true,
  },
  {
    id: "mire",
    part: "isles",
    title: "The Murky Mire",
    theme: "swamp",
    tribe: "mirefolk",
    kicker: "Where the water is the path",
    paragraphs: [
      "The Mirefolk live on stilts above the swamp, in houses of reed and salvaged timber, and know every hidden channel by smell. They brew, they boil, and they remember the names of everything that has ever drowned.",
      "Strangers get lost in the Mire. Friends get lost on the way out, on purpose, for another cup.",
    ],
    proverb: "Still water keeps its secrets and pays them back with interest.",
    skyline: true,
  },
  {
    id: "amberwood",
    part: "isles",
    title: "Amberwood",
    theme: "autumn",
    tribe: "amberwrights",
    kicker: "Where the year is always turning",
    paragraphs: [
      "The Amberwrights build in copper and resin, and their forests are a fixed October. The leaves fall and are sold by the barrow, the orchards never quite finish, and every house has a workshop in the back.",
      "They make things, endlessly, and they will make you one if you stand still long enough.",
    ],
    proverb: "The best tool is the one you finished.",
    skyline: true,
  },
  {
    id: "ashfall",
    part: "isles",
    title: "The Infernal Isles",
    theme: "infernal",
    tribe: "cinderborn",
    kicker: "Where the ground remembers",
    paragraphs: [
      "The Cinderborn live where the Sundering was deepest. Their islands smoulder, their streams run hot, and their forges never go cold. They are the keepers of the oldest fire left in the sea, and they will tell you so.",
      "Of all the peoples, they alone were not surprised by what happened to the Hearth. They do not say what that means.",
    ],
    proverb: "What burns can be rebuilt. What was never lit cannot.",
    skyline: true,
  },
  {
    id: "the-deeps",
    part: "beyond",
    title: "The Sunken Deeps",
    theme: "crystal",
    kicker: "What the water took",
    paragraphs: [
      "Where the Hearth was deepest, the ground fell furthest, and the crystal isles grew out of the wreck: cold, bright, and humming faintly. Beneath the waves lie the old fortresses and ruins of the people from before the people, and sometimes a low blue light moves between them.",
      "Explorers who come back from the Deeps bring relics. They do not agree on what the relics are for, only that the sea seems to want them back.",
    ],
    facts: [
      { label: "Found in", value: "Sunken fortresses and ruins across the sea" },
      { label: "Brought back", value: "Relics, each a little warm" },
    ],
    skyline: true,
  },
  {
    id: "the-raiders",
    part: "beyond",
    title: "The Raiders",
    theme: "swamp",
    kicker: "Dusk, sails on the horizon",
    paragraphs: [
      "Not everyone on the water wants to trade. Black-sailed raiders come at dusk, from over the horizon, looking for unguarded stockpiles and untended docks. Nobody knows where they sleep. Whoever they are, they have studied what a settlement can't spare.",
      "The sea has storms too, and they drift towards light. A village that burns a lantern is a village that has to decide how much it is willing to be found.",
    ],
    proverb: "Burn a light. Keep a blade by it.",
  },
  {
    id: "the-great-work",
    part: "beyond",
    title: "The Great Work",
    theme: "autumn",
    kicker: "What the nine agree on",
    paragraphs: [
      "The one thing all nine peoples share is the dream: the Hearth, relit. A monument on one island big enough to be seen from every other, raised by a settlement that has learned enough of the sea to feed, arm and shelter itself all at once.",
      "It takes three builders, much of a village's wealth, and a great many quiet evenings. When it stands, the old people say, the fire will be visible from every shore again.",
      "You begin on one island, with a few villagers and a patient sea. The rest is the story.",
    ],
    proverb: "We were one fire. We will be one fire.",
    skyline: true,
  },
];

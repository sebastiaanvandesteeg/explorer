// The release notes. Each release names the biome that dresses its page: open the notes for
// "Black Sails" and the whole site turns into the Infernal Isles, with embers rising over it.
//
// To add a release, put a new entry at the TOP of RELEASES (newest first) with a unique `slug`
// (it becomes /news/<slug>) and pick a `theme` from the ten biomes. To tweak that theme for one
// release only, give `themeOverrides` any of the variables in theme.ts (for example
// { "--t-accent": "#ff9ab8" }).
import type { BiomeId } from "@explorer/shared";
import type { ThemeVar } from "../theme";

export type NoteKind = "new" | "improved" | "fixed";

export interface ReleaseSection {
  kind: NoteKind;
  /** Shown as the section's heading; defaults to the kind's own label. */
  title?: string;
  items: string[];
}

export interface Release {
  slug: string;
  version: string;
  title: string;
  /** ISO date (YYYY-MM-DD); the news page groups releases by month. */
  date: string;
  /** The biome that dresses this release's page. */
  theme: BiomeId;
  themeOverrides?: Partial<Record<ThemeVar, string>>;
  /** One or two sentences for the news list and the top of the page. */
  summary: string;
  /** A picture from the game shown on the release's page. */
  image?: "screenshot" | "biomes" | "daynight" | "hero";
  intro?: string[];
  sections: ReleaseSection[];
}

export const NOTE_LABELS: Record<NoteKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

export const RELEASES: Release[] = [
  {
    slug: "free-roaming",
    version: "0.15",
    title: "Free Roaming",
    date: "2026-09-30",
    theme: "jungle",
    summary:
      "Walking is faster and smoother: move freely with WASD, and slip past trees and rocks that now block only where they really stand.",
    sections: [
      {
        kind: "improved",
        items: [
          "WASD and the arrow keys now move your character continuously instead of hopping from tile to tile, and letting go stops you on the spot.",
          "Your character is much faster: 5.5 tiles a second, up from 3.",
          "Trees block only at their trunk, boulders, ore and crystals at their base. Squeeze between two trees and brush past them, and walk straight through bushes, flowers, mushrooms and pumpkins.",
          "The camera follows a little more tightly.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "The flag that marked where you were walking is gone.",
          "A tree no longer fills its whole tile when you walk by.",
        ],
      },
    ],
  },
  {
    slug: "come-in",
    version: "0.14",
    title: "Come In",
    date: "2026-09-30",
    theme: "autumn",
    summary:
      "Step through the door of the town hall, houses, market and more: every building has a furnished room and someone inside who does its business.",
    intro: [
      "Buildings are no longer things you click for a menu. Walk up and go in: the world goes black around a small, furnished room, and the person inside is who you talk to.",
    ],
    sections: [
      {
        kind: "new",
        items: [
          "Enter the town hall, houses, market, blacksmith, church, magic house, Great Work and dock. Each has its own furniture: beds and hearths, counters and crates, forges, pews, bookshelves, a model of the monument.",
          "Every room has an NPC with a name. Talk to the steward to welcome villagers, the merchant to trade, the sage to learn upgrades, the harbourmaster to build ships, the architect to fund the Great Work.",
          "Walk about inside with WASD or a click, see other players in the same room, and leave through the door, the Leave button or Esc.",
        ],
      },
      {
        kind: "improved",
        items: [
          "Building business is now done in person: the server only accepts it from a player standing next to the right NPC.",
          "Farms, camps, quarries, mines, storehouses and the lighthouse keep their info panel, since there is nobody to talk to there.",
          "The rooms are drawn in the same pixel art as the island: planked or flagstone floors, walls in your tribe's own architecture (log, adobe, bark, basalt…), shaded and outlined furniture, cast shadows and glowing fires.",
        ],
      },
    ],
  },
  {
    slug: "one-way-to-play",
    version: "0.13",
    title: "One Way to Play",
    date: "2026-09-30",
    theme: "temperate",
    summary:
      "Colony mode is gone: every world is an adventure, with a character of your own, a pack, and villagers who run the settlement.",
    intro: [
      "Explorer used to ask how you wanted to play. Now there is one answer. Every world is an adventure: you are a person on the islands, not a hand above them.",
    ],
    sections: [
      {
        kind: "improved",
        items: [
          "The lobby no longer asks for a game mode, and every world gives each player a character, a pack and items to find.",
          "Villagers always organise themselves: they raise buildings and share out the jobs by balance.",
          "Hover a building or a villager and a soft glow shows you can click it.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "A villager carrying goods on an island with no storehouse can now still go and build one.",
        ],
      },
      {
        kind: "new",
        title: "Gone",
        items: [
          "Colony mode, and the Gather tool with its marks: villagers choose what to gather themselves.",
        ],
      },
    ],
  },
  {
    slug: "hands-at-work",
    version: "0.12",
    title: "Hands at Work",
    date: "2026-09-30",
    theme: "autumn",
    summary:
      "In adventure worlds the villagers organise themselves, your character stands out in a cape of your colour, and the site gets real pages.",
    image: "screenshot",
    intro: [
      "Adventure worlds took a big step towards feeling lived in. Nobody tells the villagers what to do any more: they raise what needs raising and spread themselves over the jobs the settlement needs.",
    ],
    sections: [
      {
        kind: "new",
        items: [
          "Villagers build on their own. When a building needs raising, the nearest villager drops whatever they are doing and builds it, then looks for new work.",
          "Jobs are shared out by balance: about 30% wood, 25% food, 15% stone, 15% ore, 10% tools and 5% faith, nudged towards whatever the treasury is short of.",
          "New workplaces get a worker even when everyone is busy: every few seconds a hand-gatherer from the most crowded job moves over.",
          "Your character is drawn a quarter larger than a villager, in your tribe's dress, with a cape and sash in your player colour.",
          "WASD and the arrow keys walk your character, sliding along walls.",
          "News, The Lore and About pages, with a theme from the game's biomes for every release and every chapter of the lore.",
        ],
      },
      {
        kind: "improved",
        items: [
          "The camera is bound to your character in adventure worlds.",
          "The landing page shows real gameplay instead of the concept art, and its pictures are retaken with the current art.",
        ],
      },
      {
        kind: "fixed",
        items: ["Villagers gathering by hand no longer leave gather marks over the plants."],
      },
    ],
  },
  {
    slug: "the-wide-sea",
    version: "0.11",
    title: "The Wide Sea",
    date: "2026-09-29",
    theme: "tundra",
    summary:
      "The archipelago grew ten times bigger: a grid of biome regions, each as big as a whole old world, with three islands of their own.",
    image: "biomes",
    intro: [
      "The world was small. Now it is 768 by 576 tiles, and every biome has a region of sea to call its own.",
    ],
    sections: [
      {
        kind: "new",
        items: [
          "Ten biome regions in a 4 by 3 grid, each 192 by 192 tiles. The two furthest from home stay open sea.",
          "Every biome has exactly three islands (one wooded, one fertile, one rocky) plus five to nine islets.",
          "The sea belongs to a biome too: fog, colour grade and ambience change as you sail between regions, along borders that wander instead of following the grid.",
          "Sunken fortresses and ruins are spread over the whole sea in proportion to its size.",
        ],
      },
      {
        kind: "improved",
        items: [
          "Ships plan routes across the whole map: sea pathfinding uses an exact-distance search with a bigger budget.",
          "Raiders and storms form 55 to 115 tiles from somewhere your team is, a settled island or a ship, so a raid takes about as long to arrive wherever you are.",
          "The fog of war is drawn in blocks and only the ones a reveal touches are redrawn: about 2 ms instead of 150 ms while exploring.",
          "The chart of the archipelago scales down to fit the whole map.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "Placing a building no longer freezes the renderer: the build preview asked for a sprite that only exists per tribe.",
        ],
      },
    ],
  },
  {
    slug: "sharper-pixels",
    version: "0.10",
    title: "Sharper Pixels",
    date: "2026-09-29",
    theme: "blossom",
    summary:
      "Buildings, trees, rocks and ships are drawn at twice the pixel density, with finer shingles, windows, doors and leaves.",
    image: "screenshot",
    sections: [
      {
        kind: "new",
        items: [
          "Everything ray-cast is rendered at double resolution and shown at half scale: the same size on the map with twice the pixels.",
          "Shingle, thatch, plank, brick and log courses are about 40% finer, with a shadow under each shingle course and a glint on its upper edge.",
          "Windows have frames, sills, lintels and mullions; doors have boards, iron hinges, a ring handle and a step.",
          "Foliage gets a second layer of leaf-sized bumps and a scalloped rim of small clumps; rocks carry grit, hairline cracks and moss tufts.",
        ],
      },
      {
        kind: "improved",
        items: [
          "Walls streak with rain and darken with damp near the ground.",
          "Night-window glows stay in the right place whatever a sprite's density.",
        ],
      },
    ],
  },
  {
    slug: "adventure-preview",
    version: "0.9",
    title: "Adventure Preview",
    date: "2026-09-29",
    theme: "swamp",
    summary:
      "The first step from commanding villagers towards playing one character of your own: pick Adventure when you create a world.",
    intro: [
      "Colony worlds are the game as it was. Adventure worlds are the start of something different: every player controls a single character, and the villagers keep the settlement running.",
    ],
    sections: [
      {
        kind: "new",
        items: [
          "A world mode chosen at creation: Colony or Adventure.",
          "One character per player, made beside the town hall the first time you join and waiting where you left it when you come back, even after a restart.",
          "Right-click to walk by the shortest way; right-click a tree or building to walk to the ground beside it.",
          "Everyone's character shows with a ring in their colour and their name above it, and as a dot on the minimap.",
          "Commands now know who sent them, which is the ground every later step stands on.",
        ],
      },
    ],
  },
  {
    slug: "nine-tribes",
    version: "0.8",
    title: "Nine Tribes",
    date: "2026-09-29",
    theme: "fungal",
    summary:
      "Five new tribes join the four: Glowkin, Freebooters, Mirefolk, Amberwrights and Cinderborn, each with its own buildings, dress, biome and bonus. And a landing page.",
    sections: [
      {
        kind: "new",
        items: [
          "Glowkin live in mushroom houses and see as far by night as by day.",
          "Freebooters arm every ship with cannons and get twice the loot from sunk raiders.",
          "Mirefolk dive twice as fast and bring up half as much again.",
          "Amberwrights get 30% more gold at the market.",
          "Cinderborn forge twice as fast and need no Ember Ward to land on the Infernal Isles.",
          "A landing page at the site's root, with the game itself moved to /play.",
        ],
      },
      {
        kind: "improved",
        items: [
          "Villagers and the goods they carry are redrawn at double resolution, with faces, hair, belts, boots and every tribe's headwear.",
        ],
      },
    ],
  },
  {
    slug: "the-great-work",
    version: "0.7",
    title: "The Great Work",
    date: "2026-09-29",
    theme: "autumn",
    summary:
      "Six far biomes yield goods found nowhere else, and a monument in three stages asks for all of them. The world gets a voice.",
    image: "screenshot",
    sections: [
      {
        kind: "new",
        items: [
          "Sunstone, rimeglass, mirepearl, glowcap, hellstone and crystal: each comes from one far biome only.",
          "The Great Work, raised in three stages on the home island, paid for from the treasury; a chronicle of the expedition when it is done.",
          "Sound, all of it synthesised in the browser: ambience that follows the camera and the biome, hammering and chopping, coins, horns, bells, cannons and thunder.",
        ],
      },
      {
        kind: "improved",
        items: [
          "The chart lists where to look for each good, including the islands you have found for it.",
        ],
      },
    ],
  },
  {
    slug: "keep-a-light-burning",
    version: "0.6",
    title: "Keep a Light Burning",
    date: "2026-09-29",
    theme: "crystal",
    summary:
      "Night matters now: lookouts go half blind after dark, raiders come at dusk, and storms roll across the sea.",
    image: "daynight",
    sections: [
      {
        kind: "new",
        items: [
          "The lighthouse: a beam that watches 24 tiles day and night.",
          "Storms that form at sea, drift across it and hurt ships outside harbour, with rain and lightning.",
          "Calm Waters, a magic house upgrade that makes your ships immune to storms.",
        ],
      },
      {
        kind: "improved",
        items: [
          "After dark your buildings and ships see much less of the sea, and raiders outside their lamps are unseen.",
          "Raids wait for dusk.",
        ],
      },
    ],
  },
  {
    slug: "black-sails",
    version: "0.5",
    title: "Black Sails",
    date: "2026-09-29",
    theme: "infernal",
    summary:
      "Pirates raid your settlements, patrol boats hunt them, and what they leave behind is worth diving for.",
    sections: [
      {
        kind: "new",
        items: [
          "Pirate raids, with a difficulty picked when you create a world: Peaceful, Normal or Hard.",
          "Patrol boats, cannons and iron hulls; ships have hull points and mend beside a dock.",
          "Shipwrecks and bones to loot, and sunken ruins and fortresses to dive, with relics that pay for the Stormcaller.",
          "Island names made up from the seed, and the chart of the archipelago with your ships, wrecks and trade routes.",
        ],
      },
      {
        kind: "improved",
        items: ["A red alert, with a direction and a Look button, while raiders are in sight."],
      },
    ],
  },
  {
    slug: "trade-winds",
    version: "0.4",
    title: "Trade Winds",
    date: "2026-09-29",
    theme: "desert",
    summary:
      "Settle other islands, keep a stockpile on each, and send cargo ships to bring the goods home.",
    sections: [
      {
        kind: "new",
        items: [
          "Docks on other islands, and a stockpile for every island.",
          "Cargo ships that follow a trade route between an outpost's dock and home, loading and unloading on repeat.",
          "The magic house: Far Sight, Swift Sails, Deep Holds and more, paid for with faith, gold and crystal.",
          "Wards for the Infernal Isles and the Crystal Spires: villagers refuse to land there until you have paid for one.",
        ],
      },
    ],
  },
  {
    slug: "painted-coasts",
    version: "0.3",
    title: "Painted Coasts",
    date: "2026-09-29",
    theme: "jungle",
    summary:
      "The land is painted pixel by pixel instead of tiled, shores lap and shimmer, and days turn to night.",
    sections: [
      {
        kind: "new",
        items: [
          "Terrain painted per pixel from smooth fields: coasts are curves, not staircases, and cliffs stand tall.",
          "Animated shores: foam and shallows play in three frames so waves run up the beach.",
          "Day and night, with lit windows after dark.",
          "Rock-stack islets, worn yards round buildings and ploughed farm fields.",
        ],
      },
    ],
  },
  {
    slug: "tribes-and-biomes",
    version: "0.2",
    title: "Tribes and Biomes",
    date: "2026-09-28",
    theme: "blossom",
    summary:
      "Choose a tribe, find ten biomes, and ferry villagers to settle new islands. The economy gets a proper shape.",
    sections: [
      {
        kind: "new",
        items: [
          "Four tribes, each with its own buildings, dress, home biome and a bonus.",
          "Ten biomes, from the Greenlands to the Infernal Isles, each with its own ground, plants, deposits and mood.",
          "Settling: take villagers aboard a scout ship and put them ashore on another island.",
          "Markets, churches, blacksmiths and tools: a real economy to grow into.",
        ],
      },
    ],
  },
  {
    slug: "first-landfall",
    version: "0.1",
    title: "First Landfall",
    date: "2026-09-28",
    theme: "temperate",
    summary: "The beginning: a generated archipelago, a co-op settlement and a ship to explore it.",
    image: "screenshot",
    intro: [
      "Explorer started as a piece of concept art and a README. This is the first version you could actually play.",
    ],
    sections: [
      {
        kind: "new",
        items: [
          "Seeded archipelagos with a playable start island, grown from nothing but a seed.",
          "Up to eight players sharing one settlement over the network, with a server that keeps the world.",
          "Villagers that build, gather and deliver by themselves; scout ships that lift the fog for everyone.",
          "Every sprite generated in code from the concept art's palette.",
          "An invite link for every expedition, and offline play in the browser.",
        ],
      },
    ],
  },
];

/** What is coming, as far as anyone knows. Shown under the releases. */
export const HORIZON: { theme: BiomeId; title: string; items: string[] } = {
  theme: "crystal",
  title: "On the horizon",
  items: [
    "Acting with your own hands in adventure worlds: gather, build and carry goods home.",
    "Boarding and steering a ship as its captain, with the rest of the crew at stations.",
    "Ports run by NPCs with shops and quests, in the style of the tribe that lives there.",
    "Customising your character beyond the colour of your cape.",
  ],
};

export function releaseBySlug(slug: string): Release | undefined {
  return RELEASES.find((r) => r.slug === slug);
}

/** "September 2026", for grouping the news list. */
export function monthOf(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

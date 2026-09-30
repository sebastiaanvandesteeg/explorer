// The development story. Edit freely: the About page renders whatever is here.
export const STORY: { heading?: string; text: string; pull?: boolean }[] = [
  {
    text: "Explorer began as a small question: what would a cosy, co-operative island-builder feel like if it lived in a browser tab, with nothing to install and friends one link away?",
  },
  {
    heading: "Everything is drawn by code",
    text: "There is not a single hand-painted sprite in the game. Every tree, house and sailor is built from tiny 3D shapes, ray-cast into isometric pixels by a script that runs at build time. Doubling the pixel density meant turning one number up and letting the renderer redraw the whole world.",
  },
  {
    text: "Even the sound is synthesised at runtime, and the terrain is painted from the world's own data. The game's art direction is, in the end, a pile of small programs agreeing with each other.",
    pull: true,
  },
  {
    heading: "One simulation, two places",
    text: "The game's rules live in one deterministic simulation that runs identically on the server and in your browser. The server decides what is true, your browser predicts it, and worlds are regenerated from a seed rather than stored. That is why a whole sea fits in a link, and why you can play offline.",
  },
  {
    heading: "From colony to adventure",
    text: "The first version was a colony game: you commanded the villagers. The adventure mode turns that around. Each player is one character in a shared world, villagers organise themselves, and the sea is big enough to get lost in. Both modes share the same world, art and simulation.",
  },
  {
    heading: "How it is made",
    text: "Explorer is built in the open as a TypeScript monorepo, with a good deal of AI-assisted development in the loop: design conversations, code, tests and release notes are written together, reviewed by a human, and kept honest by a test suite that also plays the game in a real browser.",
  },
];

export interface Milestone {
  when: string;
  title: string;
  text: string;
}

export const TIMELINE: Milestone[] = [
  {
    when: "Day one",
    title: "A single island",
    text: "A deterministic world, a handful of villagers and a pixel-art skyline.",
  },
  {
    when: "Weeks in",
    title: "Nine tribes, ten biomes",
    text: "Every climate got its own plants, rocks, weather and people.",
  },
  {
    when: "Then",
    title: "The sea opens up",
    text: "Ships, trade, raiders, fog of war and sunken fortresses.",
  },
  {
    when: "Recently",
    title: "Adventure worlds",
    text: "Eight players, eight characters, one shared sea.",
  },
  { when: "Now", title: "A real site", text: "Release notes, lore, and this page." },
];

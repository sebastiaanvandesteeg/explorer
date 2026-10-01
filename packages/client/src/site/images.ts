// The game's pictures, imported so both Vite's dev server and the build can serve them.
import biomes from "../../../../docs/biomes.webp";
import daynight from "../../../../docs/daynight.webp";
import screenshot from "../../../../docs/screenshot.png";

export const IMAGES = {
  screenshot: { src: screenshot, width: 1440, height: 900, alt: "A village on the home island" },
  biomes: { src: biomes, width: 1288, height: 782, alt: "Four biomes of the archipelago" },
  daynight: {
    src: daynight,
    width: 1696,
    height: 352,
    alt: "The same village at midday, dusk and night",
  },
  hero: { src: "/hero.webp", width: 1920, height: 1080, alt: "A village at golden hour" },
} as const;

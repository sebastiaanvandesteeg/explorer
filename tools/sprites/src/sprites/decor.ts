// Ground decoration per biome: two kinds of small ground cover and one taller plant.
import { BIOMES, type BiomeId } from "@explorer/shared";
import { Canvas, outline } from "../canvas";
import { prng } from "../noise3";
import { hexToRgba, rampColor, shade, type Rgba } from "../palette";
import { flat, lit, Scene, type Material, type Vec3 } from "../raytrace";
import { renderSprite, trimmed, type Sprite } from "../sprite";

const W = 32;
const H = 48;
/** Tile top vertex in the decor canvas; the tile's centre is 8 px below. */
const AX = 16;
const AY = 32;

type Draw = (c: Canvas, rand: () => number) => void;

/** Random point inside the middle of the tile diamond. */
function spot(rand: () => number): { x: number; y: number } {
  const u = rand() * 0.7 + 0.15;
  const v = rand() * 0.7 + 0.15;
  return { x: Math.round(AX + (u - v) * 16), y: Math.round(AY + (u + v) * 8) };
}

function scatter(colors: Rgba[], count: number, stemColor?: Rgba): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      if (stemColor) c.set(p.x, p.y + 1, stemColor);
      c.set(p.x, p.y, colors[i % colors.length]!);
    }
  };
}

function tufts(light: Rgba, mid: Rgba, dark: Rgba, count = 5, tall = 1): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      for (let k = 0; k < tall; k++) c.set(p.x, p.y - k, light);
      c.set(p.x - 1, p.y + 1, mid);
      c.set(p.x + 1, p.y + 1, mid);
      c.set(p.x, p.y + 1, dark);
    }
  };
}

function mounds(light: Rgba, shadow: Rgba, count: number): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      c.fill(p.x - 1, p.y, 3, 1, light);
      c.set(p.x, p.y - 1, light);
      c.fill(p.x - 1, p.y + 1, 3, 1, shadow);
    }
  };
}

function reeds(color: Rgba, head: Rgba | null, count: number, height: number): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      const h = height + Math.floor(rand() * 3);
      for (let k = 0; k < h; k++) c.set(p.x + (k > h / 2 && i % 2 ? 1 : 0), p.y - k, color);
      if (head) c.fill(p.x + (i % 2), p.y - h - 1, 1, 2, head);
    }
  };
}

function tinyShrooms(cap: Rgba, capLight: Rgba, stem: Rgba, count: number): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      c.set(p.x, p.y, stem);
      c.fill(p.x - 1, p.y - 1, 3, 1, cap);
      c.set(p.x, p.y - 2, capLight);
    }
  };
}

function shards(light: Rgba, mid: Rgba, dark: Rgba, count: number, height = 3): Draw {
  return (c, rand) => {
    for (let i = 0; i < count; i++) {
      const p = spot(rand);
      const h = height + Math.floor(rand() * 2);
      for (let k = 0; k < h; k++) {
        c.set(p.x, p.y - k, k === h - 1 ? light : mid);
        if (k < h - 1) c.set(p.x + 1, p.y - k, dark);
      }
    }
  };
}

function drawn(name: string, draw: Draw, seed: number, outlined = false): Sprite {
  const c = new Canvas(W, H);
  draw(c, prng(seed));
  if (outlined) outline(c, 0.45);
  return trimmed(name, c, AX, AY);
}

const SMALL: Record<BiomeId, [Draw, Draw]> = {
  temperate: [
    scatter(
      [
        rampColor("sunflower", 3),
        rampColor("plaster", 4),
        rampColor("cloth", 3),
        rampColor("berry", 3),
      ],
      9,
      rampColor("grass", 1),
    ),
    tufts(rampColor("grass", 5), rampColor("grass", 4), rampColor("grass", 3)),
  ],
  desert: [
    tufts(rampColor("wheat", 3), rampColor("wheat", 2), rampColor("timber", 2), 4, 2),
    scatter([rampColor("sandstone", 3), rampColor("sandstone", 1), rampColor("dune", 5)], 7),
  ],
  infernal: [
    scatter(
      [rampColor("lava", 4), rampColor("lava", 3), rampColor("lava", 5)],
      6,
      rampColor("lava", 1),
    ),
    mounds(rampColor("basalt", 3), rampColor("basalt", 0), 3),
  ],
  tundra: [
    mounds(rampColor("snow", 5), rampColor("snow", 1), 4),
    scatter([rampColor("ice", 5), rampColor("ice", 3)], 6),
  ],
  jungle: [
    tufts(rampColor("jungle", 6), rampColor("jungle", 4), rampColor("jungle", 2), 5, 2),
    scatter(
      [rampColor("berry", 3), rampColor("cloth", 4), rampColor("sunflower", 4)],
      7,
      rampColor("jungle", 2),
    ),
  ],
  swamp: [
    reeds(rampColor("willow", 4), null, 5, 3),
    scatter([hexToRgba("#1e3a36"), hexToRgba("#3e6a5a"), rampColor("willow", 5)], 8),
  ],
  fungal: [
    tinyShrooms(rampColor("capRed", 3), rampColor("capRed", 5), rampColor("stalk", 4), 4),
    scatter([rampColor("glow", 4), rampColor("glow", 5), rampColor("glow", 3)], 7),
  ],
  crystal: [
    shards(rampColor("crystal", 6), rampColor("crystal", 4), rampColor("crystal", 2), 3),
    scatter([rampColor("crystal", 5), rampColor("silver", 5), rampColor("crystalGround", 5)], 8),
  ],
  autumn: [
    scatter(
      [
        rampColor("autumnLeaf", 3),
        rampColor("autumnLeaf", 5),
        rampColor("autumnLeaf", 4),
        rampColor("pumpkin", 4),
      ],
      10,
    ),
    tinyShrooms(rampColor("timber", 3), rampColor("wheat", 4), rampColor("plaster", 3), 3),
  ],
  blossom: [
    scatter([rampColor("petal", 5), rampColor("petal", 4), rampColor("plaster", 4)], 10),
    scatter(
      [
        rampColor("petal", 3),
        rampColor("cloth", 3),
        rampColor("sunflower", 4),
        rampColor("plaster", 4),
      ],
      6,
      rampColor("blossomGround", 2),
    ),
  ],
};

// --- Tall plants ---------------------------------------------------------------------------

function sunflowers(name: string): Sprite {
  const rand = prng(7000);
  const s = new Scene();
  const stem = flat("sprout");
  const head: Material = (c) => shade("sunflower", lit(c, 0.1), c.px, c.py);
  for (let i = 0; i < 7; i++) {
    const x = 0.18 + rand() * 0.64;
    const y = 0.18 + rand() * 0.64;
    const h = 14 + rand() * 7;
    s.prism("z", [x, y, h / 2], 0.025, h / 2, stem, 5);
    s.ellipsoid([x + 0.07, y, h * 0.5], [0.09, 0.04, 2], flat("sprout"));
    const centre: Vec3 = [x, y + 0.03, h + 2];
    s.prism(
      "y",
      centre,
      0.13,
      0.015,
      (c) => {
        const r = Math.hypot(c.lp[0] - centre[0], (c.lp[2] - centre[2]) / 19.6);
        return r < 0.05 ? rampColor("sunflower", 0) : head(c);
      },
      10,
    );
  }
  return renderSprite(name, s, 1, 1, 30, 6);
}

function lavaVent(name: string): Sprite {
  const s = new Scene();
  s.cone(
    [0.5, 0.5, 0],
    0.3,
    12,
    (c) => {
      if (c.lp[2] > 9.5) return rampColor("lava", c.light > 0.2 ? 5 : 4);
      return shade("basalt", lit(c, 0.05), c.px, c.py);
    },
    10,
  );
  s.ellipsoid([0.28, 0.66, 1], [0.1, 0.08, 2.5], flat("basalt"));
  return renderSprite(name, s, 1, 1, 24, 6);
}

function mushroomCluster(name: string): Sprite {
  const s = new Scene();
  const cap: Material = (c) => {
    const spots = Math.sin(c.p[0] * 60) * Math.sin(c.p[1] * 60) > 0.75;
    return spots ? rampColor("stalk", 5) : shade("capRed", lit(c, 0.05), c.px, c.py);
  };
  for (const [x, y, h, r] of [
    [0.5, 0.5, 9, 0.16],
    [0.3, 0.65, 6, 0.11],
    [0.68, 0.36, 5, 0.1],
  ] as const) {
    s.prism("z", [x, y, h / 2], 0.035, h / 2, flat("stalk", 0.1), 8);
    s.ellipsoid([x, y, h], [r, r, 3.5], cap);
  }
  return renderSprite(name, s, 1, 1, 20, 6);
}

function crystalCluster(name: string): Sprite {
  const s = new Scene();
  const gem: Material = (c) => shade("crystal", 0.35 + 0.75 * c.light, c.px, c.py, 0.2);
  s.withYaw(0.3, [0.5, 0.5], () => {
    s.cone([0.5, 0.5, 0], 0.09, 16, gem, 6);
    s.cone([0.36, 0.6, 0], 0.07, 10, gem, 6);
    s.cone([0.62, 0.38, 0], 0.06, 8, gem, 6);
  });
  return renderSprite(name, s, 1, 1, 22, 6);
}

function tallPlants(
  name: string,
  stem: Rgba,
  heads: Rgba[],
  count: number,
  height: number,
  seed: number,
): Sprite {
  return drawn(
    name,
    (c, rand) => {
      for (let i = 0; i < count; i++) {
        const p = spot(rand);
        const h = height + Math.floor(rand() * 4);
        for (let k = 0; k < h; k++) c.set(p.x + (k > h - 3 && i % 2 ? 1 : 0), p.y - k, stem);
        const head = heads[i % heads.length]!;
        c.fill(p.x - 1 + (i % 2), p.y - h - 1, 2, 2, head);
        c.set(p.x - 1 + (i % 2), p.y - h - 2, head);
      }
    },
    seed,
    true,
  );
}

function twigs(name: string, color: Rgba, tip: Rgba, seed: number): Sprite {
  return drawn(
    name,
    (c, rand) => {
      const base = { x: AX, y: AY + 10 };
      for (let i = 0; i < 7; i++) {
        let x = base.x + (rand() - 0.5) * 4;
        let y = base.y;
        const dx = (rand() - 0.5) * 1.4;
        const len = 5 + Math.floor(rand() * 5);
        for (let k = 0; k < len; k++) {
          x += dx;
          y -= 1;
          c.set(Math.round(x), Math.round(y), k === len - 1 ? tip : color);
        }
      }
    },
    seed,
    true,
  );
}

function fern(name: string, seed: number): Sprite {
  return drawn(
    name,
    (c) => {
      const cx = AX;
      const cy = AY + 10;
      for (let i = 0; i < 6; i++) {
        const dir = i % 2 === 0 ? -1 : 1;
        const spread = 3 + i;
        for (let k = 0; k < 9; k++) {
          const x = cx + dir * Math.round((k * spread) / 8);
          const y =
            cy - Math.round(Math.sin((k / 8) * Math.PI) * (7 + (i % 3))) - Math.floor(i / 2);
          c.set(x, y, rampColor("jungle", 4 + (k % 2)));
          c.set(x, y + 1, rampColor("jungle", 2));
        }
      }
    },
    seed,
    true,
  );
}

const TALL: Record<BiomeId, (name: string) => Sprite> = {
  temperate: sunflowers,
  desert: (n) => twigs(n, rampColor("timber", 3), rampColor("wheat", 3), 11),
  infernal: lavaVent,
  tundra: (n) => twigs(n, rampColor("ice", 4), rampColor("snow", 5), 12),
  jungle: (n) => fern(n, 13),
  swamp: (n) => tallPlants(n, rampColor("willow", 3), [rampColor("timber", 2)], 6, 8, 14),
  fungal: mushroomCluster,
  crystal: crystalCluster,
  autumn: (n) =>
    tallPlants(
      n,
      rampColor("wheat", 2),
      [rampColor("wheat", 4), rampColor("autumnLeaf", 5)],
      7,
      6,
      15,
    ),
  blossom: (n) =>
    tallPlants(
      n,
      rampColor("sprout", 2),
      [rampColor("petal", 3), rampColor("cloth", 3), rampColor("plaster", 4)],
      7,
      5,
      16,
    ),
};

export function decorSprites(): Sprite[] {
  const out: Sprite[] = [];
  BIOMES.forEach((biome, i) => {
    const [a, b] = SMALL[biome];
    out.push(
      drawn(`deco_${biome}_small_0`, a, 100 + i * 7),
      drawn(`deco_${biome}_small_1`, b, 101 + i * 7),
    );
    out.push(TALL[biome](`deco_${biome}_tall`));
  });
  return out;
}

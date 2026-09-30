// Dev helper: a contact sheet of the heroes, layers stacked and tinted as the game does.
// Usage: tsx src/hero-preview.ts <out.png> [scale] [class...]
import { writeFileSync } from "node:fs";
import {
  BUILDS,
  CHARACTER_CLASSES,
  EYE_COLOURS,
  HAIR_COLOURS,
  SKIN_TONES,
  type CharacterClass,
} from "@explorer/shared";
import { Canvas } from "./canvas";
import { hexToRgba } from "./palette";
import { encodePng } from "./png";
import {
  HERO_CANVAS,
  HERO_LAYERS,
  heroFigure,
  type HeroLayer,
  type HeroPose,
} from "./sprites/heroes";

const [out = "heroes.png", scaleArg = "3", ...only] = process.argv.slice(2);
const scale = Number(scaleArg);
const classes = (only.length ? only : [...CHARACTER_CLASSES]) as CharacterClass[];

export interface Look {
  skin: number;
  hair: number;
  eyes: number;
}
const look: Look = {
  skin: Number(process.env.SKIN ?? 1),
  hair: Number(process.env.HAIR ?? 1),
  eyes: Number(process.env.EYES ?? 2),
};
const tints: Partial<Record<HeroLayer, string>> = {
  skin: SKIN_TONES[look.skin]!,
  hair: HAIR_COLOURS[look.hair]!,
  iris: EYE_COLOURS[look.eyes]!,
  scarf: "#e98a3a",
};

function compose(cls: CharacterClass, build: number, front: boolean, pose: HeroPose): Canvas {
  const layers = heroFigure(cls, build, front, pose);
  const c = new Canvas(HERO_CANVAS.width, HERO_CANVAS.height);
  for (const l of HERO_LAYERS) {
    const src = layers[l];
    const tint = tints[l] ? hexToRgba(tints[l]!) : null;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const p = src.get(x, y);
        if (p[3] === 0) continue;
        if (tint)
          c.blend(x, y, [
            (p[0] * tint[0]) / 255,
            (p[1] * tint[1]) / 255,
            (p[2] * tint[2]) / 255,
            p[3],
          ]);
        else c.blend(x, y, p);
      }
  }
  return c;
}

const cellW = HERO_CANVAS.width * scale;
const cellH = HERO_CANVAS.height * scale;
const cols: { build: number; front: boolean; pose: HeroPose }[] = [];
for (let build = 0; build < BUILDS.length; build++)
  cols.push({ build, front: true, pose: "stand" });
cols.push({ build: 1, front: true, pose: "walk0" }, { build: 1, front: true, pose: "walk1" });
cols.push({ build: 1, front: false, pose: "stand" }, { build: 1, front: false, pose: "walk0" });
const sheet = new Canvas(cellW * cols.length, cellH * classes.length);
const bg = hexToRgba("#556128");
const bg2 = hexToRgba("#4f5a26");
for (let y = 0; y < sheet.height; y++)
  for (let x = 0; x < sheet.width; x++) sheet.set(x, y, ((x >> 5) + (y >> 5)) % 2 ? bg : bg2);
classes.forEach((cls, row) =>
  cols.forEach((col, ci) => {
    const c = compose(cls, col.build, col.front, col.pose);
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const p = c.get(x, y);
        if (p[3] === 0) continue;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            sheet.blend(ci * cellW + x * scale + dx, row * cellH + y * scale + dy, p);
      }
  }),
);
writeFileSync(out, encodePng(sheet));
console.log(`${classes.length} classes → ${out}`);

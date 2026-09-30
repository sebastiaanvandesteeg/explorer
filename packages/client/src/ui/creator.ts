// The character creator: pick a class, a build and the colours of skin, hair and eyes, with a
// live preview. Used in the lobby; purely cosmetic for now.
import {
  BUILDS,
  CHARACTER_CLASSES,
  CLASS_DEFS,
  EYE_COLOURS,
  HAIR_COLOURS,
  PLAYER_COLORS,
  SKIN_TONES,
  type CharacterLook,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import { h } from "./dom";
import { drawHero, heroCanvas } from "./heroPreview";

const BUILD_NAMES = ["Slim", "Average", "Sturdy"] as const;

export function characterCreator(
  atlas: Promise<Atlas>,
  initial: CharacterLook,
  onChange: (look: CharacterLook) => void,
): HTMLElement {
  let look: CharacterLook = { ...initial };
  let facing = 0;
  let ready: Atlas | null = null;

  const big = heroCanvas();
  big.classList.add("big");
  big.title = "Click to turn around";
  big.addEventListener("click", () => {
    facing = (facing + 3) % 4;
    paint();
  });
  const blurb = h("small", {});
  const classCards = new Map<string, { card: HTMLElement; canvas: HTMLCanvasElement }>();
  const scarf = PLAYER_COLORS[0];

  const paint = () => {
    if (!ready) return;
    drawHero(ready, big, look, scarf, facing);
    for (const [id, { canvas }] of classCards)
      drawHero(ready, canvas, { ...look, class: id as CharacterLook["class"] }, scarf, 0);
  };

  const change = (next: Partial<CharacterLook>) => {
    look = { ...look, ...next };
    blurb.textContent = CLASS_DEFS[look.class].blurb;
    for (const [id, { card }] of classCards) {
      card.classList.toggle("active", id === look.class);
      card.setAttribute("aria-checked", String(id === look.class));
    }
    for (const group of Object.values(groups))
      for (const [i, el] of group.entries()) {
        el.classList.toggle("active", i === look[el.dataset.field as "skin" | "hair" | "eyes"]);
        el.setAttribute("aria-checked", String(el.classList.contains("active")));
      }
    for (const [i, el] of builds.entries()) {
      el.classList.toggle("active", i === look.build);
      el.setAttribute("aria-checked", String(i === look.build));
    }
    paint();
    onChange(look);
  };

  const classes = h("div.classes", { role: "radiogroup", "aria-label": "Class" });
  for (const id of CHARACTER_CLASSES) {
    const canvas = heroCanvas();
    const card = h(
      "button.class-card",
      {
        type: "button",
        role: "radio",
        title: CLASS_DEFS[id].blurb,
        onclick: () => change({ class: id }),
      },
      canvas,
      h("strong", {}, CLASS_DEFS[id].name),
    );
    classCards.set(id, { card, canvas });
    classes.append(card);
  }

  const swatches = (field: "skin" | "hair" | "eyes", colours: readonly string[], label: string) => {
    const row = h("div.swatches", { role: "radiogroup", "aria-label": label });
    const els = colours.map((hex, i) =>
      h("button.swatch", {
        type: "button",
        role: "radio",
        title: `${label} ${i + 1}`,
        "aria-label": `${label} ${i + 1}`,
        style: { background: hex },
        dataset: { field },
        onclick: () => change({ [field]: i }),
      }),
    );
    row.append(...els);
    return { row, els };
  };
  const skin = swatches("skin", SKIN_TONES, "Skin");
  const hair = swatches("hair", HAIR_COLOURS, "Hair");
  const eyes = swatches("eyes", EYE_COLOURS, "Eyes");
  const groups = { skin: skin.els, hair: hair.els, eyes: eyes.els };

  const buildRow = h("div.segmented", { role: "radiogroup", "aria-label": "Build" });
  const builds = BUILDS.map((_, i) =>
    h(
      "button.seg",
      { type: "button", role: "radio", onclick: () => change({ build: i }) },
      BUILD_NAMES[i],
    ),
  );
  buildRow.append(...builds);

  const el = h(
    "div.creator",
    {},
    h("div.creator-top", {}, h("div.preview", {}, big), h("div.creator-fields", {}, classes)),
    blurb,
    h(
      "div.creator-rows",
      {},
      h("label", {}, "Skin", skin.row),
      h("label", {}, "Hair", hair.row),
      h("label", {}, "Eyes", eyes.row),
      h("label", {}, "Build", buildRow),
    ),
  );
  change({});
  void atlas.then((a) => {
    ready = a;
    paint();
  });
  return el;
}

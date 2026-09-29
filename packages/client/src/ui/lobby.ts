import {
  DIFFICULTIES,
  DIFFICULTY_DEFS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  PLAY_PATH,
  TRIBE_DEFS,
  TRIBES,
  type Difficulty,
  type TribeId,
  type WorldInfo,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import { playerName, savePlayerName } from "../net/identity";
import { h } from "./dom";

export interface LobbyOptions {
  /** Joining through an invite link: only ask for a name. */
  joinId?: string;
  error?: string;
  onEnter(name: string, worldId: string): void;
  onOffline(name: string, seed: string, tribe: TribeId, difficulty: Difficulty): void;
  /** Loads sprites for the tribe previews (the lobby shows before they're ready). */
  atlas: Promise<Atlas>;
}

function randomSeed(): string {
  const words = [
    "amber",
    "brine",
    "cove",
    "drift",
    "ember",
    "fjord",
    "gale",
    "harbor",
    "isle",
    "jade",
    "kelp",
    "lagoon",
    "moss",
    "north",
    "oak",
    "pearl",
    "reef",
    "salt",
    "tide",
    "willow",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)]!;
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function showLobby(root: HTMLElement, opts: LobbyOptions): () => void {
  const name = h("input.field", {
    placeholder: "Your name",
    maxlength: String(MAX_NAME_LENGTH),
    value: playerName(),
    autocomplete: "nickname",
  }) as HTMLInputElement;
  const error = h("div.error", {}, opts.error ?? "");
  const seed = h("input.field", { placeholder: "Random" }) as HTMLInputElement;
  let tribe: TribeId = "islanders";
  const tribeCards = new Map<TribeId, HTMLElement>();
  const tribes = h("div.tribes", { role: "radiogroup", "aria-label": "Tribe" });
  for (const id of TRIBES) {
    const def = TRIBE_DEFS[id];
    const pic = h("span.pic");
    const card = h(
      "button.tribe",
      {
        type: "button",
        role: "radio",
        "aria-checked": String(id === tribe),
        title: def.description,
        onclick: () => {
          tribe = id;
          for (const [t, el] of tribeCards) {
            el.classList.toggle("active", t === id);
            el.setAttribute("aria-checked", String(t === id));
          }
        },
      },
      pic,
      h(
        "span",
        {},
        h("strong", { style: { color: def.banner } }, def.name),
        h("small", {}, def.bonusText),
      ),
    );
    if (id === tribe) card.classList.add("active");
    tribeCards.set(id, card);
    tribes.append(card);
    void opts.atlas.then((atlas) => {
      const name = `b_town_hall_${id}`;
      if (!atlas.has(name)) return;
      const f = atlas.frame(name);
      const icon = h("span.icon");
      Object.assign(icon.style, atlas.iconStyle(name, Math.min(56 / f.w, 52 / f.h)));
      pic.append(icon);
    });
  }
  let difficulty: Difficulty = "normal";
  const difficultyHint = h("small", {}, DIFFICULTY_DEFS[difficulty].description);
  const difficultyButtons = new Map<Difficulty, HTMLElement>();
  const difficulties = h("div.segmented", { role: "radiogroup", "aria-label": "Difficulty" });
  for (const id of DIFFICULTIES) {
    const def = DIFFICULTY_DEFS[id];
    const btn = h(
      "button.seg",
      {
        type: "button",
        role: "radio",
        "aria-checked": String(id === difficulty),
        title: def.description,
        onclick: () => {
          difficulty = id;
          difficultyHint.textContent = def.description;
          for (const [d, el] of difficultyButtons) {
            el.classList.toggle("active", d === id);
            el.setAttribute("aria-checked", String(d === id));
          }
        },
      },
      def.name,
    );
    if (id === difficulty) btn.classList.add("active");
    difficultyButtons.set(id, btn);
    difficulties.append(btn);
  }
  const code = h("input.field", { placeholder: "Invite code or link" }) as HTMLInputElement;

  const needName = (): string | null => {
    const n = name.value.trim().slice(0, MAX_NAME_LENGTH);
    if (!n) {
      error.textContent = "Pick a name first.";
      name.focus();
      return null;
    }
    savePlayerName(n);
    return n;
  };

  const create = async (btn: HTMLButtonElement) => {
    const n = needName();
    if (!n) return;
    btn.disabled = true;
    error.textContent = "";
    try {
      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: seed.value.trim() || randomSeed(), tribe, difficulty }),
      });
      if (!res.ok) throw new Error(await res.text());
      const info = (await res.json()) as WorldInfo;
      opts.onEnter(n, info.id);
    } catch {
      error.textContent = "Couldn't reach the server. Is it running? You can still play offline.";
      btn.disabled = false;
    }
  };

  const join = (id: string) => {
    const n = needName();
    if (!n) return;
    const match = id.trim().match(/([a-z0-9]{4,32})\/?$/i);
    if (!match) {
      error.textContent = "That doesn't look like an invite code.";
      return;
    }
    opts.onEnter(n, match[1]!.toLowerCase());
  };

  const card = h("div.lobby-card.panel");
  if (opts.joinId) {
    const go = h(
      "button.btn.primary",
      { onclick: () => join(opts.joinId!) },
      "Join the expedition",
    ) as HTMLButtonElement;
    card.append(
      h("h1", {}, "Explorer"),
      h(
        "p",
        {},
        "You've been invited to a co-op expedition. Explore the islands and build a settlement together.",
      ),
      h("label", {}, "Your name", name),
      go,
      error,
      h("p.small", {}, h("a", { href: PLAY_PATH }, "Start your own expedition instead")),
    );
    name.addEventListener("keydown", (e) => e.key === "Enter" && join(opts.joinId!));
  } else {
    const createBtn = h("button.btn.primary", {}, "Start a new expedition") as HTMLButtonElement;
    createBtn.onclick = () => create(createBtn);
    card.append(
      h("h1", {}, "Explorer"),
      h(
        "p",
        {},
        `Sail a randomly generated archipelago of ten biomes, from blossom isles to infernal shores, and build a settlement with up to ${MAX_PLAYERS - 1} friends.`,
      ),
      h("label", {}, "Your name", name),
      h("div.field", {}, h("span", {}, "Choose your tribe"), tribes),
      h("div.field", {}, h("span", {}, "Pirates"), difficulties, difficultyHint),
      h("label", {}, "World seed (optional)", seed),
      createBtn,
      h("div.divider"),
      h(
        "label",
        {},
        "Have an invite?",
        h("div.row", {}, code, h("button.btn", { onclick: () => join(code.value) }, "Join")),
      ),
      error,
      h(
        "p.small",
        {},
        "No server? ",
        h(
          "a",
          {
            href: "#",
            onclick: (e: Event) => {
              e.preventDefault();
              const n = needName();
              if (n) opts.onOffline(n, seed.value.trim() || randomSeed(), tribe, difficulty);
            },
          },
          "Play offline",
        ),
        " (single player, nothing is saved).",
      ),
    );
    code.addEventListener("keydown", (e) => e.key === "Enter" && join(code.value));
  }
  const el = h("div.lobby", {}, card);
  root.append(el);
  (opts.joinId ? name : name.value ? seed : name).focus();
  return () => el.remove();
}

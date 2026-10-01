import type { Talk } from "./dialog";
import {
  BUILDINGS,
  canAfford,
  DIFFICULTY_DEFS,
  CARGO,
  cargoCost,
  diveSeconds,
  PATROL,
  CHURCH,
  clockText,
  dayPeriod,
  discoveryName,
  FARM,
  greatWorkStages,
  islandAt,
  MARKET_BUYABLE,
  MARKET_LOT,
  MARKET_PRICES,
  NODES,
  population,
  populationCap,
  RESOURCES,
  SHIP,
  berthSlots,
  scoutCapacity,
  sellPrice,
  shipCost,
  SMITH,
  smithSeconds,
  stockOf,
  stormStrength,
  tileIndex,
  TRIBE_DEFS,
  UPGRADE_IDS,
  UPGRADES,
  VILLAGER,
  WATCH,
  type BiomeId,
  type BuildingEntity,
  type BuildingKind,
  type Command,
  type Difficulty,
  type Entity,
  type GameState,
  type NodeEntity,
  type PlayerInfo,
  type Resource,
  type ShipEntity,
  type Stock,
  type TribeId,
  type UpgradeId,
  type VillagerEntity,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import type { SessionStatus } from "../net/session";
import { buildingThumb, villagerSprite } from "../render/names";
import { describeIsland, describePirate, describeShip, goodsText, nearestSite } from "./describe";
import { chronicleRows, stageRows } from "./greatWork";
import { h } from "./dom";
import { currentStorm, currentThreat, pirateSpotted } from "./mapData";
import { MapScreen } from "./mapscreen";
import { abgr, mapColours } from "./mapColours";
import { ICON, LABEL, RARE } from "./resources";

export type Tool = { kind: "select" } | { kind: "build"; building: BuildingKind };

export interface HudActions {
  tool(t: Tool): void;
  command(cmd: Command): void;
  chat(text: string): void;
  focusTile(x: number, y: number): void;
  select(id: number): void;
  deselect(): void;
  state(): GameState;
  /** The four corners of what the camera shows, in tile coordinates. */
  view(): { x: number; y: number }[];
  /** Mute or unmute the sound; returns whether it is muted now. */
  toggleSound(): boolean;
  /** Switch footsteps, doors and voices on or off; returns whether they are on now. */
  toggleFoley(): boolean;
}

export function discoveryText(name: string, biome: BiomeId): string {
  return `Discovered ${name} (${discoveryName(biome)})!`;
}

export class Hud {
  readonly root: HTMLElement;
  private resEls = new Map<string, HTMLElement>();
  private lastStock: Stock | null = null;
  private buildButtons = new Map<string, HTMLButtonElement>();
  private selectionEl: HTMLElement;
  private selectionKey = "";
  /** Inside a building: the person you are talking to, who the building's panel speaks for. */
  private talk: Talk | null = null;
  private selectionRefs: {
    status?: HTMLElement;
    /** A ship's crew: the captain and the passengers. */
    crew?: HTMLElement;
    /** Extra live lines: an island's stockpile, a cargo ship's route. */
    extra?: HTMLElement;
    /** Magic house: one row per upgrade, restyled when it is learned. */
    upgrades?: { id: UpgradeId; row: HTMLElement; btn: HTMLButtonElement }[];
    /** The Great Work: the stage list, redrawn when it changes, and its own buttons. */
    great?: HTMLElement;
    greatKey?: string;
    greatButtons?: { el: HTMLButtonElement; enabled: () => boolean }[];
    bar?: HTMLElement;
    buttons: { el: HTMLButtonElement; enabled: () => boolean }[];
  } = { buttons: [] };
  private playersEl: HTMLElement;
  private clockEl: HTMLElement;
  private clockShown = "";
  private statusEl: HTMLElement;
  private toastsEl: HTMLElement;
  private chatLog: HTMLElement;
  private chatInput: HTMLInputElement;
  private helpEl: HTMLElement;
  private bannerEl: HTMLElement;
  private biomeEl: HTMLElement;
  private biomeTimer: ReturnType<typeof setTimeout> | null = null;
  readonly minimap: Minimap;
  readonly map: MapScreen;
  private alertEl: HTMLElement;
  private titleEl: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private foleyBtn: HTMLButtonElement;
  private alertKey = "";

  constructor(
    parent: HTMLElement,
    private readonly atlas: Atlas,
    private readonly actions: HudActions,
    private readonly inviteUrl: string | null,
    private readonly tribe: TribeId,
  ) {
    const icon = (name: string, scale = 2) => {
      const el = h("span.icon");
      Object.assign(el.style, atlas.iconStyle(name, scale));
      return el;
    };

    const resources = h("div.resources.panel");
    for (const r of [...RESOURCES, "pop"] as const) {
      const value = h("span", {}, "0");
      const el = h(
        "div.resource",
        { title: r === "pop" ? "Villagers / housing" : LABEL[r], dataset: { res: r } },
        icon(r === "pop" ? "icon_villager" : ICON[r]),
        value,
      );
      this.resEls.set(r, value);
      resources.append(el);
    }

    const menu = h("div.build-menu.panel", {}, h("h3", {}, "Build"));
    const grid = h("div.build-grid");
    for (const def of Object.values(BUILDINGS)) {
      if (!def.buildable) continue;
      const thumbName = buildingThumb(def.kind, tribe);
      const f = atlas.size(thumbName);
      const scale = Math.min(40 / f.w, 32 / f.h, 1);
      const thumb = h("span.thumb", {}, icon(thumbName, scale));
      const cost = h("span.cost");
      for (const [res, n] of Object.entries(def.cost)) {
        cost.append(h("span", { dataset: { res } }, icon(ICON[res as Resource], 1), String(n)));
      }
      const btn = h(
        "button.build-item",
        {
          title: `${def.name}: ${def.description}`,
          onclick: () => actions.tool({ kind: "build", building: def.kind }),
        },
        thumb,
        h(
          "span",
          {},
          h(
            "span.name",
            {},
            def.name,
            def.hotkey ? h("span.kbd", {}, def.hotkey.toUpperCase()) : null,
          ),
          cost,
        ),
      ) as HTMLButtonElement;
      this.buildButtons.set(def.kind, btn);
      grid.append(btn);
    }
    menu.append(grid);

    this.selectionEl = h("div.selection.panel");
    this.statusEl = h("div.status");
    this.playersEl = h("div");
    this.clockEl = h("div.clock", { title: "Time of day: the same for everyone in the world" });
    const tribeDef = TRIBE_DEFS[tribe];
    this.soundBtn = h(
      "button.btn.mini.sound",
      {
        title: "Turn the sound on or off (N)",
        onclick: () => this.setSound(actions.toggleSound()),
      },
      "Sound: on",
    ) as HTMLButtonElement;
    this.foleyBtn = h(
      "button.btn.mini.sound",
      {
        title: "Footsteps, doors and voices on or off (J)",
        onclick: () => this.setFoley(actions.toggleFoley()),
      },
      "Footsteps: on",
    ) as HTMLButtonElement;
    this.titleEl = h(
      "h3",
      { title: `${tribeDef.description} ${tribeDef.bonusText}.` },
      h("span.dot", { style: { background: tribeDef.banner } }),
      `Expedition · ${tribeDef.name}`,
    );
    const players = h(
      "div.players.panel",
      {},
      this.titleEl,
      this.clockEl,
      this.playersEl,
      inviteUrl
        ? h(
            "button.btn.primary",
            {
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  this.toast("Invite link copied: share it with up to 7 friends");
                } catch {
                  prompt("Copy this invite link:", inviteUrl);
                }
              },
            },
            icon("icon_flag", 1),
            "Copy invite link",
          )
        : null,
      this.statusEl,
      this.soundBtn,
      this.foleyBtn,
    );

    this.minimap = new Minimap((x, y) => actions.focusTile(x, y));
    this.map = new MapScreen(atlas, actions);
    const minimap = h(
      "div.minimap.panel",
      {},
      this.minimap.canvas,
      h(
        "button.btn.mini.map-btn",
        { title: "Open the chart of the archipelago (M)", onclick: () => this.map.toggle() },
        "Map",
        h("span.kbd", {}, "M"),
      ),
    );

    this.chatLog = h("div.chat-log");
    this.chatInput = h("input.field", {
      placeholder: "Press Enter to chat",
      maxlength: "200",
    }) as HTMLInputElement;
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = this.chatInput.value.trim();
        if (text) actions.chat(text);
        this.chatInput.value = "";
        this.chatInput.blur();
      } else if (e.key === "Escape") this.chatInput.blur();
    });
    const chat = h("div.chat", {}, this.chatLog, this.chatInput);

    this.toastsEl = h("div.toasts");
    this.alertEl = h("div.alerts");
    const notices = h("div.notices", {}, this.alertEl, this.toastsEl);
    this.helpEl = h("div.help.panel");
    this.bannerEl = h("div.banner.panel", { style: { display: "none" } });
    this.biomeEl = h("div.biome-label");
    this.root = h(
      "div.hud",
      {},
      resources,
      menu,
      this.selectionEl,
      players,
      minimap,
      chat,
      notices,
      this.helpEl,
      this.bannerEl,
      this.biomeEl,
      this.map.root,
    );
    parent.append(this.root);
    // Everything under the resource bar makes room when the bar wraps onto a second row.
    const fit = () => this.root.style.setProperty("--hud-top", `${resources.offsetHeight + 24}px`);
    fit();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(resources);
  }

  /** Show whether footsteps, doors and voices are on. */
  setFoley(on: boolean): void {
    this.foleyBtn.textContent = on ? "Footsteps: on" : "Footsteps: off";
    this.foleyBtn.classList.toggle("off", !on);
  }

  /** Show whether the sound is muted. */
  setSound(muted: boolean): void {
    this.soundBtn.textContent = muted ? "Sound: off" : "Sound: on";
    this.soundBtn.classList.toggle("off", muted);
  }

  /** Note the world's difficulty in the expedition title, unless it is the ordinary one. */
  setDifficulty(difficulty: Difficulty): void {
    if (difficulty === "normal") return;
    const def = DIFFICULTY_DEFS[difficulty];
    this.titleEl.append(h("span.tag", { title: def.description }, def.name));
  }

  focusChat(): void {
    this.chatInput.focus();
  }

  /** Name the region the camera drifts into, like a map label. */
  showBiome(biome: BiomeId | null): void {
    if (this.biomeTimer) clearTimeout(this.biomeTimer);
    this.biomeEl.classList.remove("show");
    if (!biome) return;
    this.biomeEl.textContent = discoveryName(biome).replace(/^the /, "The ");
    void this.biomeEl.offsetWidth;
    this.biomeEl.classList.add("show");
    this.biomeTimer = setTimeout(() => this.biomeEl.classList.remove("show"), 2800);
  }

  setStock(state: GameState): void {
    const stock = state.stock;
    for (const r of RESOURCES) {
      const el = this.resEls.get(r)!;
      el.textContent = String(stock[r]);
      // Advanced resources stay hidden until the settlement has some.
      if (RARE.includes(r as Resource)) {
        el.parentElement!.classList.toggle(
          "empty",
          stock[r] === 0 && !(this.lastStock && this.lastStock[r] > 0),
        );
      }
      if (this.lastStock && stock[r] > this.lastStock[r]) {
        el.parentElement!.classList.remove("flash");
        void el.parentElement!.offsetWidth;
        el.parentElement!.classList.add("flash");
      }
    }
    this.resEls.get("pop")!.textContent = `${population(state)}/${populationCap(state)}`;
    this.lastStock = { ...stock };
    for (const [kind, btn] of this.buildButtons) {
      const def = BUILDINGS[kind as BuildingKind];
      btn.disabled = !canAfford(stock, def.cost);
      for (const span of btn.querySelectorAll<HTMLElement>("[data-res]")) {
        const res = span.dataset.res as Resource;
        span.classList.toggle("short", stock[res] < (def.cost[res] ?? 0));
      }
    }
    this.refreshSelectionButtons();
  }

  setTool(tool: Tool): void {
    for (const [kind, btn] of this.buildButtons) {
      const active = tool.kind === "build" && tool.building === kind;
      btn.classList.toggle("active", active);
    }
    this.help(
      tool.kind === "build"
        ? tool.building === "path"
          ? "Click or drag to lay paths · Right-click or Esc to stop"
          : "Click to place · Shift-click to keep placing · Right-click or Esc to cancel"
        : "",
    );
  }

  help(text: string): void {
    this.helpEl.textContent = text;
  }

  banner(text: string | null): void {
    this.bannerEl.style.display = text ? "" : "none";
    this.bannerEl.textContent = text ?? "";
  }

  /**
   * The alerts: pirates in sight and storms closing on ships, each with a button to go and look.
   * They stay up for as long as the danger does.
   */
  setAlerts(state: GameState): void {
    // `locate` is asked again when the button is pressed: the raiders and the storm keep moving.
    const rows: {
      key: string;
      text: string;
      look: string;
      locate: () => { x: number; y: number } | undefined;
    }[] = [];
    const threat = currentThreat(state);
    if (threat) {
      const where = threat.target
        ? describeIsland(state, islandAt(state, threat.target.x, threat.target.y))
        : null;
      rows.push({
        key: "pirates",
        text:
          threat.raiding > 0 && where
            ? `Pirates are robbing ${where}!`
            : `${threat.pirates} pirate ship${threat.pirates === 1 ? "" : "s"} in sight to the ${threat.direction}`,
        look: "Go to the nearest pirate ship",
        locate: () => currentThreat(this.actions.state())?.nearest,
      });
    }
    const storm = currentStorm(state);
    if (storm) {
      rows.push({
        key: "storm",
        text: `A storm from the ${storm.direction} is closing on ${storm.ships} of your ships: bring them into harbour`,
        look: "Go to the storm",
        locate: () => currentStorm(this.actions.state())?.storm,
      });
    }
    const key = rows.map((r) => r.text).join("|");
    if (key === this.alertKey) return;
    this.alertKey = key;
    this.alertEl.replaceChildren(
      ...rows.map((r) =>
        h(
          `div.alert.panel${r.key === "storm" ? ".storm" : ""}`,
          {},
          h("span.siren", {}, r.key === "storm" ? "~" : "!"),
          h("span", {}, r.text),
          h(
            "button.btn.mini",
            {
              title: r.look,
              onclick: () => {
                const at = r.locate();
                if (at) this.actions.focusTile(at.x + 0.5, at.y + 0.5);
              },
            },
            "Look",
          ),
        ),
      ),
    );
  }

  toast(text: string, kind: "info" | "error" = "info"): void {
    const el = h(`div.toast.panel${kind === "error" ? ".error" : ""}`, {}, text);
    this.toastsEl.append(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild!.remove();
    setTimeout(() => el.remove(), 4000);
  }

  chatLine(from: PlayerInfo | null, text: string): void {
    const who = h(
      "strong",
      { style: { color: from?.color ?? "#eed099" } },
      `${from?.name ?? "?"}: `,
    );
    this.chatLog.append(h("div.line", {}, who, text));
    while (this.chatLog.children.length > 8) this.chatLog.firstElementChild!.remove();
  }

  /** Show the day, the part of the day and the time; only touches the page when it changes. */
  setClock(phase: number, day: number): void {
    const period = dayPeriod(phase);
    const text = `Day ${day} · ${period} · ${clockText(phase)}`;
    if (text === this.clockShown) return;
    this.clockShown = text;
    const night = period === "Night";
    this.clockEl.replaceChildren(h(`span.orb${night ? ".moon" : ""}`), text);
  }

  private you = "";
  private playerNames = new Map<string, string>();

  /** The crew of a ship, for its panel and the buttons to climb aboard or step off. */
  private crewParts(
    ship: ShipEntity,
    refs: { crew?: HTMLElement },
    button: (
      label: string | Node,
      onclick: () => void,
      enabled: () => boolean,
      title?: string,
    ) => HTMLButtonElement,
    cmd: (c: Command) => () => void,
    state: GameState,
  ): HTMLElement[] {
    refs.crew = h("div.desc");
    const mine = (): boolean => {
      const me = [...state.entities.values()].find(
        (e) => e.type === "character" && e.playerId === this.you,
      );
      return me?.type === "character" && me.aboard === ship.id;
    };
    return [
      refs.crew,
      h(
        "div.actions",
        {},
        button(
          "Board ship (F)",
          cmd({ kind: "board-ship", shipId: ship.id }),
          () => !mine(),
          "Walk to the ship and climb aboard. The first aboard is the captain and steers with WASD",
        ),
        button(
          "Leave ship (F)",
          cmd({ kind: "leave-ship" }),
          mine,
          "Step off onto the shore or a pier",
        ),
      ),
    ];
  }

  private crewText(ship: ShipEntity, state: GameState): string {
    if (ship.riders.length === 0) return "No captain: board to take the helm";
    const name = (id: number): string => {
      const c = state.entities.get(id);
      return c?.type === "character" ? (this.playerNames.get(c.playerId) ?? "?") : "?";
    };
    const passengers = ship.riders.slice(1).map(name);
    return `Captain ${name(ship.riders[0]!)}${passengers.length ? ` · Passengers: ${passengers.join(", ")}` : ""}`;
  }

  setPlayers(players: PlayerInfo[], you: string, status: SessionStatus): void {
    this.you = you;
    this.playerNames = new Map(players.map((p) => [p.id, p.name]));
    this.playersEl.replaceChildren(
      ...players.map((p) =>
        h(
          `div.player${p.online ? "" : ".offline"}`,
          {},
          h("span.dot", { style: { background: p.color } }),
          h("span", {}, p.name + (p.id === you ? " (you)" : "")),
        ),
      ),
    );
    this.statusEl.textContent =
      status === "offline"
        ? "Offline game"
        : status === "online"
          ? `${players.filter((p) => p.online).length} of 8 online`
          : status === "reconnecting"
            ? "Reconnecting…"
            : "Connecting…";
    this.banner(status === "reconnecting" ? "Connection lost: reconnecting…" : null);
  }

  // ------------------------------------------------------------------------- selection

  /** Dress the selection panel as a conversation (or undress it, with null). */
  setTalk(talk: Talk | null): void {
    if (talk?.name === this.talk?.name && talk?.line === this.talk?.line) return;
    this.talk = talk;
    this.selectionEl.classList.toggle("dialog", talk !== null);
    // Not "": that would mean an empty panel, and a stale one would never be cleared.
    if (this.selectionKey !== "") this.selectionKey = "?";
  }

  setSelection(state: GameState, id: number | null): void {
    const e = id === null ? undefined : state.entities.get(id);
    if (!e || (e.type === "villager" && e.aboard !== null)) {
      if (this.selectionKey !== "") {
        this.selectionEl.replaceChildren();
        this.selectionKey = "";
        this.selectionRefs = { buttons: [] };
      }
      return;
    }
    const key = selectionKey(e) + (this.talk ? `:${this.talk.name}:${this.talk.line}` : "");
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      this.buildSelection(state, e);
    }
    this.updateSelection(state, e);
  }

  /** The Great Work's stage list: what each stage needs, what the treasury holds, and Fund. */
  private renderGreatWork(
    state: GameState,
    gw: BuildingEntity,
    refs: typeof this.selectionRefs,
  ): void {
    const rows = stageRows(state, gw);
    const key = JSON.stringify([
      gw.stage,
      gw.complete,
      rows.map((r) => r.cost.map((c) => c.have)),
      state.discovered.size,
    ]);
    if (key === refs.greatKey || !refs.great) return;
    refs.greatKey = key;
    refs.greatButtons = [];
    const icon = (res: Resource) => {
      const el = h("span.icon");
      if (this.atlas.has(ICON[res])) Object.assign(el.style, this.atlas.iconStyle(ICON[res], 1));
      return el;
    };
    const stateLabel = { done: "Complete", building: "Being built…", next: "", later: "" } as const;
    const nodes: HTMLElement[] = rows.map((r) => {
      const head = h(
        "div.gw-head",
        {},
        h("strong", {}, `${r.index + 1}. ${r.name}`),
        h("small", {}, stateLabel[r.state]),
      );
      if (r.state === "done") return h("div.gw-stage.done", {}, head);
      const goods = h(
        "div.gw-goods",
        {},
        ...r.cost.map((c) =>
          h(
            `div.gw-good${c.have >= c.need ? ".ok" : ""}`,
            { title: LABEL[c.res] },
            icon(c.res),
            h("span.n", {}, `${Math.min(c.have, c.need)}/${c.need}`),
            c.hint ? h("small", {}, c.hint) : null,
          ),
        ),
      );
      const fund =
        r.state === "next" && gw.complete
          ? (() => {
              const el = h(
                "button.btn.primary",
                {
                  title: "Spends these goods from the treasury; villagers then raise the stage",
                  onclick: () =>
                    this.actions.command({ kind: "fund-great-work", buildingId: gw.id }),
                },
                `Fund ${r.name}`,
              ) as HTMLButtonElement;
              refs.greatButtons!.push({
                el,
                enabled: () => {
                  const live = stageRows(this.actions.state(), gw).find((x) => x.index === r.index);
                  return !!live?.ready;
                },
              });
              return el;
            })()
          : null;
      return h(`div.gw-stage.${r.state}`, {}, head, h("small.gw-blurb", {}, r.blurb), goods, fund);
    });
    const finished = (gw.stage ?? 0) >= rows.length && gw.complete;
    if (finished) {
      const el = h(
        "button.btn",
        { onclick: () => this.showChronicle(this.actions.state()) },
        "Read the chronicle",
      ) as HTMLButtonElement;
      nodes.push(el);
    }
    refs.great.replaceChildren(...nodes);
  }

  /** The end-of-expedition screen: the story of the voyage in numbers. */
  showChronicle(state: GameState): void {
    this.root.querySelector(".chronicle")?.remove();
    const close = () => this.root.querySelector(".chronicle")?.remove();
    const thumb = buildingThumb("great_work", this.tribe);
    const pic = h("span.icon");
    if (this.atlas.has(thumb)) Object.assign(pic.style, this.atlas.iconStyle(thumb, 1.4));
    const done = state.stats.wonderAt !== null;
    this.root.append(
      h(
        "div.chronicle",
        { onclick: close },
        h(
          "div.chronicle-card.panel",
          { onclick: (e: Event) => e.stopPropagation() },
          pic,
          h("h2", {}, done ? "The Great Work is complete" : "Chronicle of the expedition"),
          h(
            "p",
            {},
            done
              ? "The archipelago will remember this expedition. Here is how it went:"
              : "How the expedition has gone so far:",
          ),
          h(
            "div.chronicle-rows",
            {},
            ...chronicleRows(state).map((r) =>
              h("div.row", {}, h("span", {}, r.label), h("strong", {}, r.value)),
            ),
          ),
          h("button.btn.primary", { onclick: close }, "Keep exploring"),
        ),
      ),
    );
  }

  private refreshSelectionButtons(): void {
    for (const b of this.selectionRefs.buttons) b.el.disabled = !b.enabled();
    for (const b of this.selectionRefs.greatButtons ?? []) b.el.disabled = !b.enabled();
  }

  private buildSelection(state: GameState, e: Entity): void {
    const refs: typeof this.selectionRefs = { buttons: [] };
    const icon = (name: string) => {
      const el = h("span.icon");
      if (this.atlas.has(name)) {
        const f = this.atlas.size(name);
        Object.assign(el.style, this.atlas.iconStyle(name, Math.min(2, 40 / f.h, 48 / f.w)));
      }
      return el;
    };
    const button = (
      label: string | Node,
      onclick: () => void,
      enabled: () => boolean,
      title?: string,
    ) => {
      const el = h("button.btn", { onclick, title }, label) as HTMLButtonElement;
      refs.buttons.push({ el, enabled });
      return el;
    };
    const small = (res: Resource, n: number) => h("span.amount", {}, icon(ICON[res]), String(n));
    const cmd = (c: Command) => () => this.actions.command(c);
    const parts: (HTMLElement | null)[] = [];
    if (e.type === "building") {
      const def = BUILDINGS[e.kind];
      const talk = e.complete ? this.talk : null;
      if (talk) {
        parts.push(
          h(
            "div.title",
            {},
            icon(villagerSprite(this.tribe, 1, false, "stand")),
            `${talk.name}, ${talk.title}`,
          ),
        );
        parts.push(h("div.desc.speech", {}, `“${talk.line}”`));
      } else {
        parts.push(h("div.title", {}, icon(buildingThumb(e.kind, this.tribe)), def.name));
        parts.push(h("div.desc", {}, def.description));
      }
      refs.status = h("div.desc");
      refs.bar = h("div");
      parts.push(refs.status, h("div.bar", {}, refs.bar));
      const actions = h("div.actions");
      if (e.kind === "town_hall") {
        actions.append(
          button(
            `Train villager (${VILLAGER.trainCost.food} food)`,
            cmd({ kind: "train-villager", buildingId: e.id }),
            () => canAfford(state.stock, VILLAGER.trainCost),
          ),
        );
      }
      const harbourLike = e.kind === "harbour" || (e.kind === "dock" && e.harbour === undefined);
      if (harbourLike && e.complete) {
        const cost = shipCost(state.world.tribe);
        const cargo = cargoCost(state.world.tribe);
        actions.append(
          button(
            `Build scout ship (${cost.wood} wood)`,
            cmd({ kind: "build-ship", buildingId: e.id, ship: "scout" }),
            () => canAfford(state.stock, cost),
            "Explores, and ferries villagers to new islands",
          ),
          button(
            `Build cargo ship (${cargo.wood} wood, ${cargo.stone} stone)`,
            cmd({ kind: "build-ship", buildingId: e.id, ship: "cargo" }),
            () => canAfford(state.stock, cargo),
            "Carries an island's stockpile home along a trade route",
          ),
          button(
            `Build patrol boat (${PATROL.cost.wood} wood, ${PATROL.cost.tools} tools)`,
            cmd({ kind: "build-ship", buildingId: e.id, ship: "patrol" }),
            () => canAfford(state.stock, PATROL.cost),
            "An armed ship that hunts pirates on its own",
          ),
        );
      }
      if (e.complete && (harbourLike || BUILDINGS[e.kind].dropOff)) {
        refs.extra = h("div.desc");
        parts.push(refs.extra);
      }
      if (e.kind === "market" && e.complete)
        parts.push(this.marketPanel(state, button, small, cmd));
      if (e.kind === "great_work") {
        refs.great = h("div.great");
        parts.push(refs.great);
      }
      if ((e.kind === "magic_house" || harbourLike) && e.complete) {
        refs.upgrades = [];
        const list = h("div.upgrades", {});
        for (const id of UPGRADE_IDS) {
          const up = UPGRADES[id];
          if (up.at !== (harbourLike ? "harbour" : e.kind)) continue;
          const cost = h("span.cost");
          for (const [res, n] of Object.entries(up.cost))
            cost.append(small(res as Resource, n ?? 0));
          const btn = button(
            "Learn",
            cmd({ kind: "buy-upgrade", upgrade: id }),
            () => !state.upgrades.has(id) && canAfford(state.stock, up.cost),
          );
          const row = h(
            "div.upgrade",
            {},
            h("strong", {}, up.name),
            ` ${up.description} `,
            cost,
            btn,
          );
          refs.upgrades.push({ id, row, btn });
          list.append(row);
        }
        parts.push(list);
      }
      // Once a stage of the Great Work stands, it stays.
      if (def.buildable && !(e.kind === "great_work" && (e.stage ?? 0) >= 1)) {
        actions.append(
          button(
            !e.complete ? "Cancel" : talk ? "Ask to pull the building down" : "Demolish",
            () => {
              this.actions.command({ kind: "remove-building", buildingId: e.id });
              this.actions.deselect();
            },
            () => true,
            e.complete ? "Removes the building and refunds half its cost" : "Refunds the full cost",
          ),
        );
      }
      if (actions.children.length) parts.push(actions);
    } else if (e.type === "node") {
      const def = NODES[e.kind];
      parts.push(h("div.title", {}, icon(ICON[def.resource]), def.name));
      refs.status = h("div.desc");
      parts.push(refs.status);
      if (e.stage === "grown") {
        parts.push(
          h(
            "div.actions",
            {},
            button(
              e.marked ? "Unmark" : "Mark for gathering",
              cmd({ kind: "mark", nodeIds: [e.id], marked: !e.marked }),
              () => true,
            ),
          ),
        );
      }
    } else if (e.type === "villager") {
      parts.push(
        h("div.title", {}, icon(villagerSprite(this.tribe, e.tunic, false, "stand")), "Villager"),
      );
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          "Right-click a tree, rock, building or the ground to give orders. Right-click a ship to board it.",
        ),
      );
    } else if (e.type === "pirate") {
      parts.push(h("div.title", {}, icon("icon_ship"), "Pirate ship"));
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          "Raiders hunt your ships and rob your storehouses. Sink them with patrol boats, cannons or Stormcaller, then salvage the wreck.",
        ),
      );
    } else if (e.type === "wreck") {
      parts.push(
        h(
          "div.title",
          {},
          icon("icon_ship"),
          e.kind === "skeleton" ? "Bones of a raider" : "Shipwreck",
        ),
      );
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          e.kind === "skeleton"
            ? "Right-click with a villager selected to pick through what the raider left behind."
            : "Right-click with a scout ship or patrol boat selected to salvage it.",
        ),
      );
    } else if (e.type === "site") {
      parts.push(
        h(
          "div.title",
          {},
          icon("icon_relic"),
          e.kind === "fortress" ? "Sunken fortress" : "Sunken ruins",
        ),
      );
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          "Sail a scout ship with villagers aboard over the site and right-click it to send them diving. They are the divers.",
        ),
      );
    } else {
      const ship = e as ShipEntity;
      if (ship.kind === "patrol") {
        parts.push(h("div.title", {}, icon("icon_ship"), "Patrol boat"));
        refs.status = h("div.desc");
        parts.push(
          refs.status,
          h(
            "div.desc",
            {},
            `An armed ship. It hunts pirates within ${PATROL.engage} tiles by itself; right-click the sea to send it elsewhere, or a shipwreck to salvage it. It mends at a harbour. Board it to sail it yourself.`,
          ),
          ...this.crewParts(ship, refs, button, cmd, state),
        );
        this.selectionRefs = refs;
        this.selectionEl.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
        return;
      }
      if (ship.kind === "cargo") {
        parts.push(h("div.title", {}, icon("icon_ship"), "Cargo ship"));
        refs.status = h("div.desc");
        refs.extra = h("div.desc");
        parts.push(
          refs.status,
          refs.extra,
          h(
            "div.desc",
            {},
            "Right-click a harbour on another island to set a trade route: the ship collects that island's stockpile and sails it home. Right-click the sea to send it somewhere, or board it and sail it yourself.",
          ),
          ...this.crewParts(ship, refs, button, cmd, state),
          h(
            "div.actions",
            {},
            button(
              "Cancel route",
              cmd({ kind: "set-route", shipId: ship.id, dockId: null }),
              () => (state.entities.get(ship.id) as ShipEntity | undefined)?.route != null,
            ),
          ),
        );
        this.selectionRefs = refs;
        this.selectionEl.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
        return;
      }
      parts.push(h("div.title", {}, icon("icon_ship"), "Scout ship"));
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          "Right-click the sea to sail, or an island to sail there and put your passengers ashore. Right-click a sunken site to send them diving, or a shipwreck to salvage it. Board it (F) to sail it yourself with WASD.",
        ),
        ...this.crewParts(ship, refs, button, cmd, state),
        h(
          "div.actions",
          {},
          button(
            "Send divers",
            () => {
              const site = nearestSite(state, ship);
              if (site) this.actions.command({ kind: "dive", shipId: ship.id, siteId: site.id });
            },
            () => {
              const live = state.entities.get(ship.id) as ShipEntity | undefined;
              return !!live && live.passengers.length > 0 && !!nearestSite(state, live);
            },
            `Villagers aboard dive for ${diveSeconds(this.tribe)} seconds and bring up part of the treasure`,
          ),
          button(
            "Take a villager aboard",
            cmd({ kind: "call-aboard", shipId: ship.id }),
            () =>
              (state.entities.get(ship.id) as ShipEntity | undefined)?.passengers.length !==
              scoutCapacity(state),
            "The nearest villager on this shore walks over and climbs aboard",
          ),
          button(
            "Land passengers",
            cmd({ kind: "unload", shipId: ship.id }),
            () =>
              ((state.entities.get(ship.id) as ShipEntity | undefined)?.passengers.length ?? 0) > 0,
          ),
        ),
      );
    }
    this.selectionRefs = refs;
    this.selectionEl.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  }

  private marketPanel(
    state: GameState,
    button: (
      label: string | Node,
      onclick: () => void,
      enabled: () => boolean,
      title?: string,
    ) => HTMLButtonElement,
    small: (res: Resource, n: number) => HTMLElement,
    cmd: (c: Command) => () => void,
  ): HTMLElement {
    const rows = h("div.trade");
    for (const res of RESOURCES) {
      const price = MARKET_PRICES[res];
      if (price === undefined) continue;
      const buyable = MARKET_BUYABLE.includes(res);
      const pays = sellPrice(res, this.tribe);
      rows.append(
        h("span.trade-name", {}, small(res, MARKET_LOT)),
        button(
          h("span", {}, "Sell → ", small("gold", pays)),
          cmd({ kind: "trade", resource: res, action: "sell" }),
          () => state.stock[res] >= MARKET_LOT,
          `Sell ${MARKET_LOT} ${res} for ${pays} gold`,
        ),
        buyable
          ? button(
              h("span", {}, "Buy for ", small("gold", price * 2)),
              cmd({ kind: "trade", resource: res, action: "buy" }),
              () => state.stock.gold >= price * 2,
              `Buy ${MARKET_LOT} ${res} for ${price * 2} gold`,
            )
          : h("span"),
      );
    }
    return rows;
  }

  private updateSelection(state: GameState, e: Entity): void {
    const refs = this.selectionRefs;
    if (e.type === "building") {
      const job = e.queue[0];
      let status = "";
      let progress = 1;
      const worker = BUILDINGS[e.kind].worker;
      if (!e.complete) {
        status = `Under construction: ${Math.floor(e.progress * 100)}%`;
        progress = e.progress;
      } else if (job) {
        const total =
          job.what === "ship"
            ? SHIP.buildSeconds
            : job.what === "cargo"
              ? CARGO.buildSeconds
              : VILLAGER.trainSeconds;
        progress = 1 - job.remaining / total;
        status =
          job.what !== "villager" && job.remaining === 0
            ? "Ship ready: waiting for a free berth (sail one away, or upgrade the pier)"
            : `${job.what === "villager" ? "Training a villager" : job.what === "cargo" ? "Building a cargo ship" : "Building a ship"}… ${Math.ceil(job.remaining)}s`;
        if (e.queue.length > 1) status += ` (+${e.queue.length - 1} queued)`;
      } else if (worker && e.workerId === null) {
        status = "Waiting for a worker (needs an idle villager)";
        progress = 0;
      } else if (e.kind === "farm") {
        status = "A farmer tends the wheat";
        progress = e.growth / FARM.cycle;
      } else if (e.kind === "blacksmith") {
        const enough = state.stock.ore >= SMITH.ore;
        const seconds = smithSeconds(this.tribe);
        status = enough
          ? `Forging: ${SMITH.ore} ore → ${SMITH.tools} tools every ${seconds}s`
          : `Waiting for ore (needs ${SMITH.ore}); build a mine near ore deposits`;
        progress = e.growth / seconds;
      } else if (e.kind === "church") {
        status = `A priest gathers ${CHURCH.faith} faith every ${CHURCH.seconds}s`;
        progress = e.growth / CHURCH.seconds;
      } else if (worker) {
        status = "Staffed by a villager";
      } else if (e.kind === "town_hall") {
        status = `Population ${population(state)}/${populationCap(state)}`;
      } else if (e.kind === "great_work") {
        const stages = greatWorkStages(state.world).length;
        status =
          (e.stage ?? 0) >= stages
            ? "The Great Work is complete"
            : `Stage ${e.stage ?? 0} of ${stages} complete`;
      } else if (e.kind === "lighthouse") {
        status = `Its beam watches ${WATCH.lighthouse} tiles of sea, day and night`;
      } else if (e.kind === "magic_house") {
        status = `Treasury: ${state.stock.gold} gold · ${state.stock.faith} faith · ${state.stock.crystal} crystal · ${state.stock.relic} relics`;
      } else {
        status = "Ready";
      }
      if (refs.status) refs.status.textContent = status;
      if (refs.extra) {
        const slots = e.kind === "harbour" ? berthSlots(state, e) : [];
        refs.extra.textContent =
          (slots.length > 0 ? `Berths: ${berthsFree(state, e)}/${slots.length} free. ` : "") +
          stockpileText(state, e);
      }
      if (refs.great) this.renderGreatWork(state, e, refs);
      for (const u of refs.upgrades ?? []) {
        const owned = state.upgrades.has(u.id);
        u.row.classList.toggle("owned", owned);
        u.btn.textContent = owned ? "Learned" : "Learn";
      }
      if (refs.bar)
        refs.bar.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    } else if (e.type === "node") {
      const def = NODES[e.kind];
      if (refs.status)
        refs.status.textContent =
          e.stage === "grown"
            ? `${e.amount} ${def.resource} left${e.marked ? " · marked for gathering" : ""}`
            : e.stage === "bare"
              ? "Picked clean: regrowing"
              : e.stage === "stump"
                ? "A stump: a sapling will sprout here"
                : "A sapling growing into a tree";
    } else if (e.type === "villager") {
      if (refs.status) refs.status.textContent = describeVillager(state, e);
    } else if (e.type === "pirate") {
      if (refs.status) refs.status.textContent = describePirate(state, e);
    } else if (e.type === "wreck") {
      if (refs.status) refs.status.textContent = `Holds ${goodsText(e.loot)}`;
    } else if (e.type === "site") {
      if (refs.status)
        refs.status.textContent = e.found
          ? `Treasure left: ${goodsText(e.loot)}`
          : "Something lies below…";
    } else if (refs.status) {
      const report = describeShip(state, e as ShipEntity);
      refs.status.textContent = [report.doing, report.extra, report.hull]
        .filter((part): part is string => part !== null)
        .join(" · ");
      if (refs.extra && report.route) refs.extra.textContent = report.route;
      if (refs.crew) refs.crew.textContent = this.crewText(e as ShipEntity, state);
    }
    this.refreshSelectionButtons();
  }
}

/** How many of a harbour's moorings have no ship in them. */
function berthsFree(state: GameState, b: BuildingEntity): number {
  const ships = [...state.entities.values()].filter((e) => e.type === "ship");
  return berthSlots(state, b).filter(
    (s) => !ships.some((e) => Math.hypot(e.x - s.x, e.y - s.y) < 1.7),
  ).length;
}

/** What a dock or storehouse holds on its island, and whether it still needs collecting. */
function stockpileText(state: GameState, b: BuildingEntity): string {
  const island = islandAt(state, b.x, b.y);
  if (island === state.world.start.islandId) return "Goods are stored in the shared treasury.";
  const pile = stockOf(state, island);
  const items = RESOURCES.filter((r) => pile[r] > 0).map((r) => `${pile[r]} ${r}`);
  return items.length > 0
    ? `Waiting on ${describeIsland(state, island)} for a cargo ship: ${items.join(", ")}`
    : `Nothing stored on ${describeIsland(state, island)}. Goods gathered here need a dock and a cargo ship to reach home.`;
}

function selectionKey(e: Entity): string {
  if (e.type === "building") return `b${e.id}:${e.complete}`;
  if (e.type === "node") return `n${e.id}:${e.stage}:${e.marked}`;
  return `${e.type}${e.id}`;
}

function describeVillager(state: GameState, v: VillagerEntity): string {
  const carrying = v.carrying ? ` · carrying ${v.carrying.amount} ${v.carrying.resource}` : "";
  const t = v.task;
  if (v.aboard !== null) return "At sea";
  if (v.action === "deliver")
    return `Taking ${v.carrying?.amount ?? 0} ${v.carrying?.resource ?? "goods"} to storage`;
  if (!t) return `Idle${carrying}`;
  if (t.kind === "move") return `Walking${carrying}`;
  if (t.kind === "board") return "Heading to the ship";
  if (t.kind === "loot") return `${v.action === "work" ? "Searching" : "Heading to"} the bones`;
  if (t.kind === "harvest") {
    const n = state.entities.get(t.nodeId) as NodeEntity | undefined;
    const what = n ? NODES[n.kind].name.toLowerCase() : "resources";
    const verb =
      n && NODES[n.kind].tool === "axe"
        ? "Chopping"
        : n && NODES[n.kind].tool === "pick"
          ? "Mining"
          : "Gathering";
    return `${v.action === "work" ? verb : "Heading to"} ${what}${carrying}`;
  }
  const b = state.entities.get(t.buildingId) as BuildingEntity | undefined;
  const name = b ? BUILDINGS[b.kind].name : "a building";
  if (t.kind === "build") return `${v.action === "work" ? "Building" : "Heading to build"} ${name}`;
  return `${v.action === "work" ? "Working at" : "Heading to"} ${name}${carrying}`;
}

// ---------------------------------------------------------------------------- minimap

export class Minimap {
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private base: Uint32Array | null = null;
  private fog: Uint32Array | null = null;
  private image: ImageData | null = null;

  constructor(onClick: (x: number, y: number) => void) {
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("pointerdown", (e) => {
      const r = this.canvas.getBoundingClientRect();
      onClick(
        ((e.clientX - r.left) / r.width) * this.canvas.width,
        ((e.clientY - r.top) / r.height) * this.canvas.height,
      );
    });
  }

  private prepare(state: GameState): void {
    const w = state.world;
    this.canvas.width = w.width;
    this.canvas.height = w.height;
    this.image = this.ctx.createImageData(w.width, w.height);
    const colours = mapColours(w);
    this.base = colours.base;
    this.fog = colours.fog;
  }

  draw(state: GameState, view: { x: number; y: number }[], players: PlayerInfo[] = []): void {
    if (!this.base || this.canvas.width !== state.world.width) this.prepare(state);
    const img = this.image!;
    const px = new Uint32Array(img.data.buffer);
    const base = this.base!;
    const fog = this.fog!;
    const explored = state.explored;
    for (let k = 0; k < px.length; k++) px[k] = explored[k] ? base[k]! : fog[k]!;
    const w = state.world;
    const dot = (x: number, y: number, c: number, r = 1) => {
      for (let dy = -r + 1; dy < r; dy++)
        for (let dx = -r + 1; dx < r; dx++) {
          const tx = Math.floor(x) + dx;
          const ty = Math.floor(y) + dy;
          if (tx >= 0 && ty >= 0 && tx < w.width && ty < w.height) px[tileIndex(w, tx, ty)] = c;
        }
    };
    for (const e of state.entities.values()) {
      if (e.type === "building") {
        for (let y = e.y; y < e.y + e.h; y++)
          for (let x = e.x; x < e.x + e.w; x++) dot(x, y, abgr("#5b4028"));
      } else if (e.type === "villager" && e.aboard === null) dot(e.x, e.y, abgr("#fbf0cf"));
      else if (e.type === "character" && e.aboard === null && e.inside === null) {
        const colour = players.find((p) => p.id === e.playerId)?.color ?? "#f0e6d0";
        dot(e.x, e.y, abgr(colour), 2);
      } else if (e.type === "ship") dot(e.x, e.y, abgr("#e98a3a"), 2);
      else if (e.type === "pirate" && pirateSpotted(state, e)) dot(e.x, e.y, abgr("#d9486a"), 2);
      else if (
        e.type === "storm" &&
        stormStrength(e) > 0 &&
        state.explored[tileIndex(w, Math.floor(e.x), Math.floor(e.y))]
      ) {
        // A storm is a ring of pale pixels round its eye.
        for (let a = 0; a < 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          dot(e.x + Math.cos(t) * e.radius, e.y + Math.sin(t) * e.radius, abgr("#c4d4e0"));
        }
      } else if (e.type === "site" && e.found) dot(e.x, e.y, abgr("#6cb9a8"), 1);
    }
    this.ctx.putImageData(img, 0, 0);
    if (view.length === 4) {
      this.ctx.strokeStyle = "rgba(251,240,207,0.9)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      view.forEach((p, i) => (i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)));
      this.ctx.closePath();
      this.ctx.stroke();
    }
  }
}

import {
  BIOMES,
  BUILDINGS,
  canAfford,
  CHURCH,
  discoveryName,
  FARM,
  MARKET_BUYABLE,
  MARKET_LOT,
  MARKET_PRICES,
  NODES,
  population,
  populationCap,
  RESOURCES,
  SHIP,
  shipCost,
  SMITH,
  Terrain,
  tileIndex,
  TRIBE_DEFS,
  VILLAGER,
  type BiomeId,
  type BuildingEntity,
  type BuildingKind,
  type Command,
  type Entity,
  type GameState,
  type NodeEntity,
  type PlayerInfo,
  type Resource,
  type ShipEntity,
  type Stock,
  type TribeId,
  type VillagerEntity,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import type { SessionStatus } from "../net/session";
import { ATMOSPHERE, OCEAN } from "../render/biomeStyle";
import { buildingThumb, villagerSprite } from "../render/names";
import { h } from "./dom";

export type Tool =
  { kind: "select" } | { kind: "build"; building: BuildingKind } | { kind: "harvest" };

export interface HudActions {
  tool(t: Tool): void;
  command(cmd: Command): void;
  chat(text: string): void;
  focusTile(x: number, y: number): void;
  deselect(): void;
}

const ICON: Record<Resource, string> = {
  wood: "icon_wood",
  stone: "icon_stone",
  food: "icon_food",
  ore: "icon_ore",
  tools: "icon_tools",
  gold: "icon_gold",
  faith: "icon_faith",
  crystal: "icon_crystal",
};

const LABEL: Record<Resource, string> = {
  wood: "Wood",
  stone: "Stone",
  food: "Food",
  ore: "Ore",
  tools: "Tools",
  gold: "Gold",
  faith: "Faith",
  crystal: "Crystal",
};

/** Upgrades the magic house will sell once they're built (shown as a teaser for now). */
const COMING_UPGRADES = [
  ["Far Sight", "Ships reveal twice as far"],
  ["Swift Sails", "Ships sail 50% faster"],
  ["Seer's Chart", "Reveal the outline of every island"],
  ["Calm Waters", "Ships can sail through sea rocks"],
];

export function discoveryText(biome: BiomeId): string {
  return `Discovered ${discoveryName(biome)}!`;
}

export class Hud {
  readonly root: HTMLElement;
  private resEls = new Map<string, HTMLElement>();
  private lastStock: Stock | null = null;
  private buildButtons = new Map<string, HTMLButtonElement>();
  private selectionEl: HTMLElement;
  private selectionKey = "";
  private selectionRefs: {
    status?: HTMLElement;
    bar?: HTMLElement;
    buttons: { el: HTMLButtonElement; enabled: () => boolean }[];
  } = { buttons: [] };
  private playersEl: HTMLElement;
  private statusEl: HTMLElement;
  private toastsEl: HTMLElement;
  private chatLog: HTMLElement;
  private chatInput: HTMLInputElement;
  private helpEl: HTMLElement;
  private bannerEl: HTMLElement;
  private biomeEl: HTMLElement;
  private biomeTimer: ReturnType<typeof setTimeout> | null = null;
  readonly minimap: Minimap;

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
    const gather = h(
      "button.build-item",
      {
        title: "Mark trees, rocks and bushes for villagers to gather (drag to mark an area)",
        onclick: () => actions.tool({ kind: "harvest" }),
      },
      h("span.thumb", {}, icon("icon_axe", 2)),
      h(
        "span",
        {},
        h("span.name", {}, "Gather", h("span.kbd", {}, "H")),
        h("span.cost", {}, "Mark goods"),
      ),
    ) as HTMLButtonElement;
    this.buildButtons.set("harvest", gather);
    grid.append(gather);
    for (const def of Object.values(BUILDINGS)) {
      if (!def.buildable) continue;
      const thumbName = buildingThumb(def.kind, tribe);
      const f = atlas.frame(thumbName);
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
    const tribeDef = TRIBE_DEFS[tribe];
    const players = h(
      "div.players.panel",
      {},
      h(
        "h3",
        { title: `${tribeDef.description} ${tribeDef.bonusText}.` },
        h("span.dot", { style: { background: tribeDef.banner } }),
        `Expedition · ${tribeDef.name}`,
      ),
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
    );

    this.minimap = new Minimap((x, y) => actions.focusTile(x, y));
    const minimap = h("div.minimap.panel", {}, this.minimap.canvas);

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
      this.toastsEl,
      this.helpEl,
      this.bannerEl,
      this.biomeEl,
    );
    parent.append(this.root);
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
      if (["ore", "tools", "gold", "faith", "crystal"].includes(r)) {
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
      if (kind === "harvest") continue;
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
      const active =
        (tool.kind === "harvest" && kind === "harvest") ||
        (tool.kind === "build" && tool.building === kind);
      btn.classList.toggle("active", active);
    }
    this.help(
      tool.kind === "build"
        ? tool.building === "path"
          ? "Click or drag to lay paths · Right-click or Esc to stop"
          : "Click to place · Shift-click to keep placing · Right-click or Esc to cancel"
        : tool.kind === "harvest"
          ? "Click or drag across trees, rocks and bushes to mark them · Shift to unmark · Esc to stop"
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

  setPlayers(players: PlayerInfo[], you: string, status: SessionStatus): void {
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
    const key = selectionKey(e);
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      this.buildSelection(state, e);
    }
    this.updateSelection(state, e);
  }

  private refreshSelectionButtons(): void {
    for (const b of this.selectionRefs.buttons) b.el.disabled = !b.enabled();
  }

  private buildSelection(state: GameState, e: Entity): void {
    const refs: typeof this.selectionRefs = { buttons: [] };
    const icon = (name: string) => {
      const el = h("span.icon");
      if (this.atlas.has(name)) {
        const f = this.atlas.frame(name);
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
      parts.push(h("div.title", {}, icon(buildingThumb(e.kind, this.tribe)), def.name));
      parts.push(h("div.desc", {}, def.description));
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
      if (e.kind === "dock") {
        const cost = shipCost(state.world.tribe);
        actions.append(
          button(
            `Build scout ship (${cost.wood} wood)`,
            cmd({ kind: "build-ship", buildingId: e.id }),
            () => canAfford(state.stock, cost),
          ),
        );
      }
      if (e.kind === "market" && e.complete)
        parts.push(this.marketPanel(state, button, small, cmd));
      if (e.kind === "magic_house" && e.complete) {
        parts.push(
          h(
            "div.upgrades",
            {},
            h("div.desc", {}, "Magical upgrades for exploring the seas are coming soon:"),
            ...COMING_UPGRADES.map(([name, what]) =>
              h("div.upgrade", {}, h("strong", {}, name!), ` ${what}`),
            ),
          ),
        );
      }
      if (def.buildable) {
        actions.append(
          button(
            e.complete ? "Demolish" : "Cancel",
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
    } else {
      const ship = e as ShipEntity;
      parts.push(h("div.title", {}, icon("icon_ship"), "Scout ship"));
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h(
          "div.desc",
          {},
          "Right-click the sea to sail, or an island to sail there and put your passengers ashore.",
        ),
        h(
          "div.actions",
          {},
          button(
            "Take a villager aboard",
            cmd({ kind: "call-aboard", shipId: ship.id }),
            () =>
              (state.entities.get(ship.id) as ShipEntity | undefined)?.passengers.length !==
              SHIP.capacity,
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
      rows.append(
        h("span.trade-name", {}, small(res, MARKET_LOT)),
        button(
          h("span", {}, "Sell → ", small("gold", price)),
          cmd({ kind: "trade", resource: res, action: "sell" }),
          () => state.stock[res] >= MARKET_LOT,
          `Sell ${MARKET_LOT} ${res} for ${price} gold`,
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
        const total = job.what === "ship" ? SHIP.buildSeconds : VILLAGER.trainSeconds;
        progress = 1 - job.remaining / total;
        status =
          `${job.what === "ship" ? "Building a ship" : "Training a villager"}… ${Math.ceil(job.remaining)}s` +
          (e.queue.length > 1 ? ` (+${e.queue.length - 1} queued)` : "");
      } else if (worker && e.workerId === null) {
        status = "Waiting for a worker (needs an idle villager)";
        progress = 0;
      } else if (e.kind === "farm") {
        status = "A farmer tends the wheat";
        progress = e.growth / FARM.cycle;
      } else if (e.kind === "blacksmith") {
        const enough = state.stock.ore >= SMITH.ore;
        status = enough
          ? `Forging: ${SMITH.ore} ore → ${SMITH.tools} tools every ${SMITH.seconds}s`
          : `Waiting for ore (needs ${SMITH.ore}); build a mine near ore deposits`;
        progress = e.growth / SMITH.seconds;
      } else if (e.kind === "church") {
        status = `A priest gathers ${CHURCH.faith} faith every ${CHURCH.seconds}s`;
        progress = e.growth / CHURCH.seconds;
      } else if (worker) {
        status = "Staffed by a villager";
      } else if (e.kind === "town_hall") {
        status = `Population ${population(state)}/${populationCap(state)}`;
      } else if (e.kind === "magic_house") {
        status = `Treasury: ${state.stock.gold} gold · ${state.stock.faith} faith · ${state.stock.crystal} crystal`;
      } else {
        status = "Ready";
      }
      if (refs.status) refs.status.textContent = status;
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
    } else if (refs.status) {
      const ship = e as ShipEntity;
      const aboard = `${ship.passengers.length}/${SHIP.capacity} aboard`;
      refs.status.textContent = `${ship.dest ? "Sailing…" : "Anchored"} · ${aboard}`;
    }
    this.refreshSelectionButtons();
  }
}

function selectionKey(e: Entity): string {
  if (e.type === "building") return `b${e.id}:${e.complete}`;
  if (e.type === "node") return `n${e.id}:${e.stage}:${e.marked}`;
  return `${e.type}${e.id}`;
}

export function describeVillager(state: GameState, v: VillagerEntity): string {
  const carrying = v.carrying ? ` · carrying ${v.carrying.amount} ${v.carrying.resource}` : "";
  const t = v.task;
  if (v.aboard !== null) return "At sea";
  if (v.action === "deliver")
    return `Taking ${v.carrying?.amount ?? 0} ${v.carrying?.resource ?? "goods"} to storage`;
  if (!t) return `Idle${carrying}`;
  if (t.kind === "move") return `Walking${carrying}`;
  if (t.kind === "board") return "Heading to the ship";
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

function abgr(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
}

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
    const n = w.width * w.height;
    this.base = new Uint32Array(n);
    this.fog = new Uint32Array(n);
    const deep = abgr("#1b5866");
    const shallow = abgr("#349f98");
    const dirt = abgr("#a07650");
    for (let k = 0; k < n; k++) {
      const biome = BIOMES[w.biome[k]!];
      const style = biome ? ATMOSPHERE[biome] : OCEAN;
      this.fog[k] = abgr(style.fog);
      const t = w.terrain[k]!;
      this.base[k] =
        t === Terrain.Deep
          ? deep
          : t === Terrain.Shallow
            ? shallow
            : t === Terrain.Dirt
              ? dirt
              : abgr(
                  t === Terrain.Sand
                    ? style.map.beach
                    : t === Terrain.Rock
                      ? style.map.rock
                      : style.map.ground,
                );
    }
  }

  draw(state: GameState, view: { x: number; y: number }[]): void {
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
      else if (e.type === "ship") dot(e.x, e.y, abgr("#e98a3a"), 2);
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

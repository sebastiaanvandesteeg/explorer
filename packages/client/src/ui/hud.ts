import {
  BUILDINGS,
  canAfford,
  NODES,
  population,
  populationCap,
  RESOURCES,
  SHIP,
  tileIndex,
  Terrain,
  VILLAGER,
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
  type VillagerEntity,
} from "@explorer/shared";
import type { Atlas } from "../assets";
import type { SessionStatus } from "../net/session";
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
};

const NODE_NAMES: Record<string, string> = {
  oak: "Oak tree",
  pine: "Pine tree",
  fruit: "Fruit tree",
  berry: "Berry bush",
  boulder: "Boulder",
  ore: "Rich rock",
};

const THEME_NAMES: Record<string, string> = {
  farmland: "a farmland island",
  forest: "a forested island",
  rocky: "a rocky island",
  islet: "a rocky islet",
  home: "home",
};

export function discoveryText(theme: string): string {
  return `Discovered ${THEME_NAMES[theme] ?? "an island"}!`;
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
  readonly minimap: Minimap;

  constructor(
    parent: HTMLElement,
    private readonly atlas: Atlas,
    private readonly actions: HudActions,
    private readonly inviteUrl: string | null,
  ) {
    const icon = (name: string, scale = 2) => {
      const el = h("span.icon");
      Object.assign(el.style, atlas.iconStyle(name, scale));
      return el;
    };

    const resources = h("div.resources.panel");
    for (const r of [...RESOURCES, "pop"]) {
      const value = h("span", {}, "0");
      const el = h(
        "div.resource",
        { title: r === "pop" ? "Villagers / housing" : r },
        icon(r === "pop" ? "icon_villager" : ICON[r as Resource]),
        value,
      );
      this.resEls.set(r, value);
      resources.append(el);
    }

    const menu = h("div.build-menu.panel", {}, h("h3", {}, "Build"));
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
        h("span.cost", {}, "Mark resources"),
      ),
    ) as HTMLButtonElement;
    this.buildButtons.set("harvest", gather);
    menu.append(gather);
    for (const def of Object.values(BUILDINGS)) {
      if (!def.buildable) continue;
      const thumbName = def.kind === "path" ? "t_path" : def.kind === "farm" ? "farm_2" : def.kind;
      const f = atlas.json.frames[thumbName]!.frame;
      const scale = Math.min(44 / f.w, 36 / f.h, 1);
      const thumb = h("span.thumb", {}, icon(thumbName, scale));
      const cost = h("span.cost");
      for (const [res, n] of Object.entries(def.cost)) {
        cost.append(h("span", { dataset: { res } }, icon(ICON[res as Resource], 1), String(n)));
      }
      const btn = h(
        "button.build-item",
        {
          title: def.description,
          onclick: () => actions.tool({ kind: "build", building: def.kind }),
        },
        thumb,
        h(
          "span",
          {},
          h("span.name", {}, def.name, def.hotkey ? h("span.kbd", {}, def.hotkey) : null),
          cost,
        ),
      ) as HTMLButtonElement;
      this.buildButtons.set(def.kind, btn);
      menu.append(btn);
    }

    this.selectionEl = h("div.selection.panel");
    this.statusEl = h("div.status");
    this.playersEl = h("div");
    const players = h(
      "div.players.panel",
      {},
      h("h3", { style: { margin: "0", fontSize: "13px", opacity: "0.85" } }, "EXPEDITION"),
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
    );
    parent.append(this.root);
  }

  focusChat(): void {
    this.chatInput.focus();
  }

  setStock(state: GameState): void {
    const stock = state.stock;
    for (const r of RESOURCES) {
      const el = this.resEls.get(r)!;
      el.textContent = String(stock[r]);
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
    if (!e) {
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
      const f = this.atlas.json.frames[name]?.frame;
      const el = h("span.icon");
      if (f) Object.assign(el.style, this.atlas.iconStyle(name, Math.min(2, 40 / f.h, 48 / f.w)));
      return el;
    };
    const button = (label: string, onclick: () => void, enabled: () => boolean, title?: string) => {
      const el = h("button.btn", { onclick, title }, label) as HTMLButtonElement;
      refs.buttons.push({ el, enabled });
      return el;
    };
    const parts: (HTMLElement | null)[] = [];
    if (e.type === "building") {
      const def = BUILDINGS[e.kind];
      parts.push(
        h(
          "div.title",
          {},
          icon(
            e.kind === "farm"
              ? "farm_2"
              : e.kind === "path"
                ? "t_path"
                : e.kind === "dock"
                  ? "dock_x_end"
                  : e.kind,
          ),
          def.name,
        ),
      );
      parts.push(h("div.desc", {}, def.description));
      refs.status = h("div.desc");
      refs.bar = h("div");
      parts.push(refs.status, h("div.bar", {}, refs.bar));
      const actions = h("div.actions");
      if (e.kind === "town_hall") {
        actions.append(
          button(
            `Train villager (${VILLAGER.trainCost.food} food)`,
            () => this.actions.command({ kind: "train-villager", buildingId: e.id }),
            () => canAfford(state.stock, VILLAGER.trainCost),
          ),
        );
      }
      if (e.kind === "dock") {
        actions.append(
          button(
            `Build scout ship (${SHIP.cost.wood} wood)`,
            () => this.actions.command({ kind: "build-ship", buildingId: e.id }),
            () => canAfford(state.stock, SHIP.cost),
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
      parts.push(h("div.title", {}, icon(`icon_${def.resource}`), NODE_NAMES[e.kind] ?? e.kind));
      refs.status = h("div.desc");
      parts.push(refs.status);
      if (e.stage === "grown") {
        parts.push(
          h(
            "div.actions",
            {},
            button(
              e.marked ? "Unmark" : "Mark for gathering",
              () => this.actions.command({ kind: "mark", nodeIds: [e.id], marked: !e.marked }),
              () => true,
            ),
          ),
        );
      }
    } else if (e.type === "villager") {
      parts.push(
        h(
          "div.title",
          {},
          icon(`villager_${["blue", "green", "red"][e.tunic % 3]}_front_stand`),
          "Villager",
        ),
      );
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h("div.desc", {}, "Right-click a tree, rock, building or the ground to give orders."),
      );
    } else {
      parts.push(h("div.title", {}, icon("icon_ship"), "Scout ship"));
      refs.status = h("div.desc");
      parts.push(
        refs.status,
        h("div.desc", {}, "Right-click the sea to sail. Ships reveal the map as they go."),
      );
    }
    this.selectionRefs = refs;
    this.selectionEl.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  }

  private updateSelection(state: GameState, e: Entity): void {
    const refs = this.selectionRefs;
    if (e.type === "building") {
      const job = e.queue[0];
      let status = "";
      let progress = 1;
      if (!e.complete) {
        status = `Under construction: ${Math.floor(e.progress * 100)}%`;
        progress = e.progress;
      } else if (job) {
        const total = job.what === "ship" ? SHIP.buildSeconds : VILLAGER.trainSeconds;
        progress = 1 - job.remaining / total;
        status =
          `${job.what === "ship" ? "Building a ship" : "Training a villager"}… ${Math.ceil(job.remaining)}s` +
          (e.queue.length > 1 ? ` (+${e.queue.length - 1} queued)` : "");
      } else if (BUILDINGS[e.kind].worker) {
        status =
          e.workerId !== null
            ? "Staffed by a villager"
            : "Waiting for a worker (needs an idle villager)";
        progress = e.kind === "farm" ? e.growth / 30 : e.workerId !== null ? 1 : 0;
      } else if (e.kind === "town_hall") {
        status = `Population ${population(state)}/${populationCap(state)}`;
      } else {
        status = "Ready";
      }
      if (refs.status) refs.status.textContent = status;
      if (refs.bar) refs.bar.style.width = `${Math.round(progress * 100)}%`;
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
      refs.status.textContent = (e as ShipEntity).dest ? "Sailing…" : "Anchored";
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
  if (v.action === "deliver")
    return `Taking ${v.carrying?.amount ?? 0} ${v.carrying?.resource ?? "goods"} to storage`;
  if (!t) return `Idle${carrying}`;
  if (t.kind === "move") return `Walking${carrying}`;
  if (t.kind === "harvest") {
    const n = state.entities.get(t.nodeId) as NodeEntity | undefined;
    const what = n ? (NODE_NAMES[n.kind] ?? n.kind).toLowerCase() : "resources";
    const verb =
      n && NODES[n.kind].tool === "axe"
        ? "Chopping"
        : n && NODES[n.kind].tool === "pick"
          ? "Mining"
          : "Gathering";
    return `${v.action === "work" ? verb : "Heading to"} a ${what}${carrying}`;
  }
  const b = state.entities.get(t.buildingId) as BuildingEntity | undefined;
  const name = b ? BUILDINGS[b.kind].name : "a building";
  if (t.kind === "build") return `${v.action === "work" ? "Building" : "Heading to build"} ${name}`;
  return `${v.action === "work" ? "Working at" : "Heading to"} ${name}${carrying}`;
}

// ---------------------------------------------------------------------------- minimap

const FOG = 0xff302710;

function abgr(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
}

export class Minimap {
  readonly canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private base: Uint32Array | null = null;
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
    const grass = ["#8a8f38", "#717b31", "#556128", "#3c522c"].map(abgr);
    const rock = ["#8a8a86", "#9a9890", "#a8a69c", "#bdb8a8"].map(abgr);
    const colours: Record<number, number> = {
      [Terrain.Deep]: abgr("#1b5866"),
      [Terrain.Shallow]: abgr("#349f98"),
      [Terrain.Sand]: abgr("#eed099"),
      [Terrain.Dirt]: abgr("#a07650"),
    };
    this.base = new Uint32Array(w.width * w.height);
    for (let k = 0; k < this.base.length; k++) {
      const t = w.terrain[k]!;
      const e = w.elevation[k]!;
      this.base[k] = t === Terrain.Grass ? grass[e]! : t === Terrain.Rock ? rock[e]! : colours[t]!;
    }
  }

  draw(state: GameState, view: { x: number; y: number }[]): void {
    if (!this.base || this.canvas.width !== state.world.width) this.prepare(state);
    const img = this.image!;
    const px = new Uint32Array(img.data.buffer);
    const base = this.base!;
    const explored = state.explored;
    for (let k = 0; k < px.length; k++) px[k] = explored[k] ? base[k]! : FOG;
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
      } else if (e.type === "villager") dot(e.x, e.y, abgr("#fbf0cf"));
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

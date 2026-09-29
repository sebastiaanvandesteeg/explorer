// The full-screen chart of the archipelago (M): every island the team has found, by name, with
// what is stored there, the trade routes, the fleet, wrecks, sunken sites and pirates. It is drawn
// in the same isometric view as the game, so "north-east" on the chart is north-east on screen.
import { HALF_H, HALF_W, tileIndex, type GameState } from "@explorer/shared";
import type { Atlas } from "../assets";
import { describePirate, describeShip, goodsText } from "./describe";
import { h } from "./dom";
import { mapColours } from "./mapColours";
import {
  compassFrom,
  fleetRows,
  goodsList,
  islandRows,
  routeLines,
  seaSights,
  type FleetRow,
  type Goods,
  type IslandRow,
} from "./mapData";
import { ICON } from "./resources";

export interface MapActions {
  state(): GameState;
  /** The four corners of what the camera shows, as tile coordinates. */
  view(): { x: number; y: number }[];
  focusTile(x: number, y: number): void;
  select(id: number): void;
}

const FONT = '"Pixelify Sans", "Trebuchet MS", system-ui, sans-serif';
const INK = "#1b1a1f";
const PARCHMENT = "#eed099";
const PARCHMENT_LIGHT = "#fbf0cf";
const GOLD = "#f6d23a";
const SHIP_COLOURS = { scout: "#e98a3a", cargo: "#fbf0cf", patrol: "#5a9fd4" } as const;
const SQRT2 = Math.SQRT2;

type Hit =
  | { kind: "island"; id: number }
  | { kind: "entity"; id: number; x: number; y: number; title: string; lines: string[] };

export class MapScreen {
  readonly root: HTMLElement;
  private readonly canvas = h<HTMLCanvasElement>("canvas.map-canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly off = document.createElement("canvas");
  private readonly side = h("div.map-side");
  private readonly left: HTMLElement;
  private readonly tip = h("div.map-tip.panel");
  private readonly titleEl = h("h2");
  private timer: ReturnType<typeof setInterval> | null = null;
  private sideKey = "";
  private hover: { hit: Hit; sx: number; sy: number } | null = null;
  /** Screen pixels per tile along the isometric axes, and the chart's origin. */
  private a = 2;
  private b = 1;
  private ox = 0;

  constructor(
    private readonly atlas: Atlas,
    private readonly actions: MapActions,
  ) {
    const close = h(
      "button.btn.mini",
      { title: "Close the map (M or Esc)", onclick: () => this.close() },
      "Close",
    );
    const plate = h("div.map-plate", {}, this.canvas, this.tip);
    this.left = h("div.map-left", {}, plate, this.legend());
    const card = h(
      "div.map-card.panel",
      { onclick: (e: Event) => e.stopPropagation() },
      h("div.map-head", {}, this.titleEl, h("span.map-keys", {}, "M or Esc to close"), close),
      h("div.map-body", {}, this.left, this.side),
    );
    this.root = h(
      "div.mapscreen",
      { style: { display: "none" }, onclick: () => this.close() },
      card,
    );
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerleave", () => this.setHover(null));
    this.canvas.addEventListener("click", () => this.onClick());
  }

  get isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.root.style.display = "";
    this.sideKey = "";
    this.redraw();
    this.timer ??= setInterval(() => this.redraw(), 500);
  }

  close(): void {
    this.root.style.display = "none";
    this.setHover(null);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------------------- geometry

  private project(x: number, y: number): { x: number; y: number } {
    return { x: (x - y) * this.a + this.ox, y: (x + y) * this.b };
  }

  private unproject(sx: number, sy: number): { x: number; y: number } {
    const u = (sx - this.ox) / this.a;
    const v = sy / this.b;
    return { x: (u + v) / 2, y: (v - u) / 2 };
  }

  /** Fit the chart into the space the window allows; the game's own tiles are 2:1. */
  private layout(state: GameState): { width: number; height: number; dpr: number } {
    const w = state.world;
    const wide = window.innerWidth >= 900;
    const availW = Math.max(320, Math.min(1180, window.innerWidth - 40 - (wide ? 340 : 0)));
    const availH = Math.max(200, window.innerHeight - 130);
    // Each tile is a 2:1 rhombus: `a` wide by half that high.
    this.a = Math.max(
      1,
      Math.min(availW / (w.width + w.height), (availH * 2) / (w.width + w.height)),
    );
    this.b = this.a * (HALF_H / HALF_W);
    this.ox = w.height * this.a;
    return {
      width: Math.round((w.width + w.height) * this.a),
      height: Math.round((w.width + w.height) * this.b),
      dpr: window.devicePixelRatio || 1,
    };
  }

  // ------------------------------------------------------------------------- drawing

  private redraw(): void {
    if (!this.isOpen) return;
    const state = this.actions.state();
    const size = this.layout(state);
    const c = this.canvas;
    const px = Math.round(size.width * size.dpr);
    const py = Math.round(size.height * size.dpr);
    if (c.width !== px || c.height !== py) {
      c.width = px;
      c.height = py;
    }
    c.style.width = `${size.width}px`;
    c.style.height = `${size.height}px`;
    // The lists scroll beside the chart rather than stretching the card below it.
    this.side.style.maxHeight =
      window.innerWidth >= 900 ? `${Math.max(340, size.height + 44)}px` : "";
    const ctx = this.ctx;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    this.drawBase(state, size.dpr);
    this.drawOverlay(state);
    this.titleEl.textContent = "Chart of the archipelago";
    this.renderSide(state);
  }

  private drawBase(state: GameState, dpr: number): void {
    const w = state.world;
    if (this.off.width !== w.width || this.off.height !== w.height) {
      this.off.width = w.width;
      this.off.height = w.height;
    }
    const octx = this.off.getContext("2d")!;
    const image = octx.createImageData(w.width, w.height);
    const pixels = new Uint32Array(image.data.buffer);
    const { base, fog } = mapColours(w);
    const explored = state.explored;
    for (let k = 0; k < pixels.length; k++) pixels[k] = explored[k] ? base[k]! : fog[k]!;
    octx.putImageData(image, 0, 0);
    const ctx = this.ctx;
    ctx.save();
    // One image pixel is one tile: shear it into the game's isometric view.
    ctx.setTransform(dpr * this.a, dpr * this.b, -dpr * this.a, dpr * this.b, dpr * this.ox, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0);
    ctx.restore();
    // A border round the diamond, like the edge of a chart.
    const top = this.project(0, 0);
    const right = this.project(w.width, 0);
    const bottom = this.project(w.width, w.height);
    const left = this.project(0, w.height);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    for (const p of [right, bottom, left]) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.strokeStyle = PARCHMENT;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawOverlay(state: GameState): void {
    const ctx = this.ctx;
    const rows = islandRows(state);
    const sights = seaSights(state);

    // Settled islands wear a gold ring, and the one under the mouse a white one.
    const ring = (row: IslandRow, colour: string, width: number, dash: number[] = []) => {
      const c = this.project(row.x + 0.5, row.y + 0.5);
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        (row.radius + 1.5) * SQRT2 * this.a,
        (row.radius + 1.5) * SQRT2 * this.b,
        0,
        0,
        Math.PI * 2,
      );
      ctx.setLineDash(dash);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const row of rows)
      if (row.settled && !row.islet) ring(row, "rgba(246, 210, 58, 0.7)", 1.5, [4, 3]);
    const hovered =
      this.hover?.hit.kind === "island" ? rows.find((r) => r.id === this.hover!.hit.id) : undefined;
    if (hovered) ring(hovered, "rgba(251, 240, 207, 0.95)", 2);

    // Trade routes.
    for (const line of routeLines(state)) {
      const from = this.project(line.from.x, line.from.y);
      const to = this.project(line.to.x, line.to.y);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      this.arrow(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        Math.atan2(to.y - from.y, to.x - from.x),
        GOLD,
        6,
      );
    }

    // Buildings: the town hall stands out, docks are teal, the rest brown.
    for (const e of state.entities.values()) {
      if (e.type !== "building" || e.kind === "path") continue;
      const p = this.project(e.x + e.w / 2, e.y + e.h / 2);
      if (e.kind === "town_hall") this.star(p.x, p.y, 7, GOLD);
      else
        this.square(p.x, p.y, e.kind === "dock" ? 4 : 3, e.kind === "dock" ? "#4fc1b0" : "#a07650");
    }

    // Island names: settled places first, then the biggest, and never on top of each other.
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const labelled = [...rows]
      .filter((r) => !r.islet || r === hovered)
      .sort((p, q) => Number(q.settled) - Number(p.settled) || q.radius - p.radius);
    for (const row of labelled) {
      const c = this.project(row.x + 0.5, row.y + 0.5);
      const half = ctx.measureText(row.name).width / 2 + 3;
      const reach = (row.radius + 1.5) * SQRT2 * this.b;
      for (const dy of [-reach - 8, reach + 9]) {
        const box = { x0: c.x - half, y0: c.y + dy - 8, x1: c.x + half, y1: c.y + dy + 8 };
        if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0))
          continue;
        placed.push(box);
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.strokeText(row.name, c.x, c.y + dy);
        ctx.fillStyle = row.settled ? GOLD : PARCHMENT_LIGHT;
        ctx.fillText(row.name, c.x, c.y + dy);
        break;
      }
    }

    // Things at sea.
    for (const site of sights.sites) {
      const p = this.project(site.x + 0.5, site.y + 0.5);
      const rich = Object.values(site.loot).some((n) => (n ?? 0) > 0);
      this.diamond(
        p.x,
        p.y,
        site.kind === "fortress" ? 7 : 5,
        rich ? "#6cb9a8" : "rgba(108,185,168,0.35)",
      );
    }
    for (const wreck of sights.wrecks) {
      const p = this.project(wreck.x + 0.5, wreck.y + 0.5);
      this.cross(p.x, p.y, 4, wreck.kind === "shipwreck" ? "#a4f4e4" : "#f4eee0");
    }
    for (const e of state.entities.values()) {
      if (e.type !== "ship") continue;
      const p = this.project(e.x, e.y);
      const ahead = this.project(
        e.x + Math.cos((e.heading * Math.PI) / 4),
        e.y + Math.sin((e.heading * Math.PI) / 4),
      );
      this.arrow(p.x, p.y, Math.atan2(ahead.y - p.y, ahead.x - p.x), SHIP_COLOURS[e.kind], 6);
    }
    for (const p of sights.pirates) {
      const s = this.project(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#d9486a";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      this.cross(s.x, s.y, 2.5, PARCHMENT_LIGHT);
    }

    // What the camera is looking at.
    const view = this.actions.view();
    if (view.length === 4) {
      ctx.beginPath();
      view.forEach((v, i) => {
        const p = this.project(v.x, v.y);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(251, 240, 207, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private arrow(x: number, y: number, angle: number, colour: string, r: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.7);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.7, -r * 0.7);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  private star(x: number, y: number, r: number, colour: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  private square(x: number, y: number, r: number, colour: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = colour;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x - r + 0.5, y - r + 0.5, r * 2 - 1, r * 2 - 1);
  }

  private diamond(x: number, y: number, r: number, colour: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  private cross(x: number, y: number, r: number, colour: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colour;
    ctx.stroke();
  }

  // ------------------------------------------------------------------------- hovering

  /** What is under a point of the chart: ships, pirates and the like first, then the island. */
  private hitAt(state: GameState, sx: number, sy: number): Hit | null {
    const w = state.world;
    const near = (x: number, y: number, r = 9) => {
      const p = this.project(x, y);
      return Math.hypot(p.x - sx, p.y - sy) <= r;
    };
    for (const e of state.entities.values()) {
      if (e.type === "pirate" && near(e.x, e.y)) {
        const k = tileIndex(w, Math.floor(e.x), Math.floor(e.y));
        if (state.explored[k])
          return {
            kind: "entity",
            id: e.id,
            x: e.x,
            y: e.y,
            title: "Pirate ship",
            lines: [describePirate(state, e)],
          };
      }
    }
    for (const e of state.entities.values()) {
      if (e.type === "ship" && near(e.x, e.y)) {
        const report = describeShip(state, e);
        const row = fleetRows(state).find((r) => r.id === e.id);
        return {
          kind: "entity",
          id: e.id,
          x: e.x,
          y: e.y,
          title: row?.label ?? "Ship",
          lines: [
            [report.doing, report.extra].filter(Boolean).join(" · "),
            report.hull,
            report.route ?? "",
          ].filter(Boolean),
        };
      }
    }
    for (const e of state.entities.values()) {
      if (
        e.type === "wreck" &&
        near(e.x + 0.5, e.y + 0.5) &&
        state.explored[tileIndex(w, e.x, e.y)]
      ) {
        return {
          kind: "entity",
          id: e.id,
          x: e.x,
          y: e.y,
          title: e.kind === "skeleton" ? "Bones of a raider" : "Shipwreck",
          lines: [`Holds ${goodsText(e.loot)}`],
        };
      }
      if (e.type === "site" && e.found && near(e.x + 0.5, e.y + 0.5, 11)) {
        return {
          kind: "entity",
          id: e.id,
          x: e.x,
          y: e.y,
          title: e.kind === "fortress" ? "Sunken fortress" : "Sunken ruins",
          lines: [`Treasure left: ${goodsText(e.loot)}`],
        };
      }
    }
    const t = this.unproject(sx, sy);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    if (tx < 0 || ty < 0 || tx >= w.width || ty >= w.height) return null;
    const id = w.island[tileIndex(w, tx, ty)]!;
    if (id < 0 || !(id === w.start.islandId || state.discovered.has(id))) return null;
    return { kind: "island", id };
  }

  private onMove(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const hit = this.hitAt(this.actions.state(), sx, sy);
    this.setHover(hit ? { hit, sx, sy } : null);
  }

  private setHover(next: { hit: Hit; sx: number; sy: number } | null): void {
    const prev = this.hover;
    this.hover = next;
    this.canvas.style.cursor = next ? "pointer" : "default";
    if (!next) {
      this.tip.style.display = "none";
      if (prev) this.redraw();
      return;
    }
    const state = this.actions.state();
    const lines: (string | Node)[] = [];
    let title = "";
    if (next.hit.kind === "island") {
      const row = islandRows(state).find((r) => r.id === next.hit.id);
      if (row) {
        title = row.name;
        lines.push(row.biome);
        lines.push(...islandLines(row));
      }
    } else {
      title = next.hit.title;
      lines.push(...next.hit.lines);
    }
    this.tip.replaceChildren(
      h("strong", {}, title),
      ...lines.map((l) => h("div", {}, l)),
      h("div.hint", {}, "Click to look"),
    );
    this.tip.style.display = "block";
    const plate = this.canvas.parentElement!.getBoundingClientRect();
    const canvasBox = this.canvas.getBoundingClientRect();
    const left = canvasBox.left - plate.left + next.sx + 14;
    const top = canvasBox.top - plate.top + next.sy + 14;
    this.tip.style.left = `${Math.min(left, plate.width - 250)}px`;
    this.tip.style.top = `${Math.min(top, plate.height - 100)}px`;
    if (
      !prev ||
      prev.hit.kind !== next.hit.kind ||
      JSON.stringify(prev.hit) !== JSON.stringify(next.hit)
    )
      this.redraw();
  }

  private onClick(): void {
    const hover = this.hover;
    if (!hover) return;
    const state = this.actions.state();
    if (hover.hit.kind === "island") {
      const island = state.world.islands[hover.hit.id];
      if (island) this.focus(island.cx + 0.5, island.cy + 0.5);
    } else {
      const e = state.entities.get(hover.hit.id);
      if (e && (e.type === "ship" || e.type === "pirate")) this.actions.select(e.id);
      this.focus(hover.hit.x + 0.5, hover.hit.y + 0.5);
    }
  }

  private focus(x: number, y: number): void {
    this.actions.focusTile(x, y);
    this.close();
  }

  // ------------------------------------------------------------------------- sidebar

  private icon(res: keyof typeof ICON): HTMLElement {
    const el = h("span.icon");
    if (this.atlas.has(ICON[res])) Object.assign(el.style, this.atlas.iconStyle(ICON[res], 1));
    return el;
  }

  private goods(goods: Goods): HTMLElement {
    const out = h("span.goods");
    for (const { res, n } of goodsList(goods))
      out.append(h("span.amount", { title: res }, this.icon(res), String(n)));
    return out;
  }

  private renderSide(state: GameState): void {
    const rows = islandRows(state)
      .filter((r) => r.settled)
      .sort((p, q) => Number(q.home) - Number(p.home) || p.name.localeCompare(q.name));
    const fleet = fleetRows(state);
    const sights = seaSights(state);
    const key = JSON.stringify([
      rows,
      fleet,
      sights.pirates.length,
      sights.wrecks.map((w) => [w.id, w.loot]),
      sights.sites.map((s) => [s.id, s.loot]),
    ]);
    if (key === this.sideKey) return;
    this.sideKey = key;
    const scroll = this.side.scrollTop;
    const parts: HTMLElement[] = [];

    parts.push(h("h3", {}, "Settlements"));
    for (const row of rows) {
      const head = h("div.map-row-head", {}, h("strong", {}, row.name), h("small", {}, row.biome));
      const facts = [
        `${row.villagers} villager${row.villagers === 1 ? "" : "s"}`,
        `${row.buildings} building${row.buildings === 1 ? "" : "s"}`,
      ];
      if (row.docks > 0) facts.push(`${row.docks} dock${row.docks === 1 ? "" : "s"}`);
      if (row.cargoShips > 0)
        facts.push(`${row.cargoShips} cargo ship${row.cargoShips === 1 ? "" : "s"}`);
      const pile = h(
        "div.map-row-pile",
        {},
        h("small", {}, row.home ? "Treasury" : "Waiting for pickup"),
        this.goods(row.pile),
      );
      const warn =
        row.stuck === "dock"
          ? "No dock here: build one so cargo ships can collect these goods."
          : row.stuck === "ship"
            ? "No cargo ship serves this island yet: send one with a trade route."
            : null;
      parts.push(
        h(
          "button.map-row",
          { onclick: () => this.focus(row.x + 0.5, row.y + 0.5) },
          head,
          h("small", {}, facts.join(" · ")),
          Object.keys(row.pile).length > 0 || row.home ? pile : null,
          warn ? h("small.warn", {}, warn) : null,
        ),
      );
    }

    parts.push(h("h3", {}, "Fleet"));
    if (fleet.length === 0) parts.push(h("small.empty", {}, "No ships yet: build one at a dock."));
    for (const s of fleet) parts.push(this.fleetRow(s));

    const sea: HTMLElement[] = [];
    if (sights.pirates.length > 0)
      sea.push(
        h(
          "div.map-note.danger",
          {},
          `${sights.pirates.length} pirate ship${sights.pirates.length === 1 ? "" : "s"} sighted`,
        ),
      );
    const hall = state.world.start.townHall;
    const bearing = (e: { x: number; y: number }) =>
      `${Math.round(Math.hypot(e.x - hall.x, e.y - hall.y))} tiles ${compassFrom(hall, e)}`;
    for (const site of sights.sites) {
      const rich = Object.values(site.loot).some((n) => (n ?? 0) > 0);
      sea.push(
        h(
          "button.map-row",
          { onclick: () => this.focus(site.x + 0.5, site.y + 0.5) },
          h(
            "div.map-row-head",
            {},
            h("strong", {}, site.kind === "fortress" ? "Sunken fortress" : "Sunken ruins"),
            h("small", {}, bearing(site)),
          ),
          rich ? this.goods(site.loot) : h("small", {}, "Picked clean"),
        ),
      );
    }
    for (const wreck of sights.wrecks)
      sea.push(
        h(
          "button.map-row",
          { onclick: () => this.focus(wreck.x + 0.5, wreck.y + 0.5) },
          h(
            "div.map-row-head",
            {},
            h("strong", {}, wreck.kind === "skeleton" ? "Bones of a raider" : "Shipwreck"),
            h("small", {}, bearing(wreck)),
          ),
          this.goods(wreck.loot),
        ),
      );
    if (sea.length > 0) parts.push(h("h3", {}, "At sea"), ...sea);

    this.side.replaceChildren(...parts);
    this.side.scrollTop = scroll;
  }

  private legend(): HTMLElement {
    return h(
      "div.map-legend",
      {},
      h("span", {}, h("i.k.star"), "Town hall"),
      h("span", {}, h("i.k.dock"), "Dock"),
      h("span", {}, h("i.k.ship"), "Ship"),
      h("span", {}, h("i.k.pirate"), "Pirates"),
      h("span", {}, h("i.k.site"), "Sunken site"),
      h("span", {}, h("i.k.wreck"), "Wreck"),
      h("span", {}, h("i.k.route"), "Trade route"),
    );
  }

  private fleetRow(s: FleetRow): HTMLElement {
    return h(
      `button.map-row${s.hurt ? ".hurt" : ""}`,
      {
        onclick: () => {
          this.actions.select(s.id);
          this.focus(s.x, s.y);
        },
      },
      h("div.map-row-head", {}, h("strong", {}, s.label), h("small", {}, s.hull)),
      h("small", {}, s.status),
    );
  }
}

/** The lines of an island's tooltip: what the team has there. */
export function islandLines(row: IslandRow): string[] {
  if (!row.settled) return ["Not settled yet"];
  const lines = [
    `${row.villagers} villager${row.villagers === 1 ? "" : "s"} · ${row.buildings} building${row.buildings === 1 ? "" : "s"}`,
  ];
  const pile = goodsText(row.pile);
  lines.push(
    row.home
      ? `Treasury: ${pile}`
      : pile === "nothing"
        ? "Nothing stored"
        : `Waiting for pickup: ${pile}`,
  );
  if (row.stuck === "dock") lines.push("No dock: goods can't be shipped home");
  else if (row.stuck === "ship") lines.push("No cargo ship serves this island");
  return lines;
}

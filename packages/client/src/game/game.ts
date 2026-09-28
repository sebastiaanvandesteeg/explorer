import {
  BIOMES,
  BUILDINGS,
  canPlaceBuilding,
  discoveryName,
  HALF_H,
  HALF_W,
  inBounds,
  isLand,
  pickTile,
  tileIndex,
  type BiomeId,
  type BuildingKind,
  type Command,
  type Entity,
  type GameEvent,
  type Patch,
  type PlayerInfo,
} from "@explorer/shared";
import { Application, Container, Rectangle } from "pixi.js";
import type { Atlas } from "../assets";
import type { Session, SessionStatus } from "../net/session";
import { AtmosphereLayer } from "../render/atmosphere";
import { Camera } from "../render/camera";
import { EntityLayer } from "../render/entities";
import { FogLayer, shallowGlow } from "../render/masks";
import { Overlay, type Footprint } from "../render/overlay";
import { TerrainLayer, visibleHeight } from "../render/terrain";
import { discoveryText, Hud, type Tool } from "../ui/hud";

interface Drag {
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  startTile: { x: number; y: number } | null;
  /** Drag start in world pixels (for the gather marquee). */
  startWorld: { x: number; y: number };
  shift: boolean;
  painted: Set<string>;
}

const PAN_SPEED = 700;

export class Game {
  private readonly world = new Container();
  private readonly camera: Camera;
  private readonly terrain: TerrainLayer;
  private readonly entities: EntityLayer;
  private readonly overlay: Overlay;
  private readonly fog: FogLayer;
  private readonly atmosphere: AtmosphereLayer;
  /** Biome under the camera, and a candidate that must hold still briefly before we switch. */
  private biome: BiomeId | null = null;
  private biomeCandidate: { biome: BiomeId | null; since: number } = { biome: null, since: 0 };
  private lastWorldPos = { x: 0, y: 0 };
  private readonly hud: Hud;
  private tool: Tool = { kind: "select" };
  private selected: number | null = null;
  private hoverTile: { x: number; y: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private keys = new Set<string>();
  private status: SessionStatus = "connecting";
  private minimapTimer = 0;
  private selectionDirty = true;
  private disposers: (() => void)[] = [];

  private constructor(
    private readonly app: Application,
    private readonly atlas: Atlas,
    private readonly session: Session,
    root: HTMLElement,
  ) {
    const state = session.state;
    this.camera = new Camera(state.world.width, state.world.height);
    this.terrain = new TerrainLayer(app.renderer, atlas, state);
    this.entities = new EntityLayer(atlas, state, (r) =>
      this.terrain.invalidateRect(r.x, r.y, r.w, r.h),
    );
    this.overlay = new Overlay(atlas);
    this.fog = new FogLayer(state);
    this.world.addChild(
      this.terrain.ocean,
      shallowGlow(state),
      this.terrain.container,
      this.entities.ground,
      this.overlay.under,
      this.entities.container,
      this.entities.effects,
      this.fog.sprite,
      this.overlay.over,
    );
    this.atmosphere = new AtmosphereLayer(atlas);
    this.world.filters = [this.atmosphere.filter];
    this.world.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
    app.stage.addChild(this.world, this.atmosphere.overlay, this.overlay.screen);

    const invite = session.worldId ? `${location.origin}/w/${session.worldId}` : null;
    this.hud = new Hud(
      root,
      atlas,
      {
        tool: (t) => this.setTool(this.sameTool(t) ? { kind: "select" } : t),
        command: (cmd) => void this.send(cmd),
        chat: (text) => session.chat(text),
        focusTile: (x, y) => this.centerOnTile(x, y),
        deselect: () => this.select(null),
      },
      invite,
      state.world.tribe,
    );

    this.entities.rebuild(state);
    this.hud.setStock(state);
    const th = state.world.start.townHall;
    this.camera.zoom = window.innerHeight > 1000 ? 3 : 2;
    this.centerOnTile(th.x + 1.5, th.y + 1.5);

    session.on({
      patch: (p) => this.onPatch(p),
      players: (list) => this.onPlayers(list),
      cursor: (player, x, y) => {
        const info = session.players.find((p) => p.id === player);
        if (!info || player === session.you) return;
        this.overlay.setCursor(
          info,
          x,
          y,
          x === null || y === null ? 0 : (visibleHeight(session.state, x, y) ?? 0),
        );
      },
      chat: (from, text) => this.hud.chatLine(from, text),
      status: (s, detail) => {
        this.status = s;
        this.hud.setPlayers(session.players, session.you, s);
        if (detail) this.hud.toast(detail, "error");
      },
      reset: () => {
        this.terrain.reset(session.state);
        this.fog.reset(session.state);
        this.entities.rebuild(session.state);
        this.hud.setStock(session.state);
        this.selectionDirty = true;
      },
    });
    this.hud.setPlayers(session.players, session.you, session.worldId ? "online" : "offline");
    this.bindInput();
    app.ticker.add((t) => this.frame(t.deltaMS));
  }

  static async create(root: HTMLElement, session: Session, atlas: Atlas): Promise<Game> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: "#153c46",
      antialias: false,
      roundPixels: true,
      autoDensity: true,
      resolution: 1,
      preference: "webgl",
    });
    root.append(app.canvas);
    const game = new Game(app, atlas, session, root);
    (window as unknown as { __game?: Game }).__game = game;
    return game;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.session.dispose();
    this.app.destroy(true, { children: true });
    this.hud.root.remove();
  }

  // ------------------------------------------------------------------------- session

  private onPatch(p: Patch): void {
    const now = performance.now();
    const state = this.session.state;
    this.entities.sync(
      p.entities.map((e) => e.id),
      p.removed,
      now,
    );
    if (p.revealed?.length) {
      this.fog.invalidate();
      this.entities.revealed(p.revealed);
    }
    const buildingChanged = p.entities.some((e) => e.type === "building") || p.removed.length > 0;
    if (
      p.stock ||
      buildingChanged ||
      p.entities.some((e) => e.type === "villager" && !this.entities.view(e.id))
    ) {
      this.hud.setStock(state);
    }
    if (this.selected !== null && !state.entities.has(this.selected)) this.select(null);
    if (this.selected !== null && (p.entities.some((e) => e.id === this.selected) || p.stock))
      this.selectionDirty = true;
    for (const ev of p.events ?? []) this.onEvent(ev);
  }

  private onEvent(ev: GameEvent): void {
    switch (ev.type) {
      case "built":
        this.hud.toast(`${BUILDINGS[ev.kind].name} built`);
        break;
      case "villager":
        this.hud.toast("A new villager joined the settlement");
        break;
      case "ship":
        this.hud.toast("A scout ship is ready at the dock");
        break;
      case "discovered":
        this.hud.toast(discoveryText(ev.biome));
        break;
      case "landed": {
        const island = this.session.state.world.islands[ev.islandId];
        const where = island ? discoveryName(island.biome) : "the shore";
        this.hud.toast(
          `${ev.count === 1 ? "A villager" : `${ev.count} villagers`} landed on ${where}`,
        );
        break;
      }
    }
  }

  private onPlayers(list: PlayerInfo[]): void {
    this.hud.setPlayers(
      list,
      this.session.you,
      this.status === "connecting" ? "online" : this.status,
    );
    this.overlay.dropCursorsExcept(new Set(list.filter((p) => p.online).map((p) => p.id)));
  }

  private async send(cmd: Command): Promise<boolean> {
    const res = await this.session.command(cmd);
    if (!res.ok) this.hud.toast(res.reason, "error");
    this.selectionDirty = true;
    return res.ok;
  }

  // ------------------------------------------------------------------------- tools & selection

  private sameTool(t: Tool): boolean {
    if (t.kind !== this.tool.kind) return false;
    return t.kind !== "build" || (this.tool.kind === "build" && t.building === this.tool.building);
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.hud.setTool(t);
    this.app.canvas.style.cursor = t.kind === "select" ? "default" : "crosshair";
  }

  private select(id: number | null): void {
    this.selected = id;
    this.selectionDirty = true;
  }

  private centerOnTile(x: number, y: number): void {
    this.camera.centerOn((x - y) * HALF_W, (x + y) * HALF_H);
  }

  private footprintFor(kind: BuildingKind, tile: { x: number; y: number }): Footprint {
    const [w, h] = BUILDINGS[kind].size;
    const x = tile.x - Math.floor((w - 1) / 2);
    const y = tile.y - Math.floor((h - 1) / 2);
    return { x, y, w, h, z: visibleHeight(this.session.state, tile.x, tile.y) ?? 0 };
  }

  /**
   * Test hook (used by the Playwright smoke test): canvas position of a tile near the town hall
   * where clicking with the build tool would place `kind`, clear of the HUD panels.
   */
  findPlacement(kind: BuildingKind): { x: number; y: number } | null {
    const state = this.session.state;
    const th = state.world.start.townHall;
    for (let r = 2; r < 16; r++) {
      for (let y = th.y - r; y <= th.y + r; y++) {
        for (let x = th.x - r; x <= th.x + r; x++) {
          const f = this.footprintFor(kind, { x, y });
          if (!canPlaceBuilding(state, kind, f.x, f.y).ok) continue;
          const z = visibleHeight(state, x, y) ?? 0;
          const p = this.camera.worldToScreen((x - y) * HALF_W, (x + y) * HALF_H + HALF_H - z);
          const picked = this.tileAt(p.x, p.y);
          if (picked?.x !== x || picked.y !== y) continue;
          if (
            p.x < 240 ||
            p.y < 90 ||
            p.x > this.camera.width - 240 ||
            p.y > this.camera.height - 150
          )
            continue;
          return p;
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------------- picking

  private tileAt(sx: number, sy: number): { x: number; y: number } | null {
    const p = this.camera.screenToWorld(sx, sy);
    return pickTile(p.x, p.y, (x, y) => visibleHeight(this.session.state, x, y));
  }

  /** Front-most entity whose sprite covers the screen point. */
  private entityAt(sx: number, sy: number): Entity | null {
    const state = this.session.state;
    const tile = this.tileAt(sx, sy);
    let best: { e: Entity; z: number } | null = null;
    for (const e of state.entities.values()) {
      if (tile && e.type !== "ship" && (Math.abs(e.x - tile.x) > 8 || Math.abs(e.y - tile.y) > 8))
        continue;
      const view = this.entities.view(e.id);
      if (!view || !view.root.visible) continue;
      const b = view.root.getBounds();
      if (!b.containsPoint(sx, sy)) continue;
      // Villagers and ships are small targets: prefer them when overlapping bigger sprites.
      const z = view.root.zIndex + (e.type === "villager" || e.type === "ship" ? 1000 : 0);
      if (!best || z > best.z) best = { e, z };
    }
    return best?.e ?? null;
  }

  /** Harvestable nodes whose base lies inside a screen-aligned rectangle (world pixels). */
  private nodesInMarquee(
    a: { x: number; y: number },
    b: { x: number; y: number },
    marked: boolean,
  ): number[] {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const state = this.session.state;
    const ids: number[] = [];
    for (const e of state.entities.values()) {
      if (e.type !== "node" || e.stage !== "grown" || e.marked === marked) continue;
      const view = this.entities.view(e.id);
      if (!view?.root.visible) continue;
      const { x, y } = view.root;
      // Count the trunk and a little of the canopy, so dragging over a tree's top works too.
      if (x >= x0 && x <= x1 && y + HALF_H >= y0 && y - 12 <= y1) ids.push(e.id);
    }
    return ids;
  }

  // ------------------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.app.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };

    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(canvas, "pointerdown", (e) => {
      const p = local(e);
      canvas.setPointerCapture(e.pointerId);
      this.drag = {
        button: e.button,
        startX: p.x,
        startY: p.y,
        lastX: p.x,
        lastY: p.y,
        moved: false,
        startTile: this.tileAt(p.x, p.y),
        startWorld: this.camera.screenToWorld(p.x, p.y),
        shift: e.shiftKey,
        painted: new Set(),
      };
      if (e.button === 0 && this.tool.kind === "build" && this.tool.building === "path")
        this.paintPath();
    });
    on(canvas, "pointermove", (e) => {
      const p = local(e);
      this.pointer = p;
      const tile = this.tileAt(p.x, p.y);
      if (tile?.x !== this.hoverTile?.x || tile?.y !== this.hoverTile?.y) {
        this.hoverTile = tile;
        this.session.cursor(tile?.x ?? null, tile?.y ?? null);
      }
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > 5) d.moved = true;
      const panning =
        d.button === 1 || d.button === 2 || (d.button === 0 && this.tool.kind === "select");
      if (d.moved && panning) this.camera.panBy(p.x - d.lastX, p.y - d.lastY);
      if (d.button === 0 && this.tool.kind === "build" && this.tool.building === "path")
        this.paintPath();
      d.lastX = p.x;
      d.lastY = p.y;
    });
    on(canvas, "pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const p = local(e);
      if (d.button === 0) {
        if (!d.moved) this.click(p.x, p.y, e.shiftKey);
        else if (this.tool.kind === "harvest") {
          const unmark = e.shiftKey;
          const ids = this.nodesInMarquee(
            d.startWorld,
            this.camera.screenToWorld(p.x, p.y),
            !unmark,
          );
          if (ids.length) void this.send({ kind: "mark", nodeIds: ids, marked: !unmark });
          else this.hud.toast("Drag across trees, rocks or bushes to mark them");
        }
      } else if (d.button === 2 && !d.moved) {
        this.rightClick(p.x, p.y);
      }
    });
    on(canvas, "pointerleave", () => {
      this.pointer = null;
      this.hoverTile = null;
      this.session.cursor(null, null);
    });
    on(
      canvas,
      "wheel",
      (e) => {
        e.preventDefault();
        const p = local(e);
        this.camera.zoomAt(e.deltaY < 0 ? 1 : -1, p.x, p.y);
      },
      { passive: false },
    );
    on(window, "keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "escape") {
        if (this.tool.kind !== "select") this.setTool({ kind: "select" });
        else this.select(null);
      } else if (k === "h" || k === "g") this.setTool({ kind: "harvest" });
      else if (k === "enter") {
        e.preventDefault();
        this.hud.focusChat();
      } else if (k === "c") {
        const th = this.session.state.world.start.townHall;
        this.centerOnTile(th.x + 1.5, th.y + 1.5);
      } else if (k === "+" || k === "=")
        this.camera.zoomAt(1, this.camera.width / 2, this.camera.height / 2);
      else if (k === "-" || k === "_")
        this.camera.zoomAt(-1, this.camera.width / 2, this.camera.height / 2);
      else if (k === "delete" || k === "backspace") {
        const e2 =
          this.selected !== null ? this.session.state.entities.get(this.selected) : undefined;
        if (e2?.type === "building" && BUILDINGS[e2.kind].buildable) {
          void this.send({ kind: "remove-building", buildingId: e2.id });
          this.select(null);
        }
      } else {
        const def = Object.values(BUILDINGS).find((b) => b.hotkey === k);
        if (def) this.setTool({ kind: "build", building: def.kind });
      }
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => this.keys.clear());
  }

  private paintPath(): void {
    const d = this.drag;
    const t = this.hoverTile;
    if (!d || !t) return;
    const key = `${t.x},${t.y}`;
    if (d.painted.has(key)) return;
    d.painted.add(key);
    if (canPlaceBuilding(this.session.state, "path", t.x, t.y).ok) {
      void this.send({ kind: "place-building", building: "path", x: t.x, y: t.y });
    }
  }

  private click(sx: number, sy: number, shift: boolean): void {
    const tool = this.tool;
    if (tool.kind === "build") {
      if (tool.building === "path" || !this.hoverTile) return;
      const f = this.footprintFor(tool.building, this.hoverTile);
      void this.send({ kind: "place-building", building: tool.building, x: f.x, y: f.y }).then(
        (ok) => {
          if (ok && !shift) this.setTool({ kind: "select" });
        },
      );
      return;
    }
    const e = this.entityAt(sx, sy);
    if (tool.kind === "harvest") {
      if (e?.type === "node" && e.stage === "grown") {
        void this.send({ kind: "mark", nodeIds: [e.id], marked: shift ? false : !e.marked });
      }
      return;
    }
    this.select(e?.id ?? null);
  }

  private rightClick(sx: number, sy: number): void {
    if (this.tool.kind !== "select") {
      this.setTool({ kind: "select" });
      return;
    }
    const state = this.session.state;
    const sel = this.selected !== null ? state.entities.get(this.selected) : undefined;
    const tile = this.tileAt(sx, sy);
    if (sel?.type === "villager") {
      const target = this.entityAt(sx, sy);
      if (target?.type === "ship")
        void this.send({ kind: "assign", villagerId: sel.id, target: { ship: target.id } });
      else if (target?.type === "node")
        void this.send({ kind: "assign", villagerId: sel.id, target: { node: target.id } });
      else if (target?.type === "building")
        void this.send({ kind: "assign", villagerId: sel.id, target: { building: target.id } });
      else if (tile)
        void this.send({ kind: "assign", villagerId: sel.id, target: { x: tile.x, y: tile.y } });
    } else if (sel?.type === "ship" && tile) {
      // Right-clicking land with passengers aboard means "take them there".
      const unload = isLand(state.world, tile.x, tile.y) && sel.passengers.length > 0;
      void this.send({ kind: "move-ship", shipId: sel.id, x: tile.x, y: tile.y, unload });
    } else {
      this.select(null);
    }
  }

  // ------------------------------------------------------------------------- frame

  private frame(dtMs: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, dtMs / 1000);
    const state = this.session.state;
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    const area = this.world.filterArea!;
    if (area.width !== this.app.screen.width || area.height !== this.app.screen.height) {
      this.world.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    }

    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx += 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx -= 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= 1;
    if (dx || dy) this.camera.panBy(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);

    this.camera.apply(this.world);
    const view = this.camera.view();
    this.terrain.animate(now);
    this.terrain.update(view);
    this.fog.update(dt);
    this.updateAtmosphere(now, dt);
    this.entities.frame(now, dt, view);
    this.entities.ambientSparkles(view, dt);
    this.drawOverlay();

    if (this.selectionDirty) {
      this.selectionDirty = false;
      this.hud.setSelection(state, this.selected);
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.4;
      const corners = [
        [0, 0],
        [this.camera.width, 0],
        [this.camera.width, this.camera.height],
        [0, this.camera.height],
      ].map(([x, y]) => {
        const p = this.camera.screenToWorld(x!, y!);
        return { x: (p.x / HALF_W + p.y / HALF_H) / 2, y: (p.y / HALF_H - p.x / HALF_W) / 2 };
      });
      this.hud.minimap.draw(state, corners);
    }
  }

  /** The biome under the screen centre sets the mood; it must hold for a moment to switch. */
  private updateAtmosphere(now: number, dt: number): void {
    const state = this.session.state;
    const w = state.world;
    const p = this.camera.screenToWorld(this.camera.width / 2, this.camera.height / 2);
    const tx = Math.floor((p.x / HALF_W + p.y / HALF_H) / 2);
    const ty = Math.floor((p.y / HALF_H - p.x / HALF_W) / 2);
    let biome: BiomeId | null = null;
    if (inBounds(w, tx, ty)) {
      const k = tileIndex(w, tx, ty);
      if (state.explored[k]) biome = BIOMES[w.biome[k]!] ?? null;
    }
    if (biome !== this.biomeCandidate.biome) this.biomeCandidate = { biome, since: now };
    if (this.biomeCandidate.biome !== this.biome && now - this.biomeCandidate.since > 600) {
      this.biome = this.biomeCandidate.biome;
      this.atmosphere.setBiome(this.biome);
      if (this.biome && this.biome !== w.islands[w.start.islandId]!.biome)
        this.hud.showBiome(this.biome);
    }
    const pan = { dx: this.world.x - this.lastWorldPos.x, dy: this.world.y - this.lastWorldPos.y };
    this.lastWorldPos = { x: this.world.x, y: this.world.y };
    if (Math.abs(pan.dx) > 200 || Math.abs(pan.dy) > 200) pan.dx = pan.dy = 0;
    this.atmosphere.update(dt, this.app.screen, this.camera.zoom, pan);
  }

  private drawOverlay(): void {
    const o = this.overlay;
    const state = this.session.state;
    o.begin();
    const hover = this.hoverTile;
    const tool = this.tool;
    let ghost: { name: string; f: Footprint; ok: boolean } | null = null;
    if (hover && tool.kind === "build") {
      const f = this.footprintFor(tool.building, hover);
      const ok = canPlaceBuilding(state, tool.building, f.x, f.y).ok;
      o.footprint(f, ok);
      if (tool.building !== "path")
        ghost = { name: tool.building === "farm" ? "farm_2" : tool.building, f, ok };
    } else if (
      tool.kind === "harvest" &&
      this.drag?.moved &&
      this.drag.button === 0 &&
      this.pointer
    ) {
      const a = this.drag.startWorld;
      const b = this.camera.screenToWorld(this.pointer.x, this.pointer.y);
      const unmark = this.keys.has("shift");
      o.marquee(a, b);
      for (const id of this.nodesInMarquee(a, b, !unmark)) {
        const n = state.entities.get(id)!;
        o.highlight({ x: n.x, y: n.y, w: 1, h: 1, z: visibleHeight(state, n.x, n.y) ?? 0 });
      }
    } else if (hover && this.pointer) {
      o.hover({
        x: hover.x,
        y: hover.y,
        w: 1,
        h: 1,
        z: visibleHeight(state, hover.x, hover.y) ?? 0,
      });
    }
    o.ghostSprite(ghost?.name ?? null, ghost?.f ?? null, ghost?.ok ?? false);

    const sel = this.selected !== null ? state.entities.get(this.selected) : undefined;
    if (sel) {
      const pos = this.entities.position(sel.id);
      if (sel.type === "building") {
        o.select({
          x: sel.x,
          y: sel.y,
          w: sel.w,
          h: sel.h,
          z: visibleHeight(state, sel.x, sel.y) ?? 0,
        });
      } else if (sel.type === "node") {
        o.select({ x: sel.x, y: sel.y, w: 1, h: 1, z: visibleHeight(state, sel.x, sel.y) ?? 0 });
      } else if (sel.type === "villager" && pos) {
        o.ring(pos.x, pos.y, 7, 3.5);
      } else if (sel.type === "ship" && pos) {
        o.ring(pos.x, pos.y + 2, 24, 11);
        if (sel.dest) o.destination({ x: sel.dest.x, y: sel.dest.y, w: 1, h: 1, z: 0 });
      }
    }
    o.drawCursors(this.camera);
  }
}

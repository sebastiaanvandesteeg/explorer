import {
  BIOMES,
  BUILDINGS,
  canPlaceBuilding,
  characterOf,
  harbourSite,
  dayNumber,
  dayPhase,
  UPGRADES,
  HALF_H,
  HALF_W,
  greatWorkStages,
  inBounds,
  islandName,
  isLand,
  landPath,
  pickTile,
  RESOURCES,
  tileIndex,
  walkable,
  worldPath,
  type BiomeId,
  type BuildingKind,
  type CharacterEntity,
  type BuildingEntity,
  type ItemEntity,
  isEnterable,
  ROOMS,
  roomWalkable,
  ITEMS,
  PICKUP_REACH,
  type Command,
  type Entity,
  type GameEvent,
  type GameState,
  type Patch,
  type PlayerInfo,
  type ShipEntity,
  type Resource,
  type StormEntity,
  type VillagerEntity,
} from "@explorer/shared";
import { h } from "../ui/dom";
import { talkFor } from "../ui/dialog";
import { PackPanel } from "../ui/inventory";
import { RoomScene } from "../render/room";
import { Application, Container, Rectangle } from "pixi.js";
import type { Atlas } from "../assets";
import type { Session, SessionStatus } from "../net/session";
import { AtmosphereLayer } from "../render/atmosphere";
import { Camera } from "../render/camera";
import { daylight } from "../render/daylight";
import { EntityLayer } from "../render/entities";
import { buildingThumb } from "../render/names";
import { FogLayer } from "../render/masks";
import { Overlay, type Footprint } from "../render/overlay";
import { TerrainLayer, visibleHeight } from "../render/terrain";
import { discoveryText, Hud, type Tool } from "../ui/hud";
import { compassFrom, currentThreat } from "../ui/mapData";
import { spatialMix, stormLevel, type Mood } from "../audio/mix";
import { SoundSystem } from "../audio/system";

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
/** How quickly the camera catches up with your character (higher is snappier). */
const FOLLOW_RATE = 10;

export class Game {
  private readonly world = new Container();
  /**
   * Wraps the world for its colour grade. The world moves and scales with the camera, and a
   * filter's area is measured in the filtered container's own space, so filtering the world
   * itself would grade a patch of map far off screen (and Pixi skips a filter that misses the
   * screen). This wrapper never moves, so a screen-sized area covers exactly what is seen.
   */
  private readonly graded = new Container();
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
  private readonly pack: PackPanel;
  private readonly room: RoomScene;
  private readonly leaveBtn: HTMLButtonElement;
  /** The building your character is inside right now (its room is on screen), or null. */
  private indoors: number | null = null;
  private tool: Tool = { kind: "select" };
  private selected: number | null = null;
  private hoverId: number | null = null;
  private hoverCheckAt = 0;
  private hoverTile: { x: number; y: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private keys = new Set<string>();
  /** WASD walking: the direction being held (tile steps, "" when none) and when it was last sent. */
  private walkDir = "";
  private walkSentAt = 0;
  private myCharacterId: number | null = null;
  private status: SessionStatus = "connecting";
  private minimapTimer = 0;
  private raidersSeen = false;
  private readonly sound: SoundSystem;
  private workTimer = 0;
  private moodTimer = 0;
  private selectionDirty = true;
  private disposers: (() => void)[] = [];
  /** `?phase=` freezes the time of day, for reviewing art. */
  private readonly phaseOverride: number | null = (() => {
    const p = new URLSearchParams(location.search).get("phase");
    return p !== null && Number.isFinite(Number(p)) ? Number(p) : null;
  })();

  private constructor(
    private readonly app: Application,
    private readonly atlas: Atlas,
    private readonly session: Session,
    root: HTMLElement,
  ) {
    const state = session.state;
    this.camera = new Camera(state.world.width, state.world.height);
    this.terrain = new TerrainLayer(app.renderer, atlas, state);
    this.entities = new EntityLayer(
      atlas,
      state,
      (r) => this.terrain.invalidateRect(r.x, r.y, r.w, r.h),
      () => this.terrain.syncBuildings(),
    );
    this.entities.playerColour = (id) => {
      const colour = session.players.find((p) => p.id === id)?.color;
      return colour ? Number.parseInt(colour.slice(1), 16) : 0xffffff;
    };
    this.overlay = new Overlay(atlas);
    this.fog = new FogLayer(state);
    this.world.addChild(
      this.terrain.ocean,
      this.terrain.waves,
      this.terrain.container,
      this.entities.wakes,
      this.entities.ground,
      this.overlay.under,
      this.entities.container,
      this.entities.effects,
      this.fog.container,
      this.overlay.over,
    );
    this.atmosphere = new AtmosphereLayer(atlas);
    this.graded.addChild(this.world);
    this.graded.filters = [this.atmosphere.filter];
    this.graded.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
    app.stage.addChild(
      this.graded,
      this.entities.lights,
      this.atmosphere.overlay,
      this.overlay.screen,
    );

    this.room = new RoomScene(
      atlas,
      state.world.tribe,
      (id) => this.entities.playerColour(id),
      (id) => session.players.find((p) => p.id === id)?.name ?? "?",
    );
    app.stage.addChild(this.room.layer);

    const invite = session.worldId ? location.origin + worldPath(session.worldId) : null;
    this.hud = new Hud(
      root,
      atlas,
      {
        tool: (t) => this.setTool(this.sameTool(t) ? { kind: "select" } : t),
        command: (cmd) => void this.send(cmd),
        chat: (text) => session.chat(text),
        focusTile: (x, y) => this.centerOnTile(x, y),
        select: (id) => this.select(id),
        deselect: () => this.select(null),
        state: () => this.session.state,
        view: () => this.viewCorners(),
        toggleSound: () => this.sound.toggle(),
      },
      invite,
      state.world.tribe,
    );

    this.pack = new PackPanel({
      drop: (slot, amount) =>
        void this.send(
          amount === undefined ? { kind: "drop-item", slot } : { kind: "drop-item", slot, amount },
        ),
    });
    this.hud.root.append(this.pack.root);
    this.leaveBtn = h(
      "button.btn.leave-btn",
      { title: "Go back outside (Esc)", onclick: () => void this.send({ kind: "leave-building" }) },
      "Leave",
    ) as HTMLButtonElement;
    this.leaveBtn.style.display = "none";
    this.hud.root.append(this.leaveBtn);
    this.syncPack();

    this.sound = new SoundSystem((x, y) => this.heard(x, y));
    this.hud.setSound(this.sound.isMuted);
    this.disposers.push(() => this.sound.dispose());
    this.hud.setDifficulty(state.difficulty);
    this.entities.rebuild(state);
    this.hud.setStock(state);
    const th = state.world.start.townHall;
    const me = this.myCharacter();
    if (me) this.centerOnTile(me.x, me.y);
    else this.centerOnTile(th.x + 1.5, th.y + 1.5);
    this.hud.toast("Walk with WASD or right-click. The camera stays on you");

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
        this.myCharacterId = null;
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
    await game.preload();
    return game;
  }

  /** Paint the land in view before the first frame is shown, so the map does not pop in. */
  private async preload(): Promise<void> {
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    await this.terrain.preload(this.camera.view());
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.session.dispose();
    this.app.destroy(true, { children: true });
    this.hud.root.remove();
  }

  // ------------------------------------------------------------------------- session

  /** Show your character's pack in the pack panel. */
  private syncPack(): void {
    this.pack.set(this.myCharacter()?.pack ?? []);
  }

  private onPatch(p: Patch): void {
    const now = performance.now();
    const state = this.session.state;
    this.entities.sync(
      p.entities.map((e) => e.id),
      p.removed,
      now,
    );
    if (p.revealed?.length) {
      this.fog.invalidate(p.revealed);
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
    if (
      this.selected !== null &&
      (p.entities.some((e) => e.id === this.selected) || p.stock || p.outposts)
    )
      this.selectionDirty = true;
    for (const ev of p.events ?? []) this.onEvent(ev);
    this.syncPack();
  }

  private onEvent(ev: GameEvent): void {
    this.sound.event(ev);
    switch (ev.type) {
      case "built":
        this.hud.toast(`${BUILDINGS[ev.kind].name} built`);
        break;
      case "item": {
        if (ev.playerId !== this.session.you) break;
        this.sound.ui(ev.what === "full" ? "error" : "click");
        const name = ITEMS[ev.kind].name;
        if (ev.what === "picked")
          this.hud.toast(`Picked up ${ev.amount > 1 ? `${ev.amount} ` : ""}${name}`);
        else if (ev.what === "dropped")
          this.hud.toast(`Dropped ${ev.amount > 1 ? `${ev.amount} ` : ""}${name}`);
        else this.hud.toast("Your pack is full", "error");
        break;
      }
      case "villager":
        this.hud.toast("A new villager joined the settlement");
        break;
      case "ship":
        this.hud.toast(
          ev.kind === "cargo"
            ? "A cargo ship is ready at the dock"
            : "A scout ship is ready at the dock",
        );
        break;
      case "pirates":
        // Raiders are announced when the lookouts first sight them, not when they set sail.
        break;
      case "wonder": {
        const stages = greatWorkStages(this.session.state.world);
        const name = stages[ev.stage - 1]?.name ?? "stage";
        this.hud.toast(
          ev.final
            ? "The Great Work is complete!"
            : `The Great Work: stage ${ev.stage}, ${name}, is done`,
        );
        if (ev.final) this.hud.showChronicle(this.session.state);
        break;
      }
      case "storm":
        this.hud.toast(
          `A storm is rolling in from the ${compassFrom(this.session.state.world.start.townHall, ev)}`,
        );
        break;
      case "robbed":
        this.hud.toast("Pirates are looting a storehouse!", "error");
        break;
      case "sunk":
        this.hud.toast(
          ev.kind === "pirate"
            ? "A pirate ship went down! Salvage the wreck or the bones for loot"
            : `Your ${ev.kind === "patrol" ? "patrol boat" : `${ev.kind} ship`} was sunk`,
          ev.kind === "pirate" ? "info" : "error",
        );
        break;
      case "found":
        this.hud.toast(
          ev.site === "fortress"
            ? "A sunken fortress lies beneath the waves! Send divers"
            : "Sunken ruins lie beneath the waves. Send divers",
        );
        break;
      case "salvaged":
        this.hud.toast(`Recovered from ${ev.what}: ${goodsSummary(ev.goods)}`);
        break;
      case "shot":
        this.entities.shot(ev.kind, ev.from, ev.to);
        break;
      case "upgrade":
        this.hud.toast(`${UPGRADES[ev.upgrade].name} learned`);
        break;
      case "cargo":
        this.hud.toast(`A cargo ship brought ${ev.amount} goods home`);
        break;
      case "discovered":
        this.hud.toast(discoveryText(islandName(this.session.state.world, ev.islandId), ev.biome));
        break;
      case "landed": {
        const world = this.session.state.world;
        const where = world.islands[ev.islandId] ? islandName(world, ev.islandId) : "the shore";
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
    this.sound.ui(res.ok ? "click" : "error");
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
    if (id !== null && id !== this.selected) this.sound.ui("select");
    this.selected = id;
    this.selectionDirty = true;
  }

  private centerOnTile(x: number, y: number): void {
    this.camera.centerOn((x - y) * HALF_W, (x + y) * HALF_H);
  }

  /** Your own character (every world has one). */
  /** Whether a character aboard a ship is its captain (the first rider); null if not aboard. */
  private captainOf(me: CharacterEntity): boolean | null {
    if (me.aboard === null) return null;
    const ship = this.session.state.entities.get(me.aboard);
    return ship?.type === "ship" ? ship.riders[0] === me.id : false;
  }

  /** The ship nearest your character within reach to climb aboard, if any. */
  private shipNearMe(): ShipEntity | null {
    const me = this.myCharacter();
    if (!me) return null;
    let best: ShipEntity | null = null;
    for (const e of this.session.state.entities.values()) {
      if (e.type !== "ship") continue;
      const d = Math.hypot(e.x - me.x, e.y - me.y);
      if (d <= 7 && (!best || d < Math.hypot(best.x - me.x, best.y - me.y))) best = e;
    }
    return best;
  }

  /** `F`: climb aboard the nearest ship, or step off the one you are on. */
  private boardOrLeave(): void {
    const me = this.myCharacter();
    if (!me || me.inside !== null) return;
    if (me.aboard !== null) {
      void this.send({ kind: "leave-ship" });
      return;
    }
    const ship = this.shipNearMe();
    if (ship) void this.send({ kind: "board-ship", shipId: ship.id });
    else this.hud.toast("No ship nearby to board", "error");
  }

  private myCharacter(): CharacterEntity | undefined {
    const state = this.session.state;
    const cached = this.myCharacterId !== null ? state.entities.get(this.myCharacterId) : undefined;
    if (cached?.type === "character") return cached;
    const found = characterOf(state, this.session.you);
    this.myCharacterId = found?.id ?? null;
    return found;
  }

  /** The camera is bound to your character: it never wanders off on its own. */
  private get locked(): boolean {
    return this.myCharacter() !== undefined;
  }

  /** Send your character walking. */
  private walkTo(x: number, y: number): void {
    void this.send({ kind: "move-character", x, y });
  }

  /**
   * Walk with the keys: while a direction is held, steer your character that way (W is up the
   * screen, which is -x -y on the map). The command is renewed while held; letting go stops it.
   */
  private walkWithKeys(now: number): void {
    const me = this.myCharacter();
    if (!me) return;
    const k = this.keys;
    const right =
      (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const down =
      (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    // Screen right is (+1, -1) on the map and screen down is (+1, +1).
    const x = right + down;
    const y = -right + down;
    const len = Math.hypot(x, y);
    const dir = len === 0 ? "" : `${(x / len).toFixed(3)},${(y / len).toFixed(3)}`;
    const quiet = (cmd: Command) => void this.session.command(cmd);
    // Aboard a ship the keys are the wheel (for the captain), not your legs.
    const aboard = me.aboard !== null;
    const kind = aboard ? "steer-ship" : "steer-character";
    if (dir === "") {
      if (this.walkDir !== "") quiet({ kind, x: 0, y: 0 });
      this.walkDir = "";
      return;
    }
    if (aboard && this.captainOf(me) === false) {
      if (this.walkDir === "") this.hud.toast("Only the captain steers the ship");
      this.walkDir = dir;
      return;
    }
    if (dir === this.walkDir && now - this.walkSentAt < 500) return;
    this.walkDir = dir;
    this.walkSentAt = now;
    quiet({ kind, x: x / len, y: y / len });
  }

  private followCharacter(dt: number): void {
    const me = this.myCharacter();
    const pos = me ? this.entities.position(me.id) : null;
    if (!pos) return;
    // Aim at the character's body, not its feet.
    const ty = pos.y - 10;
    const dx = pos.x - this.camera.x;
    const dy = ty - this.camera.y;
    const k = Math.hypot(dx, dy) > 600 ? 1 : 1 - Math.exp(-dt * FOLLOW_RATE);
    this.camera.centerOn(this.camera.x + dx * k, this.camera.y + dy * k);
  }

  private footprintFor(kind: BuildingKind, tile: { x: number; y: number }): Footprint {
    if (kind === "harbour") {
      // A harbour is placed by its shore tile; the body and the pier are worked out around it.
      const site = harbourSite(this.session.state, tile.x, tile.y, { ignoreCost: true });
      const z = visibleHeight(this.session.state, tile.x, tile.y) ?? 0;
      return site ? { ...site.body, z } : { x: tile.x, y: tile.y, w: 1, h: 1, z };
    }
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

  /** Test hook: a canvas point on a finished building of this kind, clear of the HUD panels. */
  findBuildingTarget(kind: BuildingKind): { x: number; y: number } | null {
    for (const e of this.session.state.entities.values()) {
      if (e.type !== "building" || e.kind !== kind) continue;
      const view = this.entities.view(e.id);
      if (!view) continue;
      const b = view.root.getBounds();
      for (let fy = 0.3; fy <= 0.8; fy += 0.1)
        for (let fx = 0.2; fx <= 0.8; fx += 0.1) {
          const x = b.x + b.width * fx;
          const y = b.y + b.height * fy;
          if (x < 340 || y < 90 || x > this.camera.width - 240 || y > this.camera.height - 160)
            continue;
          if (this.entityAt(x, y)?.id === e.id) return { x, y };
        }
    }
    return null;
  }

  /** Test hook: a canvas point on the NPC of the room you are in. */
  findNpcTarget(): { x: number; y: number } | null {
    return this.room.npcPoint();
  }

  /**
   * Test hook (used by the Playwright smoke test): canvas position of a tile a few steps from
   * your character that it can walk to, clear of the HUD panels, and which tile that is.
   */
  findWalkTarget(): { x: number; y: number; tile: { x: number; y: number } } | null {
    const state = this.session.state;
    const me = this.myCharacter();
    if (!me) return null;
    const from = { x: Math.floor(me.x), y: Math.floor(me.y) };
    for (let r = 4; r < 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tile = { x: from.x + dx, y: from.y + dy };
          if (!walkable(state, tile.x, tile.y) || !landPath(state, from, [tile])) continue;
          const z = visibleHeight(state, tile.x, tile.y) ?? 0;
          const p = this.camera.worldToScreen(
            (tile.x - tile.y) * HALF_W,
            (tile.x + tile.y) * HALF_H + HALF_H - z,
          );
          const picked = this.tileAt(p.x, p.y);
          if (picked?.x !== tile.x || picked.y !== tile.y) continue;
          // Clicking a town building would walk in rather than to the tile.
          if (this.enterableAt(p.x, p.y)) continue;
          if (
            p.x < 240 ||
            p.y < 90 ||
            p.x > this.camera.width - 240 ||
            p.y > this.camera.height - 150
          )
            continue;
          return { x: p.x, y: p.y, tile };
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
      // Weather is not something to click on, and neither are people's characters.
      if (e.type === "storm" || e.type === "character" || e.type === "item") continue;
      // A harbour's pier is only something to walk on; the harbour itself is what you use.
      if (e.type === "building" && e.kind === "dock" && e.harbour !== undefined) continue;
      if (
        tile &&
        e.type !== "ship" &&
        e.type !== "pirate" &&
        (Math.abs(e.x - tile.x) > 8 || Math.abs(e.y - tile.y) > 8)
      )
        continue;
      const view = this.entities.view(e.id);
      if (!view || !view.root.visible) continue;
      const b = view.root.getBounds();
      if (!b.containsPoint(sx, sy)) continue;
      // Villagers and ships are small targets: prefer them when overlapping bigger sprites.
      const small = e.type === "villager" || e.type === "ship" || e.type === "pirate";
      const z = view.root.zIndex + (small ? 1000 : 0);
      if (!best || z > best.z) best = { e, z };
    }
    return best?.e ?? null;
  }

  /** The item lying on the ground under a screen point, if any. */
  private itemAt(sx: number, sy: number): ItemEntity | null {
    let best: { e: ItemEntity; z: number } | null = null;
    for (const e of this.session.state.entities.values()) {
      if (e.type !== "item") continue;
      const view = this.entities.view(e.id);
      if (!view || !view.root.visible) continue;
      // Generous: items are small, and a click near one should find it.
      const b = view.root.getBounds();
      if (
        !b.containsPoint(sx, sy) &&
        Math.hypot(b.x + b.width / 2 - sx, b.y + b.height / 2 - sy) > 14
      )
        continue;
      if (!best || view.root.zIndex > best.z) best = { e, z: view.root.zIndex };
    }
    return best?.e ?? null;
  }

  /** Pick up the item under the cursor, or else the nearest one lying within reach of you. */
  private pickUp(sx?: number, sy?: number): void {
    const hit = sx === undefined || sy === undefined ? null : this.itemAt(sx, sy);
    const me = this.myCharacter();
    let target: ItemEntity | null = hit;
    if (!target && me) {
      let d = PICKUP_REACH + 0.5;
      for (const e of this.session.state.entities.values()) {
        if (e.type !== "item") continue;
        const dist = Math.hypot(e.x + 0.5 - me.x, e.y + 0.5 - me.y);
        if (dist < d) {
          d = dist;
          target = e;
        }
      }
    }
    if (target) void this.send({ kind: "pickup-item", itemId: target.id });
    else this.hud.toast("Nothing here to pick up");
  }

  // ------------------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.app.canvas;
    const local = (e: PointerEvent) => {
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
      if (d.moved && panning && !this.locked) this.camera.panBy(p.x - d.lastX, p.y - d.lastY);
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
      } else if (d.button === 2 && !d.moved) {
        this.rightClick(p.x, p.y);
      }
    });
    on(canvas, "pointerleave", () => {
      this.pointer = null;
      this.hoverTile = null;
      this.session.cursor(null, null);
    });
    on(window, "keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (this.hud.map.isOpen) {
        // The map covers the game: only its own keys work while it is open.
        if (k === "escape" || k === "m") this.hud.map.close();
        return;
      }
      this.keys.add(k);
      if (k === "m") this.hud.map.open();
      else if (k === "i") this.pack.toggle();
      else if (k === "e") this.pickUp();
      else if (k === "f") this.boardOrLeave();
      else if (k === "n") this.hud.setSound(this.sound.toggle());
      else if (k === "escape") {
        if (this.tool.kind !== "select") this.setTool({ kind: "select" });
        else if (this.selected !== null) this.select(null);
        else if (this.indoors !== null) void this.send({ kind: "leave-building" });
      } else if (k === "enter") {
        e.preventDefault();
        this.hud.focusChat();
      } else if (k === "c") {
        if (!this.locked) {
          const th = this.session.state.world.start.townHall;
          this.centerOnTile(th.x + 1.5, th.y + 1.5);
        }
      } else if (k === "delete" || k === "backspace") {
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
      const at = tool.building === "harbour" ? this.hoverTile : f;
      void this.send({ kind: "place-building", building: tool.building, x: at.x, y: at.y }).then(
        (ok) => {
          if (ok && !shift) this.setTool({ kind: "select" });
        },
      );
      return;
    }
    if (this.indoors !== null) {
      this.roomClick(sx, sy);
      return;
    }
    const e = this.entityAt(sx, sy);
    // Finished town buildings are entered, not inspected: their business is done inside.
    if (e?.type === "building" && e.complete && isEnterable(e.kind)) {
      this.select(null);
      void this.send({ kind: "enter-building", buildingId: e.id });
      return;
    }
    this.select(e?.id ?? null);
  }

  private rightClick(sx: number, sy: number): void {
    if (this.tool.kind !== "select") {
      this.setTool({ kind: "select" });
      return;
    }
    if (this.indoors !== null) {
      this.roomClick(sx, sy);
      return;
    }
    const state = this.session.state;
    const sel = this.selected !== null ? state.entities.get(this.selected) : undefined;
    const tile = this.tileAt(sx, sy);
    if (this.itemAt(sx, sy)) {
      this.pickUp(sx, sy);
      return;
    }
    if (sel?.type === "villager") {
      const target = this.entityAt(sx, sy);
      if (target?.type === "wreck")
        void this.send({ kind: "assign", villagerId: sel.id, target: { wreck: target.id } });
      else if (target?.type === "ship")
        void this.send({ kind: "assign", villagerId: sel.id, target: { ship: target.id } });
      else if (target?.type === "node")
        void this.send({ kind: "assign", villagerId: sel.id, target: { node: target.id } });
      else if (target?.type === "building")
        void this.send({ kind: "assign", villagerId: sel.id, target: { building: target.id } });
      else if (tile)
        void this.send({ kind: "assign", villagerId: sel.id, target: { x: tile.x, y: tile.y } });
    } else if (sel?.type === "ship" && sel.kind === "cargo") {
      // A dock on another island becomes the ship's trade route; anywhere else steers it by hand.
      const target = this.entityAt(sx, sy);
      if (target?.type === "building" && target.kind === "harbour")
        void this.send({ kind: "set-route", shipId: sel.id, dockId: target.id });
      else if (tile) void this.send({ kind: "move-ship", shipId: sel.id, x: tile.x, y: tile.y });
    } else if (sel?.type === "ship" && sel.kind !== "cargo" && this.shipTarget(sel.id, sx, sy)) {
      // Handled: a wreck to salvage or a sunken site to dive at.
    } else if (sel?.type === "ship" && tile) {
      // Right-clicking land with passengers aboard means "take them there".
      const unload = isLand(state.world, tile.x, tile.y) && sel.passengers.length > 0;
      void this.send({ kind: "move-ship", shipId: sel.id, x: tile.x, y: tile.y, unload });
    } else if (this.entityAt(sx, sy)?.type === "ship") {
      // Nothing selected: right-clicking a ship means climbing aboard.
      const ship = this.entityAt(sx, sy)!;
      this.select(null);
      void this.send({ kind: "board-ship", shipId: ship.id });
    } else if (this.enterableAt(sx, sy)) {
      const b = this.enterableAt(sx, sy)!;
      this.select(null);
      void this.send({ kind: "enter-building", buildingId: b.id });
    } else if (tile) {
      // Nothing to give orders to: right-click is "walk here" for your own character.
      this.select(null);
      this.walkTo(tile.x, tile.y);
    } else {
      this.select(null);
    }
  }

  /** The finished town building under a screen point, if any. */
  private enterableAt(sx: number, sy: number): BuildingEntity | null {
    const e = this.entityAt(sx, sy);
    return e?.type === "building" && e.complete && isEnterable(e.kind) ? e : null;
  }

  /** Right-clicking a shipwreck salvages it and a found sunken site sends the passengers diving. */
  private shipTarget(shipId: number, sx: number, sy: number): boolean {
    const target = this.entityAt(sx, sy);
    if (target?.type === "wreck" && target.kind === "shipwreck")
      void this.send({ kind: "salvage", shipId, wreckId: target.id });
    else if (target?.type === "site" && target.found)
      void this.send({ kind: "dive", shipId, siteId: target.id });
    else return false;
    return true;
  }

  // ------------------------------------------------------------------------- frame

  private frame(dtMs: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, dtMs / 1000);
    const state = this.session.state;
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    const area = this.graded.filterArea!;
    if (area.width !== this.app.screen.width || area.height !== this.app.screen.height) {
      this.graded.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    }

    const inside = this.myCharacter()?.inside ?? null;
    if (inside !== null || this.indoors !== null) {
      this.enterOrLeaveRoom(inside);
      if (inside !== null && this.roomFrame(now, dt, inside)) return;
    }

    if (this.locked) {
      // The camera is bound to your character, and the keys walk it.
      this.walkWithKeys(now);
      this.followCharacter(dt);
    } else {
      let dx = 0;
      let dy = 0;
      if (this.keys.has("a") || this.keys.has("arrowleft")) dx += 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) dx -= 1;
      if (this.keys.has("w") || this.keys.has("arrowup")) dy += 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= 1;
      if (dx || dy) this.camera.panBy(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
    }

    this.camera.apply(this.world);
    // The night glows live outside the graded world but must follow the camera exactly.
    this.entities.lights.position.copyFrom(this.world.position);
    this.entities.lights.scale.copyFrom(this.world.scale);
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
    this.moodTimer -= dt;
    if (this.moodTimer <= 0) {
      this.sound.update(this.mood(), 0.5 - this.moodTimer);
      this.moodTimer = 0.5;
    }
    this.workTimer -= dt;
    if (this.workTimer <= 0) {
      this.workTimer = 0.4;
      this.workSounds(state);
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.4;
      this.hud.minimap.draw(state, this.viewCorners(), this.session.players);
      this.hud.setAlerts(state);
      this.watchForRaiders(state);
    }
  }

  /** Switch between the island and the inside of a building when your character goes in or out. */
  private enterOrLeaveRoom(inside: number | null): void {
    if (inside === this.indoors) return;
    const going = inside !== null;
    this.indoors = inside;
    this.graded.visible = !going;
    this.entities.lights.visible = !going;
    this.atmosphere.overlay.visible = !going;
    this.overlay.screen.visible = !going;
    this.hud.root.classList.toggle("indoors", going);
    this.leaveBtn.style.display = going ? "" : "none";
    this.walkDir = "";
    this.select(null);
    this.hud.setTalk(null);
    if (!going) {
      this.room.hide();
      this.selectionDirty = true;
      return;
    }
    const b = this.session.state.entities.get(inside);
    if (b?.type === "building") this.hud.toast(`You step into the ${BUILDINGS[b.kind].name}`);
  }

  /** One frame of a room: its people, the keys, and the conversation. Returns false if there is none. */
  private roomFrame(now: number, dt: number, inside: number): boolean {
    const state = this.session.state;
    const b = state.entities.get(inside);
    if (b?.type !== "building") return false;
    this.room.show(state, b);
    const over = this.pointer ? this.room.pick(this.pointer.x, this.pointer.y) : null;
    this.room.setHover(over !== null && "npc" in over);
    const talking = this.selected === b.id && this.app.screen.width > 900;
    this.room.frame(
      now,
      dt,
      state,
      this.app.screen.width,
      this.app.screen.height,
      talking ? 450 : 0,
    );
    this.walkInRoom(now);
    const talk = this.selected === b.id ? talkFor(state, b) : null;
    this.hud.setTalk(talk);
    if (this.selectionDirty) {
      this.selectionDirty = false;
      this.hud.setSelection(state, this.selected);
    }
    return true;
  }

  /** WASD inside a room: walk a few tiles the way the key points, as far as the floor is clear. */
  private walkInRoom(now: number): void {
    const me = this.myCharacter();
    const b = me?.inside != null ? this.session.state.entities.get(me.inside) : undefined;
    const def = b?.type === "building" ? ROOMS[b.kind] : undefined;
    if (!me || !def) return;
    const k = this.keys;
    const right =
      (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const down =
      (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const step = { x: Math.sign(right + down), y: Math.sign(-right + down) };
    const dir = step.x === 0 && step.y === 0 ? "" : `${step.x},${step.y}`;
    const quiet = (cmd: Command) => void this.session.command(cmd);
    const here = { x: Math.floor(me.room.x), y: Math.floor(me.room.y) };
    if (dir === "") {
      if (this.walkDir !== "") quiet({ kind: "move-in-room", x: here.x, y: here.y });
      this.walkDir = "";
      return;
    }
    if (dir === this.walkDir && now - this.walkSentAt < 250) return;
    this.walkDir = dir;
    this.walkSentAt = now;
    const reach = (dx: number, dy: number) => {
      let target: { x: number; y: number } | null = null;
      for (let i = 1; i <= 4; i++) {
        const x = here.x + dx * i;
        const y = here.y + dy * i;
        if (!roomWalkable(def, x, y)) break;
        target = { x, y };
      }
      return target;
    };
    const target =
      reach(step.x, step.y) ?? (step.x && step.y ? (reach(step.x, 0) ?? reach(0, step.y)) : null);
    if (target) quiet({ kind: "move-in-room", ...target });
  }

  /** A click inside a room: talk to the NPC, or walk to the tile (the door leaves). */
  private roomClick(sx: number, sy: number): void {
    const hit = this.room.pick(sx, sy);
    const id = this.indoors;
    if (!hit || id === null) {
      this.select(null);
      return;
    }
    if ("npc" in hit) {
      const b = this.session.state.entities.get(id);
      const npc = b?.type === "building" ? ROOMS[b.kind]?.npc : undefined;
      if (npc) void this.session.command({ kind: "move-in-room", x: npc.x, y: npc.y + 1 });
      this.select(id);
      return;
    }
    this.select(null);
    void this.send({ kind: "move-in-room", x: hit.x, y: hit.y });
  }

  /** Where a sound at a place in the world seems to come from, for the player looking at the screen. */
  private heard(x: number, y: number): { gain: number; pan: number } {
    const p = this.camera.worldToScreen((x - y) * HALF_W, (x + y) * HALF_H);
    return spatialMix(p.x, p.y, this.camera.width, this.camera.height);
  }

  /** What the ambience should sound like now: the time of day, any storm about, the place. */
  private mood(): Mood {
    const state = this.session.state;
    const c = this.camera.screenToWorld(this.camera.width / 2, this.camera.height / 2);
    const tx = (c.x / HALF_W + c.y / HALF_H) / 2;
    const ty = (c.y / HALF_H - c.x / HALF_W) / 2;
    const storms = [...state.entities.values()].filter((e) => e.type === "storm");
    return {
      night: this.entities.night,
      storm: stormLevel(storms as StormEntity[], tx, ty),
      biome: this.biome,
    };
  }

  /** One villager on screen at random gets to be heard chopping, mining or hammering. */
  private workSounds(state: GameState): void {
    const heard: VillagerEntity[] = [];
    for (const e of state.entities.values()) {
      if (e.type !== "villager" || e.action !== "work" || e.aboard !== null) continue;
      if (this.heard(e.x, e.y).gain >= 1) heard.push(e);
    }
    const v = heard[Math.floor(Math.random() * heard.length)];
    if (v) this.sound.work(v.tool, v.x, v.y);
  }

  /** Say so once when pirates first come into sight, and again after the seas have been quiet. */
  private watchForRaiders(state: GameState): void {
    const threat = currentThreat(state);
    if (threat && !this.raidersSeen) {
      this.hud.toast(`Pirates sighted to the ${threat.direction}!`, "error");
      this.sound.cue({ sound: "alarm" });
    }
    this.raidersSeen = threat !== null;
  }

  /** The four corners of the screen as tile coordinates, for the minimap and the map. */
  private viewCorners(): { x: number; y: number }[] {
    return [
      [0, 0],
      [this.camera.width, 0],
      [this.camera.width, this.camera.height],
      [0, this.camera.height],
    ].map(([x, y]) => {
      const p = this.camera.screenToWorld(x!, y!);
      return { x: (p.x / HALF_W + p.y / HALF_H) / 2, y: (p.y / HALF_H - p.x / HALF_W) / 2 };
    });
  }

  /** Where in the day the world is: the same for every player, from the simulation clock. */
  private phase(): number {
    return this.phaseOverride ?? dayPhase(this.session.state.time);
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
    const phase = this.phase();
    const day = daylight(phase);
    this.atmosphere.update(dt, this.app.screen, this.camera.zoom, pan, day);
    this.entities.night = day.night;
    this.hud.setClock(phase, dayNumber(state.time));
  }

  /** Backdrop behind the building or villager under the cursor, so you can see it is clickable. */
  private drawBackdrop(o: Overlay, state: GameState): void {
    if (this.drag?.moved || !this.pointer) return;
    const now = performance.now();
    // Looking up what is under the cursor is not free: do it a few times a second.
    if (now - this.hoverCheckAt > 80) {
      this.hoverCheckAt = now;
      const e = this.entityAt(this.pointer.x, this.pointer.y);
      this.hoverId =
        e && (e.type === "villager" || (e.type === "building" && e.kind !== "path")) ? e.id : null;
    }
    const e = this.hoverId === null ? undefined : state.entities.get(this.hoverId);
    if (e?.type === "building")
      o.backdropBuilding(
        { x: e.x, y: e.y, w: e.w, h: e.h, z: visibleHeight(state, e.x, e.y) ?? 0 },
        now,
      );
    else if (e?.type === "villager" && e.aboard === null) {
      const pos = this.entities.position(e.id);
      if (pos) o.backdropPerson(pos.x, pos.y, now);
    }
  }

  private drawOverlay(): void {
    const o = this.overlay;
    const state = this.session.state;
    o.begin();
    if (this.indoors !== null) return;
    const hover = this.hoverTile;
    const tool = this.tool;
    let ghost: { name: string; f: Footprint; ok: boolean } | null = null;
    if (hover && tool.kind === "build") {
      const f = this.footprintFor(tool.building, hover);
      const at = tool.building === "harbour" ? hover : f;
      const check = canPlaceBuilding(state, tool.building, at.x, at.y);
      const ok = check.ok;
      o.footprint(f, ok);
      if (check.ok && check.site) o.footprint({ ...check.site.pier, z: f.z }, ok);
      if (tool.building !== "path")
        ghost = { name: buildingThumb(tool.building, state.world.tribe), f, ok };
    } else if (hover && this.pointer) {
      this.drawBackdrop(o, state);
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
    this.drawCharacters(o, state);
    o.drawCursors(this.camera);
  }

  /** A ring and a name for every player's character, and a flag where yours is heading. */
  private drawCharacters(o: Overlay, state: GameState): void {
    const alive = new Set<number>();
    for (const e of state.entities.values()) {
      if (e.type !== "character" || e.inside !== null) continue;
      const pos = this.entities.position(e.id);
      if (!pos) continue;
      const info = this.session.players.find((p) => p.id === e.playerId);
      const you = e.playerId === this.session.you;
      o.character(
        e.id,
        info?.name ?? "?",
        info?.color ?? "#f0e6d0",
        you,
        pos.x,
        pos.y,
        this.camera,
      );
      alive.add(e.id);
    }
    o.pruneCharacters(alive);
  }
}

function goodsSummary(goods: Partial<Record<Resource, number>>): string {
  const items = RESOURCES.filter((r) => (goods[r] ?? 0) > 0).map((r) => `${goods[r]} ${r}`);
  return items.length > 0 ? items.join(", ") : "nothing";
}

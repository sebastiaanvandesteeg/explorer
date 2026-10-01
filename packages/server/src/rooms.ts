import { createHash, randomBytes } from "node:crypto";
import {
  applyCommand,
  createInitialState,
  ensureCharacter,
  fromSnapshot,
  generateWorld,
  MAX_PLAYERS,
  patchIsEmpty,
  PLAYER_COLORS,
  setLook,
  takePatch,
  tick,
  TICK_SECONDS,
  toSnapshot,
  type CharacterLook,
  type ClientMessage,
  type Difficulty,
  type GameState,
  type PlayerInfo,
  type ServerMessage,
  type TribeId,
  type WorldInfo,
} from "@explorer/shared";
import type { WebSocket } from "ws";
import type { SavedPlayer, SavedWorld, WorldStore } from "./storage";

const SAVE_EVERY_MS = 30_000;
const UNLOAD_AFTER_MS = 60_000;

interface Slot extends SavedPlayer {
  sockets: Set<WebSocket>;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Short, unambiguous invite code (no 0/o or 1/l). */
function newWorldId(): string {
  return [...randomBytes(8)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export class WorldRoom {
  readonly state: GameState;
  private readonly slots: Slot[];
  private readonly sockets = new Map<WebSocket, Slot>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastSave = 0;
  private dirty = false;
  private unloadTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private closing = false;

  constructor(
    readonly id: string,
    readonly seed: string,
    readonly tribe: TribeId,
    readonly createdAt: string,
    private readonly store: WorldStore,
    private readonly onIdle: (room: WorldRoom) => void,
    saved?: SavedWorld,
    /** Only used for a new world: a saved one keeps the difficulty in its snapshot. */
    difficulty: Difficulty = "normal",
  ) {
    const world = generateWorld(seed, tribe);
    this.state = saved
      ? fromSnapshot(world, saved.snapshot, true)
      : createInitialState(world, { difficulty });
    this.slots = (saved?.players ?? []).map((p) => ({ ...p, sockets: new Set() }));
    // A world nobody joins (yet) shouldn't stay in memory; joining cancels this.
    this.scheduleUnload();
  }

  private scheduleUnload(): void {
    if (this.unloadTimer) clearTimeout(this.unloadTimer);
    this.unloadTimer = setTimeout(() => this.onIdle(this), UNLOAD_AFTER_MS);
    this.unloadTimer.unref?.();
  }

  info(): WorldInfo {
    return {
      id: this.id,
      seed: this.seed,
      tribe: this.tribe,
      difficulty: this.state.difficulty,
      players: this.slots.length,
      online: this.slots.filter((s) => s.sockets.size > 0).length,
      maxPlayers: MAX_PLAYERS,
      createdAt: this.createdAt,
    };
  }

  private players(): PlayerInfo[] {
    return this.slots.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      online: s.sockets.size > 0,
    }));
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets.keys())
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(data);
  }

  /** Seat a player (new or returning by token). Returns false when the world is full. */
  join(ws: WebSocket, name: string, token: string, look?: CharacterLook): boolean {
    const tokenHash = hashToken(token);
    let slot = this.slots.find((s) => s.tokenHash === tokenHash);
    if (!slot) {
      if (this.slots.length >= MAX_PLAYERS) return false;
      const used = new Set(this.slots.map((s) => s.color));
      const color =
        PLAYER_COLORS.find((c) => !used.has(c)) ??
        PLAYER_COLORS[this.slots.length % PLAYER_COLORS.length]!;
      slot = { id: `p${this.slots.length + 1}`, name, color, tokenHash, sockets: new Set() };
      this.slots.push(slot);
    } else {
      slot.name = name;
    }
    slot.sockets.add(ws);
    this.sockets.set(ws, slot);
    // Everyone plays a character: a newcomer gets one, a returning player
    // finds theirs where they left it. It is in the snapshot below and in the next patch.
    ensureCharacter(this.state, slot.id, look);
    if (look) setLook(this.state, slot.id, look);
    if (this.unloadTimer) {
      clearTimeout(this.unloadTimer);
      this.unloadTimer = null;
    }
    this.start();
    send(ws, {
      t: "welcome",
      you: slot.id,
      worldId: this.id,
      players: this.players(),
      snapshot: toSnapshot(this.state),
    });
    this.broadcast({ t: "players", players: this.players() }, ws);
    this.dirty = true;
    return true;
  }

  leave(ws: WebSocket): void {
    const slot = this.sockets.get(ws);
    if (!slot || this.closing) return;
    this.sockets.delete(ws);
    slot.sockets.delete(ws);
    if (slot.sockets.size === 0) this.broadcast({ t: "cursor", player: slot.id, x: null, y: null });
    this.broadcast({ t: "players", players: this.players() });
    if (this.sockets.size === 0) {
      void this.save();
      this.stop();
      this.scheduleUnload();
    }
  }

  handle(ws: WebSocket, msg: ClientMessage): void {
    const slot = this.sockets.get(ws);
    if (!slot) return;
    switch (msg.t) {
      case "cmd": {
        const res = applyCommand(this.state, msg.cmd, slot.id);
        send(
          ws,
          res.ok
            ? { t: "result", seq: msg.seq, ok: true }
            : { t: "result", seq: msg.seq, ok: false, reason: res.reason },
        );
        if (res.ok) this.dirty = true;
        break;
      }
      case "cursor":
        this.broadcast({ t: "cursor", player: slot.id, x: msg.x, y: msg.y }, ws);
        break;
      case "chat":
        this.broadcast({
          t: "chat",
          player: slot.id,
          name: slot.name,
          text: msg.text,
          at: Date.now(),
        });
        break;
      case "ping":
        send(ws, { t: "pong", at: msg.at });
        break;
      case "join":
        break;
    }
  }

  private start(): void {
    if (this.loop) return;
    this.lastTick = performance.now();
    this.lastSave = Date.now();
    this.loop = setInterval(() => this.step(), TICK_SECONDS * 1000);
  }

  private stop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Catch up on elapsed time in fixed steps (bounded, so a stall can't snowball). */
  private step(): void {
    const now = performance.now();
    let steps = Math.min(5, Math.floor((now - this.lastTick) / (TICK_SECONDS * 1000)));
    if (steps <= 0) return;
    this.lastTick += steps * TICK_SECONDS * 1000;
    if (now - this.lastTick > 1000) this.lastTick = now;
    while (steps-- > 0) tick(this.state);
    const patch = takePatch(this.state);
    if (!patchIsEmpty(patch)) {
      this.broadcast({ t: "patch", patch });
      this.dirty = true;
    }
    if (this.dirty && Date.now() - this.lastSave > SAVE_EVERY_MS) void this.save();
  }

  toSaved(): SavedWorld {
    return {
      version: 1,
      id: this.id,
      seed: this.seed,
      tribe: this.tribe,
      createdAt: this.createdAt,
      players: this.slots.map(({ sockets: _sockets, ...p }) => p),
      snapshot: toSnapshot(this.state),
    };
  }

  /** Saves run one at a time, each writing the state as it is when its turn comes. */
  save(): Promise<void> {
    this.lastSave = Date.now();
    this.dirty = false;
    this.saving = this.saving.then(async () => {
      try {
        await this.store.save(this.toSaved());
      } catch (e) {
        this.dirty = true;
        console.error(`[world ${this.id}] save failed`, e);
      }
    });
    return this.saving;
  }

  async close(): Promise<void> {
    this.closing = true;
    this.stop();
    if (this.unloadTimer) clearTimeout(this.unloadTimer);
    for (const ws of this.sockets.keys()) ws.close(1001, "server shutting down");
    await this.save();
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, WorldRoom>();
  private readonly loading = new Map<string, Promise<WorldRoom | null>>();

  constructor(private readonly store: WorldStore) {}

  async create(
    seed: string,
    tribe: TribeId,
    difficulty: Difficulty = "normal",
  ): Promise<WorldRoom> {
    let id = newWorldId();
    while (this.rooms.has(id) || (await this.store.load(id))) id = newWorldId();
    const room = new WorldRoom(
      id,
      seed,
      tribe,
      new Date().toISOString(),
      this.store,
      (r) => this.unload(r),
      undefined,
      difficulty,
    );
    this.rooms.set(id, room);
    await room.save();
    return room;
  }

  async get(id: string): Promise<WorldRoom | null> {
    const live = this.rooms.get(id);
    if (live) return live;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.store.load(id).then((saved) => {
        if (!saved) return null;
        const room = new WorldRoom(
          saved.id,
          saved.seed,
          saved.tribe ?? saved.snapshot.tribe ?? "islanders",
          saved.createdAt,
          this.store,
          (r) => this.unload(r),
          saved,
        );
        this.rooms.set(id, room);
        return room;
      });
      this.loading.set(id, pending);
      void pending.finally(() => this.loading.delete(id));
    }
    return pending;
  }

  private unload(room: WorldRoom): void {
    if (this.rooms.get(room.id) === room) {
      void room.save();
      this.rooms.delete(room.id);
    }
  }

  get size(): number {
    return this.rooms.size;
  }

  async close(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((r) => r.close()));
    this.rooms.clear();
  }
}

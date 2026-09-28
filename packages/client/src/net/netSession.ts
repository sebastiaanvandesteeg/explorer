import {
  applyPatch,
  fromSnapshot,
  generateWorld,
  type ClientMessage,
  type Command,
  type CommandResult,
  type GameState,
  type PlayerInfo,
  type ServerMessage,
  type WorldMap,
} from "@explorer/shared";
import { Emitter, type Session } from "./session";

const CURSOR_INTERVAL = 200;

/** Co-op session: the server simulates; we mirror its state from snapshots and patches. */
export class NetSession extends Emitter implements Session {
  state!: GameState;
  you = "";
  players: PlayerInfo[] = [];
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, (r: CommandResult) => void>();
  private world: WorldMap | null = null;
  private closed = false;
  private retry = 0;
  private lastCursor = 0;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private nextCursor: { x: number | null; y: number | null } | null = null;

  private constructor(
    readonly worldId: string,
    private readonly name: string,
    private readonly token: string,
  ) {
    super();
  }

  /** Resolves once the first snapshot has arrived; rejects if the world can't be joined. */
  static connect(worldId: string, name: string, token: string): Promise<NetSession> {
    const s = new NetSession(worldId, name, token);
    return new Promise((resolve, reject) => {
      s.open(resolve, reject);
    });
  }

  private url(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws`;
  }

  private open(onFirst?: (s: NetSession) => void, onFail?: (e: Error) => void): void {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    let welcomed = false;
    ws.onopen = () => {
      this.send({ t: "join", worldId: this.worldId, name: this.name, token: this.token });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      if (msg.t === "welcome") {
        welcomed = true;
        this.retry = 0;
        this.you = msg.you;
        this.players = msg.players;
        if (!this.world || this.world.seed !== msg.snapshot.seed)
          this.world = generateWorld(msg.snapshot.seed);
        const first = !this.state;
        this.state = fromSnapshot(this.world, msg.snapshot);
        this.emit("status", "online");
        this.emit("players", this.players);
        if (first) onFirst?.(this);
        else this.emit("reset");
        return;
      }
      if (msg.t === "error") {
        if (!welcomed) {
          this.closed = true;
          onFail?.(new Error(msg.message));
          ws.close();
        } else {
          this.emit("status", "online", msg.message);
        }
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      for (const resolve of this.pending.values()) resolve({ ok: false, reason: "Disconnected" });
      this.pending.clear();
      if (this.closed) return;
      if (!this.state) {
        onFail?.(new Error("Couldn't reach the server"));
        this.closed = true;
        return;
      }
      this.emit("status", "reconnecting");
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.open(), delay);
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case "patch":
        applyPatch(this.state, msg.patch);
        this.emit("patch", msg.patch);
        break;
      case "players":
        this.players = msg.players;
        this.emit("players", msg.players);
        break;
      case "cursor":
        this.emit("cursor", msg.player, msg.x, msg.y);
        break;
      case "chat":
        this.emit("chat", this.players.find((p) => p.id === msg.player) ?? null, `${msg.text}`);
        break;
      case "result": {
        const resolve = this.pending.get(msg.seq);
        this.pending.delete(msg.seq);
        resolve?.(msg.ok ? { ok: true } : { ok: false, reason: msg.reason ?? "Rejected" });
        break;
      }
      default:
        break;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  command(cmd: Command): Promise<CommandResult> {
    if (this.ws?.readyState !== WebSocket.OPEN)
      return Promise.resolve({ ok: false, reason: "Not connected" });
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(seq, resolve);
      this.send({ t: "cmd", seq, cmd });
    });
  }

  cursor(x: number | null, y: number | null): void {
    this.nextCursor = { x, y };
    const wait = CURSOR_INTERVAL - (performance.now() - this.lastCursor);
    if (wait <= 0) this.flushCursor();
    else this.cursorTimer ??= setTimeout(() => this.flushCursor(), wait);
  }

  private flushCursor(): void {
    this.cursorTimer = null;
    if (!this.nextCursor) return;
    this.lastCursor = performance.now();
    this.send({ t: "cursor", ...this.nextCursor });
    this.nextCursor = null;
  }

  chat(text: string): void {
    this.send({ t: "chat", text });
  }

  dispose(): void {
    this.closed = true;
    this.ws?.close();
  }
}

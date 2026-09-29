import {
  applyCommand,
  createInitialState,
  generateWorld,
  PLAYER_COLORS,
  takePatch,
  tick,
  TICK_SECONDS,
  type Command,
  type CommandResult,
  type GameState,
  type Patch,
  type PlayerInfo,
  type TribeId,
} from "@explorer/shared";

export type SessionStatus = "connecting" | "online" | "reconnecting" | "offline";

export interface SessionEvents {
  patch(p: Patch): void;
  players(list: PlayerInfo[]): void;
  cursor(player: string, x: number | null, y: number | null): void;
  chat(from: PlayerInfo | null, text: string): void;
  status(s: SessionStatus, detail?: string): void;
  /** A full resync (e.g. after reconnecting): the renderer rebuilds from `state`. */
  reset(): void;
}

/** What the game needs from either an offline simulation or a server connection. */
export interface Session {
  readonly state: GameState;
  readonly you: string;
  readonly players: PlayerInfo[];
  readonly worldId: string | null;
  command(cmd: Command): Promise<CommandResult>;
  cursor(x: number | null, y: number | null): void;
  chat(text: string): void;
  on(events: Partial<SessionEvents>): void;
  dispose(): void;
}

export class Emitter {
  protected handlers: Partial<SessionEvents>[] = [];
  on(events: Partial<SessionEvents>): void {
    this.handlers.push(events);
  }
  protected emit<K extends keyof SessionEvents>(k: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const h of this.handlers) (h[k] as ((...a: unknown[]) => void) | undefined)?.(...args);
  }
}

/** Single-player: the full simulation runs in the browser at the server's tick rate. */
export class LocalSession extends Emitter implements Session {
  readonly state: GameState;
  readonly you = "local";
  readonly worldId = null;
  readonly players: PlayerInfo[];
  private timer: ReturnType<typeof setInterval>;

  constructor(seed: string, name: string, tribe: TribeId = "islanders") {
    super();
    this.state = createInitialState(generateWorld(seed, tribe));
    this.players = [{ id: this.you, name, color: PLAYER_COLORS[0], online: true }];
    this.timer = setInterval(() => {
      tick(this.state);
      this.emit("patch", takePatch(this.state));
    }, TICK_SECONDS * 1000);
    queueMicrotask(() => {
      this.emit("players", this.players);
      this.emit("status", "offline");
    });
  }

  async command(cmd: Command): Promise<CommandResult> {
    return applyCommand(this.state, cmd);
  }

  cursor(): void {}

  chat(text: string): void {
    this.emit("chat", this.players[0]!, text);
  }

  dispose(): void {
    clearInterval(this.timer);
  }
}

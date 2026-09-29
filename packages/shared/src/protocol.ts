// Messages between browser clients and the Node server (JSON over one WebSocket per player).
import type { Command } from "./sim/commands";
import type { Patch, Snapshot } from "./sim/snapshot";

export const PLAYER_COLORS = [
  "#e98a3a",
  "#5a9fd4",
  "#8fae45",
  "#d9486a",
  "#f6d23a",
  "#9b7ad8",
  "#4fc1b0",
  "#f0e6d0",
] as const;

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  online: boolean;
}

export interface WorldInfo {
  id: string;
  seed: string;
  players: number;
  online: number;
  maxPlayers: number;
  createdAt: string;
}

export type ClientMessage =
  | { t: "join"; worldId: string; name: string; token: string }
  | { t: "cmd"; seq: number; cmd: Command }
  | { t: "cursor"; x: number | null; y: number | null }
  | { t: "chat"; text: string }
  | { t: "ping"; at: number };

export type ServerMessage =
  | {
      t: "welcome";
      you: string;
      worldId: string;
      players: PlayerInfo[];
      snapshot: Snapshot;
    }
  | { t: "patch"; patch: Patch }
  | { t: "players"; players: PlayerInfo[] }
  | { t: "cursor"; player: string; x: number | null; y: number | null }
  | { t: "chat"; player: string; name: string; text: string; at: number }
  | { t: "result"; seq: number; ok: boolean; reason?: string }
  | { t: "error"; code: "full" | "not-found" | "bad-request"; message: string }
  | { t: "pong"; at: number };

export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;

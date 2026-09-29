import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  isDifficulty,
  isGameMode,
  isGamePath,
  isTribe,
  movedPath,
  type Difficulty,
  type GameMode,
  type TribeId,
} from "@explorer/shared";
import sirv from "sirv";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomManager, type WorldRoom } from "./rooms";
import { WorldStore } from "./storage";
import { parseClientMessage, WORLD_ID } from "./validate";

export interface AppOptions {
  port: number;
  host?: string;
  dataDir: string;
  /** Built client (packages/client/dist) to serve; omitted in development (Vite serves it). */
  clientDir?: string;
}

export interface App {
  http: Server;
  rooms: RoomManager;
  port: number;
  close(): Promise<void>;
}

const JOIN_TIMEOUT_MS = 10_000;
const MAX_SEED_LENGTH = 64;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startApp(opts: AppOptions): Promise<App> {
  const store = new WorldStore(opts.dataDir);
  const rooms = new RoomManager(store);
  // The landing page and its files are served as they are; every page under /play is the game.
  const statics =
    opts.clientDir && existsSync(opts.clientDir)
      ? {
          site: sirv(opts.clientDir, { etag: true, gzip: true }),
          game: sirv(opts.clientDir, { single: "play/index.html", etag: true, gzip: true }),
        }
      : null;

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/health") return json(res, 200, { ok: true, worlds: rooms.size });
      if (url.pathname === "/api/worlds" && req.method === "POST") {
        let seed = "";
        let tribe: TribeId = "islanders";
        let difficulty: Difficulty = "normal";
        let mode: GameMode = "colony";
        try {
          const body = JSON.parse((await readBody(req)) || "{}") as {
            seed?: unknown;
            tribe?: unknown;
            difficulty?: unknown;
            mode?: unknown;
          };
          if (typeof body.seed === "string") seed = body.seed.trim().slice(0, MAX_SEED_LENGTH);
          if (body.tribe !== undefined) {
            if (!isTribe(body.tribe)) return json(res, 400, { error: "Unknown tribe" });
            tribe = body.tribe;
          }
          if (body.difficulty !== undefined) {
            if (!isDifficulty(body.difficulty))
              return json(res, 400, { error: "Unknown difficulty" });
            difficulty = body.difficulty;
          }
          if (body.mode !== undefined) {
            if (!isGameMode(body.mode)) return json(res, 400, { error: "Unknown mode" });
            mode = body.mode;
          }
        } catch {
          return json(res, 400, { error: "Invalid JSON" });
        }
        const room = await rooms.create(
          seed || Math.random().toString(36).slice(2, 10),
          tribe,
          difficulty,
          mode,
        );
        return json(res, 201, room.info());
      }
      const match = url.pathname.match(/^\/api\/worlds\/([^/]+)$/);
      if (match && req.method === "GET") {
        const id = match[1]!;
        const room = WORLD_ID.test(id) ? await rooms.get(id) : null;
        return room ? json(res, 200, room.info()) : json(res, 404, { error: "World not found" });
      }
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
      const moved = movedPath(url.pathname, url.search);
      if (moved) {
        res.writeHead(301, { location: moved });
        return res.end();
      }
      if (statics) {
        const serve = isGamePath(url.pathname) ? statics.game : statics.site;
        return serve(req, res, () => json(res, 404, { error: "Not found" }));
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Explorer server is running. In development, open the Vite client (pnpm dev).");
    } catch (e) {
      console.error("[http]", e);
      json(res, 500, { error: "Server error" });
    }
  });

  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 64 * 1024 });
  wss.on("connection", (ws: WebSocket) => {
    let room: WorldRoom | null = null;
    let joining = false;
    const timeout = setTimeout(() => !room && ws.close(4001, "join timeout"), JOIN_TIMEOUT_MS);
    ws.on("message", async (raw) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) {
        ws.send(JSON.stringify({ t: "error", code: "bad-request", message: "Malformed message" }));
        return;
      }
      if (room) {
        room.handle(ws, msg);
        return;
      }
      if (msg.t !== "join" || joining) return;
      joining = true;
      const target = await rooms.get(msg.worldId);
      if (!target) {
        ws.send(
          JSON.stringify({
            t: "error",
            code: "not-found",
            message: "That expedition doesn't exist",
          }),
        );
        ws.close(4004, "not found");
        return;
      }
      if (ws.readyState !== ws.OPEN) return;
      if (!target.join(ws, msg.name, msg.token)) {
        ws.send(
          JSON.stringify({
            t: "error",
            code: "full",
            message: "This expedition is full (8 players)",
          }),
        );
        ws.close(4003, "full");
        return;
      }
      clearTimeout(timeout);
      room = target;
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      room?.leave(ws);
    });
    ws.on("error", () => ws.terminate());
  });

  await new Promise<void>((resolve) => http.listen(opts.port, opts.host ?? "0.0.0.0", resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    http,
    rooms,
    port,
    async close() {
      await rooms.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

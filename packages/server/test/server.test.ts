import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  applyPatch,
  canPlaceBuilding,
  characterOf,
  characters,
  fromSnapshot,
  generateWorld,
  landPath,
  tally,
  walkable,
  type CharacterEntity,
  type GameState,
  type ServerMessage,
  type WorldInfo,
} from "@explorer/shared";
import { startApp, type App } from "../src/app";

let app: App;
let dataDir: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "explorer-test-"));
  app = await startApp({ port: 0, host: "127.0.0.1", dataDir });
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${app.port}`;

async function createWorld(
  seed = "server-test",
  tribe?: string,
  difficulty?: string,
  mode?: string,
): Promise<WorldInfo> {
  const res = await fetch(`${base()}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed, tribe, difficulty, mode }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as WorldInfo;
}

const token = (n: number) => n.toString(16).padStart(32, "0");

/** A connected player with a message inbox. */
class Player {
  readonly ws: WebSocket;
  readonly inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];

  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    sockets.push(this.ws);
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      this.inbox.push(msg);
      for (const w of [...this.waiters]) {
        if (w.pred(msg)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
  }

  async join(worldId: string, name: string, tok: string): Promise<ServerMessage> {
    if (this.ws.readyState !== WebSocket.OPEN) await new Promise((r) => this.ws.once("open", r));
    this.ws.send(JSON.stringify({ t: "join", worldId, name, token: tok }));
    return this.next((m) => m.t === "welcome" || m.t === "error");
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  next<T extends ServerMessage>(pred: (m: ServerMessage) => boolean, timeout = 4000): Promise<T> {
    const found = this.inbox.find(pred);
    if (found) {
      this.inbox.splice(this.inbox.indexOf(found), 1);
      return Promise.resolve(found as T);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timed out waiting for message")), timeout);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(t);
          resolve(m as T);
        },
      });
    });
  }
}

function mirror(welcome: ServerMessage): GameState {
  if (welcome.t !== "welcome") throw new Error(`expected welcome, got ${welcome.t}`);
  return fromSnapshot(
    generateWorld(welcome.snapshot.seed, welcome.snapshot.tribe),
    welcome.snapshot,
  );
}

function houseSpot(state: GameState): { x: number; y: number } {
  const th = state.world.start.townHall;
  for (let r = 3; r < 20; r++)
    for (let y = th.y - r; y <= th.y + r; y++)
      for (let x = th.x - r; x <= th.x + r; x++)
        if (canPlaceBuilding(state, "house", x, y).ok) return { x, y };
  throw new Error("no spot");
}

describe("HTTP API", () => {
  it("creates and describes worlds", async () => {
    const info = await createWorld("abc");
    expect(info).toMatchObject({ seed: "abc", tribe: "islanders", players: 0, maxPlayers: 8 });
    expect(info.id).toMatch(/^[a-z0-9]{8}$/);
    const res = await fetch(`${base()}/api/worlds/${info.id}`);
    expect(await res.json()).toMatchObject({ id: info.id, seed: "abc" });
    expect((await fetch(`${base()}/api/worlds/nosuchworld`)).status).toBe(404);
  });

  it("creates worlds for a chosen tribe", async () => {
    const info = await createWorld("tribe-test", "sylvan");
    expect(info.tribe).toBe("sylvan");
    const p = new Player();
    const welcome = await p.join(info.id, "Anna", token(1));
    expect(welcome.t === "welcome" && welcome.snapshot.tribe).toBe("sylvan");
    const bad = await fetch(`${base()}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tribe: "vikings" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("serving the built client", () => {
  it("serves the landing page at the root and the game under /play", async () => {
    const clientDir = join(dataDir, "client");
    await mkdir(join(clientDir, "play"), { recursive: true });
    await writeFile(join(clientDir, "index.html"), "landing");
    await writeFile(join(clientDir, "play", "index.html"), "game");
    for (const dir of ["news", "about", "the-lore"]) {
      await mkdir(join(clientDir, dir), { recursive: true });
      await writeFile(join(clientDir, dir, "index.html"), dir);
    }
    await app.close();
    app = await startApp({ port: 0, host: "127.0.0.1", dataDir, clientDir });
    const page = async (path: string) => {
      const res = await fetch(`${base()}${path}`, { redirect: "manual" });
      return { status: res.status, body: await res.text(), location: res.headers.get("location") };
    };
    expect(await page("/")).toMatchObject({ status: 200, body: "landing" });
    for (const path of ["/play", "/play/", "/play/w/abcd1234"])
      expect(await page(path)).toMatchObject({ status: 200, body: "game" });
    // The site's own pages, and a release's notes at their own address.
    expect(await page("/home")).toMatchObject({ status: 200, body: "landing" });
    for (const path of ["/news", "/news/", "/news/black-sails"])
      expect(await page(path)).toMatchObject({ status: 200, body: "news" });
    expect(await page("/about")).toMatchObject({ status: 200, body: "about" });
    expect(await page("/the-lore")).toMatchObject({ status: 200, body: "the-lore" });
    expect((await page("/nowhere")).status).toBe(404);
    expect((await page("/play/missing.js")).status).toBe(404);
    // Invite links and offline games from before the game moved to /play still work.
    expect(await page("/w/abcd1234")).toMatchObject({
      status: 301,
      location: "/play/w/abcd1234",
    });
    expect(await page("/?offline&seed=reef")).toMatchObject({
      status: 301,
      location: "/play?offline&seed=reef",
    });
    expect((await page("/api/health")).status).toBe(200);
  });
});

describe("difficulty", () => {
  it("creates worlds at a chosen difficulty and remembers it", async () => {
    expect((await createWorld("diff-default")).difficulty).toBe("normal");
    const info = await createWorld("diff-hard", undefined, "hard");
    expect(info.difficulty).toBe("hard");
    const p = new Player();
    const welcome = await p.join(info.id, "Dana", token(4));
    expect(welcome.t === "welcome" && welcome.snapshot.difficulty).toBe("hard");
    expect(mirror(welcome).difficulty).toBe("hard");
    const bad = await fetch(`${base()}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ difficulty: "nightmare" }),
    });
    expect(bad.status).toBe(400);
  });
});

/** A walkable tile a few steps from a character, reachable on foot. */
function goalNear(state: GameState, c: CharacterEntity): { x: number; y: number } {
  const from = { x: Math.floor(c.x), y: Math.floor(c.y) };
  for (let r = 3; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const to = { x: from.x + dx, y: from.y + dy };
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !walkable(state, to.x, to.y)) continue;
        if (landPath(state, from, [to])) return to;
      }
  throw new Error("no goal");
}

const settled = (c: CharacterEntity, goal: { x: number; y: number }) =>
  c.action === "idle" && c.x === goal.x + 0.5 && c.y === goal.y + 0.5;

describe("adventure worlds", () => {
  it("are created in a chosen mode, and colony is the default", async () => {
    expect((await createWorld("mode-default")).mode).toBe("colony");
    const info = await createWorld("mode-adventure", undefined, undefined, "adventure");
    expect(info.mode).toBe("adventure");
    const res = await fetch(`${base()}/api/worlds/${info.id}`);
    expect(await res.json()).toMatchObject({ mode: "adventure" });
    const bad = await fetch(`${base()}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "sandbox" }),
    });
    expect(bad.status).toBe(400);
  });

  it("give every player a character of their own, and the others see it arrive", async () => {
    const { id } = await createWorld("adv-join", undefined, undefined, "adventure");
    const anna = new Player();
    const welcomeA = await anna.join(id, "Anna", token(1));
    const a = mirror(welcomeA);
    expect(a.mode).toBe("adventure");
    expect(characters(a).map((c) => c.playerId)).toEqual(["p1"]);
    if (welcomeA.t !== "welcome") throw new Error("expected welcome");
    expect(welcomeA.you).toBe("p1");

    const ben = new Player();
    const b = mirror(await ben.join(id, "Ben", token(2)));
    expect(characters(b).map((c) => c.playerId)).toEqual(["p1", "p2"]);
    // Anna gets Ben's character through the patch, not a fresh snapshot.
    const seen = await anna.next<Extract<ServerMessage, { t: "patch" }>>(
      (m) =>
        m.t === "patch" &&
        m.patch.entities.some((e) => e.type === "character" && e.playerId === "p2"),
    );
    applyPatch(a, seen.patch);
    expect(characters(a)).toHaveLength(2);
  });

  it("walk when their own player says so, and nobody else's", async () => {
    const { id } = await createWorld("adv-walk", undefined, undefined, "adventure");
    const anna = new Player();
    const ben = new Player();
    const a = mirror(await anna.join(id, "Anna", token(1)));
    const b = mirror(await ben.join(id, "Ben", token(2)));
    const room = (await app.rooms.get(id))!;
    const benBefore = { ...characterOf(room.state, "p2")! };
    const annaChar = characterOf(a, "p1")!;
    const goal = goalNear(a, annaChar);
    anna.send({ t: "cmd", seq: 1, cmd: { kind: "move-character", ...goal } });
    expect(await anna.next((m) => m.t === "result")).toEqual({ t: "result", seq: 1, ok: true });
    // Both mirrors watch Anna's character walk to the spot.
    for (const [player, state] of [
      [anna, a],
      [ben, b],
    ] as const) {
      for (let i = 0; i < 60 && !settled(characterOf(state, "p1")!, goal); i++)
        applyPatch(
          state,
          (await player.next<Extract<ServerMessage, { t: "patch" }>>((m) => m.t === "patch")).patch,
        );
      expect(settled(characterOf(state, "p1")!, goal)).toBe(true);
    }
    const benNow = characterOf(room.state, "p2")!;
    expect([benNow.x, benNow.y]).toEqual([benBefore.x, benBefore.y]);
  });

  it("refuse to walk where there is no way, with a reason", async () => {
    const { id } = await createWorld("adv-refuse", undefined, undefined, "adventure");
    const anna = new Player();
    await anna.join(id, "Anna", token(1));
    anna.send({ t: "cmd", seq: 1, cmd: { kind: "move-character", x: 1, y: 1 } });
    expect(await anna.next((m) => m.t === "result")).toMatchObject({ seq: 1, ok: false });
    anna.send({ t: "cmd", seq: 2, cmd: { kind: "move-character", x: 1.5, y: "3" } });
    expect(await anna.next((m) => m.t === "error")).toMatchObject({ code: "bad-request" });
  });

  it("have no characters in a colony world, and refuse to move one", async () => {
    const { id } = await createWorld("adv-colony");
    const anna = new Player();
    const a = mirror(await anna.join(id, "Anna", token(1)));
    expect(characters(a)).toHaveLength(0);
    anna.send({ t: "cmd", seq: 1, cmd: { kind: "move-character", x: 10, y: 10 } });
    expect(await anna.next((m) => m.t === "result")).toEqual({
      t: "result",
      seq: 1,
      ok: false,
      reason: "This world has no characters",
    });
  });

  it("keep their place when a player leaves, comes back or the server restarts", async () => {
    const { id } = await createWorld("adv-persist", undefined, undefined, "adventure");
    const anna = new Player();
    const a = mirror(await anna.join(id, "Anna", token(1)));
    const goal = goalNear(a, characterOf(a, "p1")!);
    const originalId = characterOf(a, "p1")!.id;
    anna.send({ t: "cmd", seq: 1, cmd: { kind: "move-character", ...goal } });
    await anna.next((m) => m.t === "result");
    for (let i = 0; i < 60 && !settled(characterOf(a, "p1")!, goal); i++)
      applyPatch(
        a,
        (await anna.next<Extract<ServerMessage, { t: "patch" }>>((m) => m.t === "patch")).patch,
      );
    anna.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const back = new Player();
    const b = mirror(await back.join(id, "Anna", token(1)));
    expect(characters(b)).toHaveLength(1);
    expect(characterOf(b, "p1")).toMatchObject({
      id: originalId,
      x: goal.x + 0.5,
      y: goal.y + 0.5,
    });

    await app.close();
    app = await startApp({ port: 0, host: "127.0.0.1", dataDir });
    const later = new Player();
    const c = mirror(await later.join(id, "Anna", token(1)));
    expect(c.mode).toBe("adventure");
    expect(characters(c)).toHaveLength(1);
    expect(characterOf(c, "p1")).toMatchObject({
      id: originalId,
      x: goal.x + 0.5,
      y: goal.y + 0.5,
    });
  });
});

describe("world events reach players", () => {
  it("mirrors storms, raiders and the expedition's stats through patches", async () => {
    const { id } = await createWorld("net-weather", "northfolk", "hard");
    const anna = new Player();
    const welcome = await anna.join(id, "Anna", token(7));
    const mirrorState = mirror(welcome);
    const room = (await app.rooms.get(id))!;
    // Make it dusk, and let a storm form and a raid sail at once.
    room.state.time = (0.75 - 0.1) * 480;
    room.state.nextStorm = 0;
    room.state.nextRaid = 0;
    tally(room.state, "hauled", 5);
    const patches: Extract<ServerMessage, { t: "patch" }>[] = [];
    const seen = { storm: false, pirate: false, stats: false };
    for (let i = 0; i < 30 && !(seen.storm && seen.pirate && seen.stats); i++) {
      const patch = await anna.next<Extract<ServerMessage, { t: "patch" }>>((m) => m.t === "patch");
      patches.push(patch);
      applyPatch(mirrorState, patch.patch);
      seen.storm ||= patch.patch.entities.some((e) => e.type === "storm");
      seen.pirate ||= patch.patch.entities.some((e) => e.type === "pirate");
      seen.stats ||= patch.patch.stats?.hauled === 5;
    }
    expect(seen).toEqual({ storm: true, pirate: true, stats: true });
    expect(mirrorState.stats.hauled).toBe(5);
    expect(mirrorState.difficulty).toBe("hard");
    const stormIds = [...room.state.entities.values()]
      .filter((e) => e.type === "storm")
      .map((e) => e.id);
    expect(stormIds.length).toBeGreaterThan(0);
    for (const sid of stormIds) expect(mirrorState.entities.get(sid)?.type).toBe("storm");
    // Everything a client mirrors survives a JSON round trip, as the wire demands.
    expect(() => JSON.stringify(patches)).not.toThrow();
  });
});

describe("co-op sessions", () => {
  it("shares one world between players and broadcasts changes to both", async () => {
    const { id } = await createWorld();
    const anna = new Player();
    const ben = new Player();
    const a = mirror(await anna.join(id, "Anna", token(1)));
    const welcomeB = await ben.join(id, "Ben", token(2));
    expect(welcomeB.t === "welcome" && welcomeB.players.map((p) => p.name)).toEqual([
      "Anna",
      "Ben",
    ]);
    const b = mirror(welcomeB);
    expect(b.world.start).toEqual(a.world.start);
    await anna.next((m) => m.t === "players" && m.players.length === 2);

    const spot = houseSpot(a);
    anna.send({ t: "cmd", seq: 1, cmd: { kind: "place-building", building: "house", ...spot } });
    expect(await anna.next((m) => m.t === "result")).toEqual({ t: "result", seq: 1, ok: true });

    // Ben sees the construction site and the lower stockpile through patches.
    const seen = await ben.next<Extract<ServerMessage, { t: "patch" }>>(
      (m) =>
        m.t === "patch" &&
        m.patch.entities.some((e) => e.type === "building" && e.kind === "house"),
    );
    applyPatch(b, seen.patch);
    expect(b.stock.wood).toBe(30);
  });

  it("rejects invalid commands with a reason", async () => {
    const { id } = await createWorld();
    const p = new Player();
    await p.join(id, "Cleo", token(3));
    p.send({ t: "cmd", seq: 7, cmd: { kind: "place-building", building: "house", x: 0, y: 0 } });
    const res = await p.next((m) => m.t === "result");
    expect(res).toMatchObject({ t: "result", seq: 7, ok: false });
    p.send({ t: "cmd", seq: 8, cmd: { kind: "place-building", building: "castle", x: 1, y: 1 } });
    expect(await p.next((m) => m.t === "error")).toMatchObject({ code: "bad-request" });
  });

  it("relays cursors and chat", async () => {
    const { id } = await createWorld();
    const a = new Player();
    const b = new Player();
    await a.join(id, "Anna", token(1));
    await b.join(id, "Ben", token(2));
    a.send({ t: "cursor", x: 10, y: 12 });
    expect(await b.next((m) => m.t === "cursor")).toMatchObject({ player: "p1", x: 10, y: 12 });
    a.send({ t: "chat", text: "  ahoy!  " });
    expect(await b.next((m) => m.t === "chat")).toMatchObject({ name: "Anna", text: "ahoy!" });
  });

  it("allows eight players and turns the ninth away", async () => {
    const { id } = await createWorld();
    for (let i = 1; i <= 8; i++) {
      const p = new Player();
      expect((await p.join(id, `P${i}`, token(i))).t).toBe("welcome");
    }
    const ninth = new Player();
    expect(await ninth.join(id, "Late", token(99))).toMatchObject({ t: "error", code: "full" });
  });

  it("gives a returning player the same slot and colour", async () => {
    const { id } = await createWorld();
    const first = new Player();
    const w1 = await first.join(id, "Anna", token(5));
    first.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    const again = new Player();
    const w2 = await again.join(id, "Anna B.", token(5));
    if (w1.t !== "welcome" || w2.t !== "welcome") throw new Error("expected welcomes");
    expect(w2.you).toBe(w1.you);
    expect(w2.players).toHaveLength(1);
    expect(w2.players[0]).toMatchObject({ name: "Anna B.", color: w1.players[0]!.color });
  });

  it("persists worlds across server restarts", async () => {
    const { id } = await createWorld("persist");
    const p = new Player();
    const state = mirror(await p.join(id, "Anna", token(1)));
    const spot = houseSpot(state);
    p.send({ t: "cmd", seq: 1, cmd: { kind: "place-building", building: "house", ...spot } });
    await p.next((m) => m.t === "result");
    await app.close();
    app = await startApp({ port: 0, host: "127.0.0.1", dataDir });
    const q = new Player();
    const again = mirror(await q.join(id, "Anna", token(1)));
    const houses = [...again.entities.values()].filter(
      (e) => e.type === "building" && e.kind === "house",
    );
    expect(houses).toHaveLength(1);
    expect(again.stock.wood).toBe(30);
  });

  it("reports unknown worlds", async () => {
    const p = new Player();
    expect(await p.join("doesnotexist", "Anna", token(1))).toMatchObject({
      t: "error",
      code: "not-found",
    });
  });
});

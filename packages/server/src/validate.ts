// Everything from a socket is untrusted: check shapes before the simulation sees it.
import {
  BUILDINGS,
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  PACK_SLOTS,
  RESOURCES,
  UPGRADES,
  type BuildingKind,
  type ClientMessage,
  type Command,
  type Resource,
  type UpgradeId,
} from "@explorer/shared";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v) && Math.abs(v as number) < 1e6;
const isIntOrNull = (v: unknown): v is number | null => v === null || isInt(v);

export const WORLD_ID = /^[a-z0-9]{4,32}$/;
const TOKEN = /^[a-f0-9]{16,64}$/;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

export function parseCommand(v: unknown): Command | null {
  if (!isObj(v) || typeof v.kind !== "string") return null;
  switch (v.kind) {
    case "place-building":
      if (typeof v.building !== "string" || !(v.building in BUILDINGS)) return null;
      if (!isInt(v.x) || !isInt(v.y)) return null;
      return { kind: "place-building", building: v.building as BuildingKind, x: v.x, y: v.y };
    case "remove-building":
    case "train-villager":
    case "fund-great-work":
      if (!isInt(v.buildingId)) return null;
      return { kind: v.kind, buildingId: v.buildingId };
    case "build-ship":
      if (!isInt(v.buildingId)) return null;
      if (v.ship !== undefined && v.ship !== "scout" && v.ship !== "cargo" && v.ship !== "patrol")
        return null;
      return { kind: "build-ship", buildingId: v.buildingId, ship: v.ship ?? "scout" };
    case "salvage":
      if (!isInt(v.shipId) || !isInt(v.wreckId)) return null;
      return { kind: "salvage", shipId: v.shipId, wreckId: v.wreckId };
    case "dive":
      if (!isInt(v.shipId) || !isInt(v.siteId)) return null;
      return { kind: "dive", shipId: v.shipId, siteId: v.siteId };
    case "set-route":
      if (!isInt(v.shipId) || !isIntOrNull(v.dockId)) return null;
      return { kind: "set-route", shipId: v.shipId, dockId: v.dockId };
    case "mark":
      if (!Array.isArray(v.nodeIds) || v.nodeIds.length > 500 || !v.nodeIds.every(isInt))
        return null;
      if (typeof v.marked !== "boolean") return null;
      return { kind: "mark", nodeIds: v.nodeIds, marked: v.marked };
    case "move-ship":
      if (!isInt(v.shipId) || !isInt(v.x) || !isInt(v.y)) return null;
      if (v.unload !== undefined && typeof v.unload !== "boolean") return null;
      return { kind: "move-ship", shipId: v.shipId, x: v.x, y: v.y, unload: v.unload === true };
    case "move-character":
      if (!isInt(v.x) || !isInt(v.y)) return null;
      return { kind: "move-character", x: v.x, y: v.y };
    case "drop-item": {
      if (!isInt(v.slot) || v.slot < 0 || v.slot >= PACK_SLOTS) return null;
      const out: Command = { kind: "drop-item", slot: v.slot };
      if (v.amount !== undefined) {
        if (!isInt(v.amount) || v.amount < 1) return null;
        out.amount = v.amount;
      }
      if (v.x !== undefined || v.y !== undefined) {
        if (!isInt(v.x) || !isInt(v.y)) return null;
        out.x = v.x;
        out.y = v.y;
      }
      return out;
    }
    case "pickup-item":
      if (!isInt(v.itemId)) return null;
      return { kind: "pickup-item", itemId: v.itemId };
    case "call-aboard":
    case "unload":
      if (!isInt(v.shipId)) return null;
      return { kind: v.kind, shipId: v.shipId };
    case "buy-upgrade":
      if (typeof v.upgrade !== "string" || !(v.upgrade in UPGRADES)) return null;
      return { kind: "buy-upgrade", upgrade: v.upgrade as UpgradeId };
    case "trade":
      if (typeof v.resource !== "string" || !(RESOURCES as readonly string[]).includes(v.resource))
        return null;
      if (v.action !== "sell" && v.action !== "buy") return null;
      return { kind: "trade", resource: v.resource as Resource, action: v.action };
    case "assign": {
      if (!isInt(v.villagerId) || !isObj(v.target)) return null;
      const t = v.target;
      if ("node" in t && isInt(t.node))
        return { kind: "assign", villagerId: v.villagerId, target: { node: t.node } };
      if ("building" in t && isInt(t.building))
        return { kind: "assign", villagerId: v.villagerId, target: { building: t.building } };
      if ("wreck" in t && isInt(t.wreck))
        return { kind: "assign", villagerId: v.villagerId, target: { wreck: t.wreck } };
      if ("ship" in t && isInt(t.ship))
        return { kind: "assign", villagerId: v.villagerId, target: { ship: t.ship } };
      if (isInt(t.x) && isInt(t.y))
        return { kind: "assign", villagerId: v.villagerId, target: { x: t.x, y: t.y } };
      return null;
    }
    default:
      return null;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.t !== "string") return null;
  switch (v.t) {
    case "join": {
      const name = cleanName(v.name);
      if (typeof v.worldId !== "string" || !WORLD_ID.test(v.worldId)) return null;
      if (typeof v.token !== "string" || !TOKEN.test(v.token) || !name) return null;
      return { t: "join", worldId: v.worldId, name, token: v.token };
    }
    case "cmd": {
      const cmd = parseCommand(v.cmd);
      if (!isInt(v.seq) || !cmd) return null;
      return { t: "cmd", seq: v.seq, cmd };
    }
    case "cursor":
      if (!isIntOrNull(v.x) || !isIntOrNull(v.y)) return null;
      return { t: "cursor", x: v.x, y: v.y };
    case "chat": {
      if (typeof v.text !== "string") return null;
      const text = v.text
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, MAX_CHAT_LENGTH);
      return text ? { t: "chat", text } : null;
    }
    case "ping":
      return typeof v.at === "number" ? { t: "ping", at: v.at } : null;
    default:
      return null;
  }
}

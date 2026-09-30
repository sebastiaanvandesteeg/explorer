// Dev helper: draw one room the way the game does (the same pieces, from `roomPieces`), on black,
// with a villager at the NPC's spot and a hero by the door for scale.
// Usage: tsx src/room-preview.ts <out.png> <room> <tribe> [scale]
import { writeFileSync } from "node:fs";
import {
  HALF_H,
  HALF_W,
  ROOMS,
  TRIBES,
  roomEntry,
  roomPieces,
  type BuildingKind,
  type TribeId,
} from "@explorer/shared";
import { Canvas } from "./canvas";
import { encodePng } from "./png";
import { interiorSprites, WALL } from "./sprites/interiors";
import { unitSprites } from "./sprites/units";

const [outArg = "room.png", roomArg = "house", tribeArg = "islanders", scaleArg = "3"] =
  process.argv.slice(2);
const scale = Number(scaleArg);
const RES = 2;

const sprites = new Map([...interiorSprites(), ...unitSprites()].map((s) => [s.name, s]));

function preview(room: BuildingKind, tribe: TribeId, out: string): void {
  const def = ROOMS[room];
  if (!def) throw new Error(`no room ${room}`);
  const margin = 24 * RES;
  const width = (def.w + def.h) * HALF_W * RES + margin * 2;
  const height = ((def.w + def.h) * HALF_H + WALL + 20) * RES + margin * 2;
  const ox = def.h * HALF_W * RES + margin;
  const oy = (WALL + 10) * RES + margin;
  const canvas = new Canvas(width, height);
  canvas.fill(0, 0, width, height, [0, 0, 0, 255]);

  function put(name: string, x: number, y: number): void {
    const s = sprites.get(name);
    if (!s) throw new Error(`missing sprite ${name}`);
    const res = (s.meta?.res as number | undefined) ?? 1;
    // Sprites at double density sit on the double-density canvas as they are; others are doubled.
    const k = RES / res;
    const px = Math.round(ox + (x - y) * HALF_W * RES);
    const py = Math.round(oy + (x + y) * HALF_H * RES);
    if (k === 1) {
      canvas.draw(s.canvas, px - s.anchorX, py - s.anchorY);
      return;
    }
    for (let sy = 0; sy < s.canvas.height; sy++)
      for (let sx = 0; sx < s.canvas.width; sx++) {
        const c = s.canvas.get(sx, sy);
        if (c[3] === 0) continue;
        for (let dy = 0; dy < k; dy++)
          for (let dx = 0; dx < k; dx++)
            canvas.blend(px + (sx - s.anchorX) * k + dx, py + (sy - s.anchorY) * k + dy, c);
      }
  }

  const pieces = roomPieces(room, def, tribe);
  for (const layer of ["floor", "rug", "wall"] as const)
    for (const p of pieces.filter((q) => q.layer === layer)) put(p.sprite, p.x, p.y);
  const things: { key: number; draw: () => void }[] = [];
  for (const p of pieces.filter((q) => q.layer === "object"))
    things.push({ key: p.box!.x1 + p.box!.y1, draw: () => put(p.sprite, p.x, p.y) });
  const npc = def.npc;
  things.push({
    key: npc.x + npc.y + 1,
    draw: () => put(`villager_${tribe}_1_front_stand`, npc.x + 0.5, npc.y + 0.5),
  });
  const entry = roomEntry(def);
  things.push({
    key: entry.x + entry.y + 1,
    draw: () => put(`hero_${tribe}_0_back_stand`, entry.x + 0.5, entry.y + 0.5),
  });
  for (const t of things.sort((a, b) => a.key - b.key)) t.draw();
  for (const p of pieces.filter((q) => q.layer === "door")) put(p.sprite, p.x, p.y);

  const big = new Canvas(width * scale, height * scale);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = canvas.get(x, y);
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) big.set(x * scale + dx, y * scale + dy, c);
    }
  writeFileSync(out, encodePng(big));
  console.log(`${room} (${tribe}) → ${out}`);
}

const rooms =
  roomArg === "all" ? (Object.keys(ROOMS) as BuildingKind[]) : [roomArg as BuildingKind];
const tribes = tribeArg === "all" ? [...TRIBES] : [tribeArg as TribeId];
for (const room of rooms)
  for (const tribe of tribes)
    preview(
      room,
      tribe,
      rooms.length * tribes.length > 1 ? outArg.replace(/\.png$/, `-${room}-${tribe}.png`) : outArg,
    );

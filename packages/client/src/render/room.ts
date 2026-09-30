// Inside a building: a small furnished room on a black background, put together from the same
// atlas sprites as the rest of the game (floors, walls, furniture and doorway come from the sprite
// generator, styled by the world's tribe). The layout and sprite names come from @explorer/shared;
// this file places them, sorts furniture and people by depth, and adds fire glow and name tags.
import {
  HALF_H,
  HALF_W,
  ROOMS,
  ROOM_SLAB_PX,
  ROOM_WALL_PX,
  npcName,
  roomPieces,
  type BuildingEntity,
  type CharacterEntity,
  type CharacterLook,
  type GameState,
  type NpcRole,
  type RoomDef,
  type RoomPiece,
  type TribeId,
} from "@explorer/shared";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Atlas } from "../assets";
import { glowTexture } from "./entities";
import { HeroRig } from "./heroRig";
import { villagerSprite } from "./names";
import { depthOrder, personBox, type DepthBox } from "./roomDepth";

const screenX = (x: number, y: number) => (x - y) * HALF_W;
const screenY = (x: number, y: number) => (x + y) * HALF_H;

interface Figure {
  root: Container;
  /** The villager sprite of an NPC; heroes are drawn by `rig` instead. */
  body: Sprite | null;
  rig: HeroRig | null;
  tag: Text;
  x: number;
  y: number;
  seen: boolean;
}

/** A fire or lantern in the room: a soft additive glow over the sprite that holds it. */
interface Glow {
  sprite: Sprite;
  phase: number;
}

/** One piece of furniture that people can walk in front of and behind. */
interface Thing {
  sprite: Sprite;
  box: DepthBox;
}

const TUNIC: Record<NpcRole, number> = {
  steward: 1,
  resident: 0,
  merchant: 2,
  smith: 1,
  priest: 0,
  sage: 2,
  architect: 1,
  harbourmaster: 2,
};

export class RoomScene {
  /** Goes on the stage: a black backdrop and the room itself. */
  readonly layer = new Container();
  private readonly bg = new Graphics();
  private readonly scene = new Container();
  private readonly tags = new Container();
  private readonly floor = new Container();
  private readonly rugs = new Container();
  private readonly walls = new Container();
  private readonly under = new Container();
  private readonly things = new Container();
  private readonly door = new Container();
  private readonly glows = new Container();
  private readonly hover = new Graphics();
  private current: number | null = null;
  private def: RoomDef | null = null;
  private furniture: Thing[] = [];
  private lights: Glow[] = [];
  private npc: Figure | null = null;
  private hovered = false;
  private readonly figures = new Map<number, Figure>();
  private scale = 2;

  constructor(
    private readonly atlas: Atlas,
    private readonly tribe: TribeId,
    private readonly colourOf: (playerId: string) => number,
    private readonly nameOf: (playerId: string) => string,
  ) {
    this.things.sortableChildren = true;
    this.glows.blendMode = "add";
    this.scene.addChild(
      this.floor,
      this.rugs,
      this.walls,
      this.under,
      this.things,
      this.door,
      this.glows,
    );
    this.under.addChild(this.hover);
    this.layer.addChild(this.bg, this.scene, this.tags);
    this.layer.visible = false;
  }

  get visible(): boolean {
    return this.layer.visible;
  }

  get buildingId(): number | null {
    return this.current;
  }

  /** Put the room of a building on screen. */
  show(state: GameState, b: BuildingEntity): void {
    if (this.current === b.id) {
      this.layer.visible = true;
      return;
    }
    this.clear();
    const def = ROOMS[b.kind];
    if (!def) return;
    this.current = b.id;
    this.def = def;
    for (const piece of roomPieces(b.kind, def, this.tribe)) this.place(piece);
    this.npc = this.makeFigure(`${npcName(state, b)} · ${def.npc.title}`, 0xf3d08f, false);
    this.npc.x = def.npc.x + 0.5;
    this.npc.y = def.npc.y + 0.5;
    this.things.addChild(this.npc.root);
    this.layer.visible = true;
  }

  hide(): void {
    this.layer.visible = false;
    this.clear();
  }

  /** The sprite of one piece of the room, in the layer it belongs to. */
  private place(piece: RoomPiece): void {
    const sprite = this.atlas.sprite(piece.sprite);
    sprite.position.set(screenX(piece.x, piece.y), screenY(piece.x, piece.y));
    const into = {
      floor: this.floor,
      rug: this.rugs,
      wall: this.walls,
      object: this.things,
      door: this.door,
    }[piece.layer];
    into.addChild(sprite);
    if (piece.box) this.furniture.push({ sprite, box: piece.box });
    // Fires and lanterns in the sprite shine; the windows do not (it is daytime outside).
    if (piece.layer === "object" || piece.layer === "door") {
      for (const l of this.atlas.meta[piece.sprite]?.lights ?? []) {
        const glow = new Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.position.set(sprite.x + l.x, sprite.y + l.y);
        glow.scale.set((l.r * 1.25) / 64);
        this.glows.addChild(glow);
        this.lights.push({ sprite: glow, phase: sprite.x * 0.013 + l.x });
      }
    }
  }

  private clear(): void {
    for (const f of this.figures.values()) f.tag.destroy();
    this.figures.clear();
    this.npc?.tag.destroy();
    this.npc = null;
    for (const c of [this.floor, this.rugs, this.walls, this.things, this.door, this.glows])
      c.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.hover.clear();
    this.furniture = [];
    this.lights = [];
    this.current = null;
    this.def = null;
  }

  private makeFigure(name: string, colour: number, hero: boolean): Figure {
    const root = new Container();
    const rig = hero ? new HeroRig(this.atlas) : null;
    const body = hero ? null : this.atlas.sprite(villagerSprite(this.tribe, 0, false, "stand"));
    root.addChild(rig ? rig.root : body!);
    const tag = new Text({
      text: name,
      style: {
        fontFamily: "Pixelify Sans, sans-serif",
        fontSize: 13,
        fill: colour,
        stroke: { color: "#1b1a1f", width: 3 },
      },
    });
    tag.anchor.set(0.5, 1);
    this.tags.addChild(tag);
    return { root, body, rig, tag, x: 0, y: 0, seen: false };
  }

  private pose(
    f: Figure,
    facing: number,
    moving: boolean,
    now: number,
    id: number,
    look: CharacterLook | number,
    playerColour = 0xffffff,
  ): void {
    const phase = Math.floor(now / 160 + id) % 2;
    const pose = moving ? (phase ? "walk0" : "walk1") : "stand";
    if (f.rig && typeof look !== "number") {
      f.rig.set(look, playerColour, facing, pose);
      return;
    }
    if (!f.body || typeof look !== "number") return;
    const back = facing === 2 || facing === 3;
    const flip = facing === 1 || facing === 2;
    this.atlas.setFrame(f.body, villagerSprite(this.tribe, look, back, pose));
    const k = Math.abs(f.body.scale.x);
    f.body.scale.x = flip ? -k : k;
  }

  /** Highlight the NPC (the pointer is over them), like villagers outside. */
  setHover(on: boolean): void {
    this.hovered = on;
  }

  /** Update the people, fit the room to the screen, sort everything by depth and let the fires flicker. */
  frame(
    now: number,
    dt: number,
    state: GameState,
    width: number,
    height: number,
    reserveRight = 0,
  ): void {
    const def = this.def;
    if (!def) return;
    this.bg.clear().rect(0, 0, width, height).fill(0x000000);
    const wallTop = ROOM_WALL_PX + 4;
    const span = {
      w: (def.w + def.h) * HALF_W + 16,
      h: (def.w + def.h) * HALF_H + wallTop + ROOM_SLAB_PX,
    };
    const free = width - reserveRight;
    // The biggest whole zoom at which the room fits beside the conversation panel (so it does not
    // jump when the panel opens), and never blurry: four times when that fits.
    const room = width > 900 ? width - 450 : width;
    const fit = Math.floor(Math.min((room * 0.92) / span.w, (height * 0.8) / span.h));
    const s = Math.max(1, Math.min(4, fit));
    this.scale = s;
    const cx = ((def.w - def.h) * HALF_W) / 2;
    const cy = ((def.w + def.h) * HALF_H + ROOM_SLAB_PX - wallTop) / 2;
    this.scene.scale.set(s);
    this.scene.position.set(Math.round(free / 2 - cx * s), Math.round(height / 2 - cy * s - 20));

    const here: CharacterEntity[] = [];
    for (const e of state.entities.values())
      if (e.type === "character" && e.inside === this.current) here.push(e);

    // The NPC looks towards whoever is nearest.
    const npc = this.npc;
    if (npc) {
      let facing = 1;
      let best = Infinity;
      for (const c of here) {
        const d = Math.hypot(c.room.x - npc.x, c.room.y - npc.y);
        if (d < best) {
          best = d;
          facing =
            Math.abs(c.room.x - npc.x) >= Math.abs(c.room.y - npc.y)
              ? c.room.x > npc.x
                ? 0
                : 2
              : c.room.y > npc.y
                ? 1
                : 3;
        }
      }
      this.pose(npc, facing, false, now, 0, TUNIC[def.npc.role]);
      this.stand(npc, npc.x, npc.y);
    }
    for (const f of this.figures.values()) f.seen = false;
    for (const c of here) {
      let f = this.figures.get(c.id);
      if (!f) {
        f = this.makeFigure(this.nameOf(c.playerId), this.colourOf(c.playerId), true);
        f.x = c.room.x;
        f.y = c.room.y;
        this.figures.set(c.id, f);
        this.things.addChild(f.root);
      }
      f.seen = true;
      const k = 1 - Math.exp(-dt * 16);
      const dx = c.room.x - f.x;
      const dy = c.room.y - f.y;
      const moving = Math.hypot(dx, dy) > 0.04;
      f.x += dx * k;
      f.y += dy * k;
      this.pose(f, c.facing, moving, now, c.id, c.look, this.colourOf(c.playerId));
      this.stand(f, f.x, f.y);
    }
    for (const [id, f] of this.figures) {
      if (f.seen) continue;
      f.tag.destroy();
      f.root.destroy({ children: true });
      this.figures.delete(id);
    }

    // Furniture and people, back to front.
    const items: { box: DepthBox; node: Container | Sprite }[] = this.furniture.map((t) => ({
      box: t.box,
      node: t.sprite,
    }));
    if (npc) items.push({ box: personBox(npc.x, npc.y), node: npc.root });
    for (const f of this.figures.values()) items.push({ box: personBox(f.x, f.y), node: f.root });
    depthOrder(items.map((i) => i.box)).forEach((index, rank) => {
      items[index]!.node.zIndex = rank;
    });

    this.hover.clear();
    if (this.hovered && npc) {
      const x = screenX(npc.x, npc.y);
      const y = screenY(npc.x, npc.y);
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      for (const [rx, ry, alpha] of [
        [17, 24, 0.14],
        [13, 18, 0.22],
        [9, 13, 0.3],
      ] as const)
        this.hover.ellipse(x, y - 9, rx, ry).fill({ color: 0xffe9a8, alpha });
      this.hover.ellipse(x, y, 11, 5.5).fill({ color: 0xffe9a8, alpha: 0.42 + pulse * 0.1 });
      this.hover
        .ellipse(x, y, 11, 5.5)
        .stroke({ width: 1, color: 0xfff3c8, alpha: 0.7, pixelLine: true });
    }
    for (const l of this.lights) l.sprite.alpha = 0.34 + 0.1 * Math.sin(now / 230 + l.phase * 2.1);
  }

  /** Put a person's feet on a spot of the floor and their name above their head. */
  private stand(f: Figure, x: number, y: number): void {
    const sx = screenX(x, y);
    const sy = screenY(x, y);
    f.root.position.set(Math.round(sx), Math.round(sy));
    const p = this.scene.toGlobal({ x: sx, y: sy - 38 });
    f.tag.position.set(Math.round(p.x), Math.round(p.y));
  }

  /** The middle of the NPC on screen (for tests). */
  npcPoint(): { x: number; y: number } | null {
    if (!this.npc) return null;
    const b = this.npc.body!.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** What is under a screen point: the NPC, or a tile of the floor. */
  pick(sx: number, sy: number): { npc: true } | { x: number; y: number } | null {
    const def = this.def;
    if (!def) return null;
    if (this.npc?.body?.getBounds().containsPoint(sx, sy)) return { npc: true };
    const lx = (sx - this.scene.x) / this.scale;
    const ly = (sy - this.scene.y) / this.scale;
    const a = lx / HALF_W;
    const b = ly / HALF_H;
    const x = Math.floor((a + b) / 2);
    const y = Math.floor((b - a) / 2);
    if (x < 0 || y < 0 || x >= def.w || y >= def.h) return null;
    return { x, y };
  }
}

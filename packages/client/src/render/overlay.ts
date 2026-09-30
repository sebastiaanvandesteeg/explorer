import { HALF_H, HALF_W, type PlayerInfo } from "@explorer/shared";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Atlas } from "../assets";
import type { Camera } from "./camera";

export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Surface height in pixels. */
  z: number;
}

const sx = (x: number, y: number) => (x - y) * HALF_W;
const sy = (x: number, y: number) => (x + y) * HALF_H;

function diamond(g: Graphics, f: Footprint): Graphics {
  return g.poly([
    sx(f.x, f.y),
    sy(f.x, f.y) - f.z,
    sx(f.x + f.w, f.y),
    sy(f.x + f.w, f.y) - f.z,
    sx(f.x + f.w, f.y + f.h),
    sy(f.x + f.w, f.y + f.h) - f.z,
    sx(f.x, f.y + f.h),
    sy(f.x, f.y + f.h) - f.z,
  ]);
}

interface RemoteCursor {
  x: number;
  y: number;
  z: number;
  color: string;
  label: Text;
}

export class Overlay {
  /** Drawn in world space, above terrain and below entities. */
  readonly under = new Container();
  /** Drawn in world space above entities (ghost building). */
  readonly over = new Container();
  /** Screen-space labels. */
  readonly screen = new Container();
  private readonly g = new Graphics();
  private readonly top = new Graphics();
  private ghost: Sprite | null = null;
  private ghostName = "";
  private cursors = new Map<string, RemoteCursor>();
  private nameTags = new Map<number, Text>();

  constructor(private readonly atlas: Atlas) {
    this.under.addChild(this.g);
    this.over.addChild(this.top);
  }

  begin(): void {
    this.g.clear();
    this.top.clear();
  }

  hover(f: Footprint): void {
    diamond(this.g, f).stroke({ width: 1, color: 0xfbf0cf, alpha: 0.85, pixelLine: true });
  }

  footprint(f: Footprint, ok: boolean): void {
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        diamond(this.g, { x, y, w: 1, h: 1, z: f.z }).fill({
          color: ok ? 0x8fae45 : 0xc9431a,
          alpha: 0.35,
        });
    diamond(this.g, f).stroke({
      width: 1,
      color: ok ? 0xd8f08a : 0xff8a6a,
      alpha: 0.95,
      pixelLine: true,
    });
  }

  /** Semi-transparent preview of the building about to be placed. */
  ghostSprite(name: string | null, f: Footprint | null, ok: boolean): void {
    if (!name || !f) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (name !== this.ghostName) {
      this.ghost?.destroy();
      this.ghost = this.atlas.sprite(name);
      this.over.addChild(this.ghost);
      this.ghostName = name;
    }
    const g = this.ghost!;
    g.visible = true;
    g.alpha = 0.72;
    g.tint = ok ? 0xffffff : 0xff8a6a;
    g.position.set(sx(f.x, f.y), sy(f.x, f.y) - f.z);
  }

  select(f: Footprint): void {
    diamond(this.g, f).stroke({ width: 1, color: 0xf6d23a, alpha: 1, pixelLine: true });
  }

  ring(x: number, y: number, rx: number, ry: number): void {
    this.g.ellipse(x, y, rx, ry).stroke({ width: 1, color: 0xf6d23a, alpha: 1, pixelLine: true });
  }

  destination(f: Footprint): void {
    diamond(this.top, f).stroke({ width: 1, color: 0xfbf0cf, alpha: 0.9, pixelLine: true });
    const cx = sx(f.x + 0.5, f.y + 0.5);
    const cy = sy(f.x + 0.5, f.y + 0.5) - f.z;
    this.top
      .moveTo(cx, cy)
      .lineTo(cx, cy - 14)
      .stroke({ width: 1, color: 0x3e2f1d });
    this.top.poly([cx, cy - 14, cx + 7, cy - 11.5, cx, cy - 9]).fill({ color: 0xe98a3a });
  }

  marquee(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const x = Math.round(Math.min(a.x, b.x));
    const y = Math.round(Math.min(a.y, b.y));
    const w = Math.round(Math.abs(a.x - b.x));
    const h = Math.round(Math.abs(a.y - b.y));
    this.top
      .rect(x, y, w, h)
      .fill({ color: 0xfbf0cf, alpha: 0.1 })
      .stroke({ width: 1, color: 0xfbf0cf, alpha: 0.85, pixelLine: true });
  }

  highlight(f: Footprint): void {
    diamond(this.g, f).stroke({ width: 1, color: 0xfbf0cf, alpha: 0.9, pixelLine: true });
  }

  /**
   * A player's character: a ring in their colour at its feet (heavier for your own) and their
   * name above its head. `x` and `y` are where its feet are, in world pixels.
   */
  character(
    id: number,
    name: string,
    color: string,
    you: boolean,
    x: number,
    y: number,
    camera: Camera,
  ): void {
    const hex = Number.parseInt(color.slice(1), 16);
    this.g
      .ellipse(x, y, 10, 5)
      .fill({ color: hex, alpha: you ? 0.35 : 0.2 })
      .stroke({ width: you ? 2 : 1, color: hex, alpha: 1, pixelLine: !you });
    let tag = this.nameTags.get(id);
    if (!tag) {
      tag = new Text({
        text: name,
        style: {
          fontFamily: "Pixelify Sans, sans-serif",
          fontSize: 13,
          fill: color,
          stroke: { color: "#1b1a1f", width: 3 },
        },
      });
      tag.anchor.set(0.5, 1);
      this.screen.addChild(tag);
      this.nameTags.set(id, tag);
    }
    if (tag.text !== name) tag.text = name;
    const p = camera.worldToScreen(x, y - 34);
    tag.position.set(Math.round(p.x), Math.round(p.y));
  }

  /** Forget the name tags of characters that are gone. */
  pruneCharacters(alive: Set<number>): void {
    for (const [id, tag] of this.nameTags) {
      if (!alive.has(id)) {
        tag.destroy();
        this.nameTags.delete(id);
      }
    }
  }

  setCursor(player: PlayerInfo, x: number | null, y: number | null, z: number): void {
    let c = this.cursors.get(player.id);
    if (x === null || y === null) {
      if (c) {
        c.label.destroy();
        this.cursors.delete(player.id);
      }
      return;
    }
    if (!c) {
      const label = new Text({
        text: player.name,
        style: {
          fontFamily: "Pixelify Sans, sans-serif",
          fontSize: 13,
          fill: player.color,
          stroke: { color: "#1b1a1f", width: 3 },
        },
      });
      label.anchor.set(0.5, 1);
      this.screen.addChild(label);
      c = { x, y, z, color: player.color, label };
      this.cursors.set(player.id, c);
    }
    c.x = x;
    c.y = y;
    c.z = z;
  }

  dropCursorsExcept(ids: Set<string>): void {
    for (const [id, c] of this.cursors) {
      if (!ids.has(id)) {
        c.label.destroy();
        this.cursors.delete(id);
      }
    }
  }

  drawCursors(camera: Camera): void {
    for (const c of this.cursors.values()) {
      const color = Number.parseInt(c.color.slice(1), 16);
      diamond(this.top, { x: c.x, y: c.y, w: 1, h: 1, z: c.z }).stroke({
        width: 1,
        color,
        alpha: 1,
        pixelLine: true,
      });
      const p = camera.worldToScreen(sx(c.x + 0.5, c.y), sy(c.x + 0.5, c.y) - c.z - 4);
      c.label.position.set(Math.round(p.x), Math.round(p.y));
    }
  }
}

import {
  stormStrength,
  HALF_H,
  HALF_W,
  tileIndex,
  type Entity,
  type StormEntity,
} from "@explorer/shared";
import { Container, Graphics } from "pixi.js";
import { MovingView, screenX, screenY } from "./base";
import type { EntityLayer } from "./layer";

/** A storm front: dark swirling cloud over the sea, rain and the odd flash of lightning. */
export class StormView extends MovingView {
  readonly root = new Container();
  override readonly overhead = true;
  private readonly cloud = new Graphics();
  private readonly rain = new Graphics();
  private readonly flash = new Graphics();
  private s: StormEntity | null = null;
  private flashLeft = 0;
  private nextFlash = 2;
  /** Fixed random offsets inside the storm's disc, so the cloud and rain do not jitter. */
  private readonly blobs: { u: number; v: number; r: number }[] = [];
  private readonly drops: { u: number; v: number; speed: number }[] = [];

  constructor(private readonly layer: EntityLayer) {
    super();
    this.root.addChild(this.cloud, this.rain, this.flash);
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.85;
      this.blobs.push({ u: Math.cos(a) * d, v: Math.sin(a) * d, r: 0.28 + rand() * 0.3 });
    }
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      this.drops.push({ u: Math.cos(a) * d, v: Math.sin(a) * d, speed: 0.7 + rand() * 0.6 });
    }
  }

  update(e: Entity, now: number): void {
    const s = e as StormEntity;
    this.track(s.x, s.y, now, this.s === null);
    this.s = s;
  }

  override frame(now: number, dt: number): void {
    const s = this.s;
    if (!s) return;
    this.interpolate(now);
    const state = this.layer.state;
    const w = state.world;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    const seen =
      cx >= 0 &&
      cy >= 0 &&
      cx < w.width &&
      cy < w.height &&
      state.explored[tileIndex(w, cx, cy)] === 1;
    this.root.visible = seen;
    if (!seen) return;
    const strength = stormStrength(s);
    this.root.position.set(screenX(this.x, this.y), screenY(this.x, this.y));
    // A world circle is an ellipse in the isometric view.
    const rx = s.radius * Math.SQRT2 * HALF_W;
    const ry = s.radius * Math.SQRT2 * HALF_H;
    const t = now / 1000;

    this.cloud.clear();
    // Soft edges: nested discs, darkest at the eye.
    for (const k of [1, 0.85, 0.7, 0.55, 0.4, 0.25])
      this.cloud.ellipse(0, 0, rx * k, ry * k).fill({ color: 0x0b1a26, alpha: 0.1 * strength });
    for (const [i, b] of this.blobs.entries()) {
      // The blobs circle the eye slowly, so the cloud seems to churn.
      const a = t * (0.12 + (i % 3) * 0.03) * (i % 2 ? 1 : -1);
      const u = b.u * Math.cos(a) - b.v * Math.sin(a);
      const v = b.u * Math.sin(a) + b.v * Math.cos(a);
      this.cloud
        .ellipse(u * rx, v * ry, b.r * rx, b.r * ry)
        .fill({ color: i % 4 === 0 ? 0x1c2c3c : 0x0e1c28, alpha: 0.11 * strength });
    }

    this.rain.clear();
    for (const d of this.drops) {
      const fall = (t * d.speed * 1.6 + d.u * 3.1) % 1;
      const px = d.u * rx * 0.95 - fall * 14;
      const py = d.v * ry * 0.95 + (fall - 0.5) * 60;
      this.rain.moveTo(px, py).lineTo(px - 3, py + 8);
    }
    this.rain.stroke({ color: 0xbcd4e8, width: 1, alpha: 0.5 * strength });

    this.nextFlash -= dt;
    if (this.nextFlash <= 0 && strength > 0.4) {
      this.nextFlash = 2.5 + Math.random() * 5;
      this.flashLeft = 0.28;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * s.radius * 0.8;
      this.layer.shot(
        "bolt",
        { x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d },
        { x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d },
      );
    }
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.flash.clear();
    if (this.flashLeft > 0)
      this.flash
        .ellipse(0, 0, rx, ry)
        .fill({ color: 0xe8f0ff, alpha: (this.flashLeft / 0.28) * 0.28 });
  }
}

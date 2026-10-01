import {
  HALF_H,
  HALF_W,
  isLandTerrain,
  surfaceHeight,
  tileIndex,
  TICK_SECONDS,
  type Entity,
  type GameState,
  type WorldMap,
} from "@explorer/shared";
import { Container, Sprite, Texture } from "pixi.js";
import { coverAlpha, coverAt } from "../occlusion";

export const INTERP_MS = TICK_SECONDS * 1000;
/** Pier decks sit a few pixels above the water (the pier and harbour art bake in the same figure). */
export const DECK_PX = 7;
/** How high above the water a ship's deck is, for the people standing on it. */
export const DECK_HEIGHT = 11;

export function tileHeight(state: GameState, x: number, y: number): number {
  const w = state.world;
  const tx = Math.min(w.width - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(w.height - 1, Math.max(0, Math.floor(y)));
  const k = tileIndex(w, tx, ty);
  const land = isLandTerrain(w.terrain[k]!);
  if (!land) {
    const e = state.entities.get(state.occupancy[k]!);
    if (e?.type === "building" && (e.kind === "dock" || e.kind === "harbour")) return DECK_PX;
  }
  return surfaceHeight(land, w.elevation[k]!);
}

export const screenX = (x: number, y: number) => (x - y) * HALF_W;
export const screenY = (x: number, y: number) => (x + y) * HALF_H;

let glow: Texture | null = null;

/** A soft warm blob, the shape of one window's or fire's glow at night. */
export function glowTexture(): Texture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 214, 130, 1)");
  g.addColorStop(0.3, "rgba(255, 176, 74, 0.55)");
  g.addColorStop(1, "rgba(255, 140, 40, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glow = Texture.from(c);
  return glow;
}

let beamTex: Texture | null = null;

/** A lighthouse beam: a wedge of warm light fading with distance, pointing along +x. */
export function beamTexture(): Texture {
  if (beamTex) return beamTex;
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 48;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 360, 0);
  g.addColorStop(0, "rgba(255, 236, 170, 0.85)");
  g.addColorStop(0.35, "rgba(255, 214, 120, 0.32)");
  g.addColorStop(1, "rgba(255, 200, 100, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(360, 9);
  ctx.lineTo(360, 39);
  ctx.closePath();
  ctx.fill();
  beamTex = Texture.from(c);
  return beamTex;
}

export interface Smoke {
  sprite: Sprite;
  age: number;
  life: number;
  x: number;
  y: number;
}

export abstract class View {
  abstract readonly root: Container;
  /** Flat things sit in the ground layer, under everything that stands up. */
  readonly flat: boolean = false;
  /** Weather and the like sit above everything in the world. */
  readonly overhead: boolean = false;
  abstract update(e: Entity, now: number): void;
  frame(_now: number, _dt: number): void {}
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** Villagers and ships move every tick: interpolate between the last two known positions. */
export abstract class MovingView extends View {
  protected fromX = 0;
  protected fromY = 0;
  protected toX = 0;
  protected toY = 0;
  protected since = 0;
  protected moving = false;
  x = 0;
  y = 0;
  private shown = 1;

  /** Ease toward being a ghost while hidden behind terrain, and back to solid when clear. */
  protected fadeBehindTerrain(world: WorldMap, z: number, dt: number): number {
    const target = coverAlpha(coverAt(world, this.x, this.y, z));
    this.shown += (target - this.shown) * Math.min(1, dt * 8);
    return this.shown;
  }

  protected track(x: number, y: number, now: number, snap: boolean): void {
    if (snap) {
      this.fromX = this.toX = this.x = x;
      this.fromY = this.toY = this.y = y;
      this.since = now;
      return;
    }
    this.moving = Math.hypot(x - this.toX, y - this.toY) > 1e-4;
    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = x;
    this.toY = y;
    this.since = now;
  }

  protected interpolate(now: number): void {
    const t = Math.min(1, (now - this.since) / INTERP_MS);
    this.x = this.fromX + (this.toX - this.fromX) * t;
    this.y = this.fromY + (this.toY - this.fromY) * t;
    if (t >= 1 && now - this.since > INTERP_MS * 2.5) this.moving = false;
  }
}

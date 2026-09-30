import { HALF_H, HALF_W } from "@explorer/shared";
import { Rectangle, type Container } from "pixi.js";

export const MIN_ZOOM = 3.5;
export const MAX_ZOOM = 3.5;

/** Integer zoom and whole-pixel positions keep the pixel art crisp. */
export class Camera {
  zoom = 3.5;
  /** World pixel at the centre of the screen. */
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  apply(world: Container): void {
    this.clamp();
    world.scale.set(this.zoom);
    world.position.set(
      Math.round(this.width / 2 - this.x * this.zoom),
      Math.round(this.height / 2 - this.y * this.zoom),
    );
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const ox = Math.round(this.width / 2 - this.x * this.zoom);
    const oy = Math.round(this.height / 2 - this.y * this.zoom);
    return { x: (sx - ox) / this.zoom, y: (sy - oy) / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const ox = Math.round(this.width / 2 - this.x * this.zoom);
    const oy = Math.round(this.height / 2 - this.y * this.zoom);
    return { x: wx * this.zoom + ox, y: wy * this.zoom + oy };
  }

  view(margin = 32): Rectangle {
    const w = this.width / this.zoom;
    const h = this.height / this.zoom;
    return new Rectangle(
      this.x - w / 2 - margin,
      this.y - h / 2 - margin,
      w + margin * 2,
      h + margin * 2,
    );
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
  }

  /** Step the zoom while keeping the world point under (sx, sy) fixed. */
  zoomAt(step: number, sx: number, sy: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + step));
    if (next === this.zoom) return;
    const before = this.screenToWorld(sx, sy);
    this.zoom = next;
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  private clamp(): void {
    const minX = -this.worldHeight * HALF_W;
    const maxX = this.worldWidth * HALF_W;
    const maxY = (this.worldWidth + this.worldHeight) * HALF_H;
    this.x = Math.min(maxX, Math.max(minX, this.x));
    this.y = Math.min(maxY, Math.max(0, this.y));
  }
}

import {
  hash2d,
  HALF_H,
  HALF_W,
  inBounds,
  isLandTerrain,
  surfaceHeight,
  Terrain,
  tileIndex,
  type DecoSpawn,
  type GameState,
} from "@explorer/shared";
import { Container, Rectangle, RenderTexture, Sprite, TilingSprite, type Renderer } from "pixi.js";
import type { Atlas } from "../assets";

export const CHUNK = 16;
const TOP_MARGIN = 64; // tall decoration and raised land poke above a chunk's diamond
const BOTTOM_MARGIN = 8;
const MAX_CACHED = 56;

type Side = "-x" | "+x" | "-y" | "+y";
const SIDES: [Side, number, number][] = [
  ["-x", -1, 0],
  ["+x", 1, 0],
  ["-y", 0, -1],
  ["+y", 0, 1],
];

interface Chunk {
  sprite: Sprite;
  texture: RenderTexture;
  lastSeen: number;
}

/** Height of a tile's visible surface: unexplored tiles render as flat fog at sea level. */
export function visibleHeight(state: GameState, x: number, y: number): number | null {
  const w = state.world;
  if (!inBounds(w, x, y)) return null;
  const k = tileIndex(w, x, y);
  if (!state.explored[k]) return 0;
  return surfaceHeight(isLandTerrain(w.terrain[k]!), w.elevation[k]!);
}

export class TerrainLayer {
  readonly container = new Container();
  readonly ocean: TilingSprite;
  private readonly chunks = new Map<number, Chunk>();
  private readonly dirty = new Set<number>();
  private readonly decor = new Map<number, DecoSpawn>();
  private readonly cols: number;
  private readonly rows: number;
  private frameNo = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly atlas: Atlas,
    private state: GameState,
  ) {
    const w = state.world;
    this.cols = Math.ceil(w.width / CHUNK);
    this.rows = Math.ceil(w.height / CHUNK);
    for (const d of w.decor) this.decor.set(tileIndex(w, d.x, d.y), d);
    const margin = 1024;
    this.ocean = new TilingSprite({
      texture: atlas.ocean[0]!,
      x: -w.height * HALF_W - margin,
      y: -margin,
      width: (w.width + w.height) * HALF_W + margin * 2,
      height: (w.width + w.height) * HALF_H + margin * 2,
    });
  }

  /** Swap in a new state (after a resync) and redraw everything. */
  reset(state: GameState): void {
    this.state = state;
    for (const key of [...this.chunks.keys()]) this.evict(key);
  }

  animate(time: number): void {
    const frame = Math.floor(time / 450) % 3;
    this.ocean.texture = this.atlas.ocean[frame]!;
    this.ocean.tilePosition.set(Math.sin(time / 4000) * 6, (time / 400) % 64);
  }

  /** Mark chunks containing these tiles (and their neighbours' chunks) for redraw. */
  invalidateTiles(tiles: Iterable<number>): void {
    const W = this.state.world.width;
    for (const k of tiles) {
      const x = k % W;
      const y = Math.floor(k / W);
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const cx = Math.floor((x + dx) / CHUNK);
        const cy = Math.floor((y + dy) / CHUNK);
        if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows)
          this.dirty.add(cy * this.cols + cx);
      }
    }
  }

  invalidateRect(x: number, y: number, w: number, h: number): void {
    const tiles: number[] = [];
    const W = this.state.world.width;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) tiles.push(ty * W + tx);
    this.invalidateTiles(tiles);
  }

  private bounds(cx: number, cy: number): Rectangle {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const minSx = (x0 - (y0 + CHUNK - 1)) * HALF_W - HALF_W;
    const maxSx = (x0 + CHUNK - 1 - y0) * HALF_W + HALF_W;
    const minSy = (x0 + y0) * HALF_H - TOP_MARGIN;
    const maxSy = (x0 + y0 + (CHUNK - 1) * 2) * HALF_H + HALF_H * 2 + BOTTOM_MARGIN;
    return new Rectangle(minSx, minSy, maxSx - minSx, maxSy - minSy);
  }

  /** Keep visible chunks drawn; redraw at most `budget` per frame. */
  update(view: Rectangle, budget = 4): void {
    this.frameNo++;
    const visible: { key: number; cx: number; cy: number; b: Rectangle }[] = [];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const b = this.bounds(cx, cy);
        if (
          b.right < view.left ||
          b.left > view.right ||
          b.bottom < view.top ||
          b.top > view.bottom
        )
          continue;
        visible.push({ key: cy * this.cols + cx, cx, cy, b });
      }
    }
    // Draw nearest-to-centre chunks first so the middle of the screen fills in quickly.
    const mx = view.x + view.width / 2;
    const my = view.y + view.height / 2;
    visible.sort(
      (a, b) =>
        Math.hypot(a.b.x + a.b.width / 2 - mx, a.b.y + a.b.height / 2 - my) -
        Math.hypot(b.b.x + b.b.width / 2 - mx, b.b.y + b.b.height / 2 - my),
    );
    for (const v of visible) {
      const chunk = this.chunks.get(v.key);
      if (chunk && !this.dirty.has(v.key)) {
        chunk.lastSeen = this.frameNo;
        chunk.sprite.visible = true;
        continue;
      }
      if (budget <= 0) continue;
      budget--;
      this.draw(v.key, v.cx, v.cy, v.b);
    }
    const visibleKeys = new Set(visible.map((v) => v.key));
    for (const [key, c] of this.chunks) if (!visibleKeys.has(key)) c.sprite.visible = false;
    if (this.chunks.size > MAX_CACHED) {
      const old = [...this.chunks.entries()]
        .filter(([k]) => !visibleKeys.has(k))
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [k] of old.slice(0, this.chunks.size - MAX_CACHED)) this.evict(k);
    }
  }

  private evict(key: number): void {
    const c = this.chunks.get(key);
    if (!c) return;
    c.sprite.destroy();
    c.texture.destroy(true);
    this.chunks.delete(key);
  }

  private draw(key: number, cx: number, cy: number, b: Rectangle): void {
    this.dirty.delete(key);
    const tmp = new Container();
    const add = (name: string, sx: number, sy: number) => {
      const s = this.atlas.sprite(name);
      s.position.set(sx - b.x, sy - b.y);
      tmp.addChild(s);
    };
    const { world: w, occupancy } = this.state;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let d = 0; d < CHUNK * 2 - 1; d++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const ly = d - lx;
        if (ly < 0 || ly >= CHUNK) continue;
        const x = x0 + lx;
        const y = y0 + ly;
        if (x >= w.width || y >= w.height) continue;
        const k = tileIndex(w, x, y);
        const sx = (x - y) * HALF_W;
        const sy = (x + y) * HALF_H;
        const t = w.terrain[k]!;
        const land = isLandTerrain(t);
        const h = surfaceHeight(land, w.elevation[k]!);
        const deco = this.decor.get(k);
        if (!land) {
          const shore = w.shore[k]!;
          if (shore > 3 && hash2d(x, y, 0x6b) < 0.05)
            add(`w_kelp_${Math.floor(hash2d(x, y, 0x6c) * 3)}`, sx, sy);
          for (const [side, dx, dy] of SIDES) {
            if (
              inBounds(w, x + dx, y + dy) &&
              isLandTerrain(w.terrain[tileIndex(w, x + dx, y + dy)]!)
            )
              add(`w_foam_${side}`, sx, sy);
          }
          if (deco?.kind === "sea_rock") add(`sea_rock_${deco.variant}`, sx, sy);
        } else {
          add(groundSprite(t, x, y), sx, sy - h);
          const lip =
            t === Terrain.Sand
              ? "sand"
              : t === Terrain.Rock
                ? "rock"
                : t === Terrain.Dirt
                  ? "dirt"
                  : "grass";
          const hl = h - (heightOf(this.state, x, y + 1) ?? 0);
          if (hl > 0) add(`c_left_${hl}_${lip}`, sx, sy - h);
          const hr = h - (heightOf(this.state, x + 1, y) ?? 0);
          if (hr > 0) add(`c_right_${hr}_${lip}`, sx, sy - h);
          if (deco && occupancy[k] === 0) {
            const name =
              deco.kind === "flowers"
                ? `deco_flowers_${deco.variant}`
                : deco.kind === "grass"
                  ? `deco_grass_${deco.variant}`
                  : deco.kind === "sunflowers"
                    ? "deco_sunflowers"
                    : null;
            if (name) add(name, sx, sy - h);
          }
        }
      }
    }
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const texture = RenderTexture.create({
        width: b.width,
        height: b.height,
        resolution: 1,
        scaleMode: "nearest",
        antialias: false,
      });
      const sprite = new Sprite(texture);
      sprite.position.set(b.x, b.y);
      // Chunks further forward (larger cx + cy) draw later.
      sprite.zIndex = cx + cy;
      this.container.addChild(sprite);
      this.container.sortableChildren = true;
      chunk = { sprite, texture, lastSeen: this.frameNo };
      this.chunks.set(key, chunk);
    }
    chunk.lastSeen = this.frameNo;
    chunk.sprite.visible = true;
    this.renderer.render({
      container: tmp,
      target: chunk.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    tmp.destroy({ children: true });
  }
}

function heightOf(state: GameState, x: number, y: number): number | null {
  const w = state.world;
  if (!inBounds(w, x, y)) return null;
  const k = tileIndex(w, x, y);
  return surfaceHeight(isLandTerrain(w.terrain[k]!), w.elevation[k]!);
}

function groundSprite(t: number, x: number, y: number): string {
  const r = hash2d(x, y, 0x77);
  switch (t) {
    case Terrain.Sand:
      return `t_sand_${Math.floor(r * 3)}`;
    case Terrain.Rock:
      return `t_rock_${Math.floor(r * 2)}`;
    case Terrain.Dirt:
      return `t_dirt_${Math.floor(r * 2)}`;
    default:
      return r < 0.08 ? "t_grass_3" : `t_grass_${Math.floor(hash2d(x, y, 0x78) * 3)}`;
  }
}

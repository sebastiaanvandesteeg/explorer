import { WAVE_SEQUENCE, chunkRect } from "@explorer/art";
import {
  hash2d,
  HALF_H,
  HALF_W,
  inBounds,
  isLandTerrain,
  surfaceHeight,
  tileIndex,
  type BuildingEntity,
  type DecoSpawn,
  type GameState,
} from "@explorer/shared";
import {
  Container,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
  type Renderer,
} from "pixi.js";
import type { Atlas } from "../assets";
import { ChunkPainter } from "./chunkPainter";
import { buildingsKey, groundMasks, type GroundMasks } from "./ground";
import { biomeOfTile, decorSprite, tileJitter } from "./names";
import { coverAt } from "./occlusion";
import type { Pixels } from "./paintProtocol";

export const CHUNK = 16;
const MAX_CACHED = 40;
/** How long each step of the wave animation lasts. */
const WAVE_MS = 550;
/** Painting jobs the worker is given at once, so a fast pan is not stuck behind stale requests. */
const MAX_IN_FLIGHT = 3;

interface Chunk {
  lastSeen: number;
  /**
   * The painted land, cliffs, beaches, foam and shallows: undefined while the worker paints it,
   * null when the chunk is open sea. Kept as pixels so decoration can be redrawn cheaply.
   */
  ground: Pixels | null | undefined;
  /** The ground is out of date (a path was laid) and is being repainted; the old one is shown. */
  stale: boolean;
  /** What the chunk shows: the ground with the decoration stamped on top. */
  view: { sprite: Sprite; texture: RenderTexture } | null;
  /** The foam and shallows, one texture per wave frame, shown under the ground. */
  waves: { sprite: Sprite; textures: Texture[] } | null;
}

/** A texture from painted RGBA pixels. */
function pixelTexture(pixels: Pixels, width: number, height: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
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
  /** Foam and shallows, drawn under `container` so cliffs and rocks stay solid over the waves. */
  readonly waves = new Container();
  readonly ocean: TilingSprite;
  private readonly chunks = new Map<number, Chunk>();
  private readonly dirty = new Set<number>();
  private readonly decor = new Map<number, DecoSpawn>();
  /** Boulders on the shore: purely visual, so they are worked out here rather than in the world. */
  private readonly shoreRocks = new Map<number, { sprite: string; dx: number; dy: number }>();
  /** Chunks with any decoration at all; open sea without any needs no texture. */
  private readonly decorChunks = new Set<number>();
  private readonly cols: number;
  private readonly rows: number;
  private painter: ChunkPainter;
  /** What the settlement has done to the ground, as last sent to the painter. */
  private masks: GroundMasks;
  private buildingsKey = "";
  private inFlight = 0;
  private generation = 0;
  private frameNo = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly atlas: Atlas,
    private state: GameState,
  ) {
    const w = state.world;
    this.cols = Math.ceil(w.width / CHUNK);
    this.rows = Math.ceil(w.height / CHUNK);
    for (const d of w.decor) {
      this.decor.set(tileIndex(w, d.x, d.y), d);
      this.decorChunks.add(Math.floor(d.y / CHUNK) * this.cols + Math.floor(d.x / CHUNK));
    }
    this.placeShoreRocks();
    this.painter = new ChunkPainter(w, CHUNK);
    this.masks = groundMasks(w, []);
    this.syncBuildings();
    const margin = 1024;
    this.ocean = new TilingSprite({
      texture: atlas.ocean[0]!,
      x: -w.height * HALF_W - margin,
      y: -margin,
      width: (w.width + w.height) * HALF_W + margin * 2,
      height: (w.width + w.height) * HALF_H + margin * 2,
    });
  }

  /** Scatter boulders along the coast: on land tiles that touch the sea, leaning toward the water. */
  private placeShoreRocks(): void {
    const w = this.state.world;
    const dock = w.start.dock;
    const sides = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const k = tileIndex(w, x, y);
        if (!isLandTerrain(w.terrain[k]!)) continue;
        // The coast in front of the dock and town stays clear.
        if (
          x >= dock.x - 6 &&
          x < dock.x + dock.w + 6 &&
          y >= dock.y - 6 &&
          y < dock.y + dock.h + 6
        )
          continue;
        let toward = { x: 0, y: 0 };
        let wet = 0;
        for (const [dx, dy] of sides) {
          const nx = x + dx;
          const ny = y + dy;
          if (inBounds(w, nx, ny) && isLandTerrain(w.terrain[tileIndex(w, nx, ny)]!)) continue;
          toward = { x: toward.x + dx, y: toward.y + dy };
          wet++;
        }
        if (wet === 0 || hash2d(x, y, 0x93) > (w.elevation[k]! >= 2 ? 0.1 : 0.24)) continue;
        // Lean toward the water: one screen pixel per unit of tile offset, along the shore normal.
        const lean = 0.34 / wet;
        const j = tileJitter(x, y, 0.7);
        this.shoreRocks.set(k, {
          sprite: `shore_rock_${Math.floor(hash2d(x, y, 0x94) * 4)}`,
          dx: Math.round((toward.x - toward.y) * HALF_W * lean) + j.dx,
          dy: Math.round((toward.x + toward.y) * HALF_H * lean) + j.dy,
        });
        this.decorChunks.add(Math.floor(y / CHUNK) * this.cols + Math.floor(x / CHUNK));
      }
    }
  }

  /** Swap in a new state (after a resync) and redraw everything. */
  reset(state: GameState): void {
    this.state = state;
    this.painter.dispose();
    this.painter = new ChunkPainter(state.world, CHUNK);
    this.masks = groundMasks(state.world, []);
    this.buildingsKey = "";
    this.syncBuildings();
    this.generation++;
    this.inFlight = 0;
    this.pending.clear();
    for (const key of [...this.chunks.keys()]) this.evict(key);
  }

  /**
   * Paths, farm fields and trampled yards are painted into the ground rather than stamped as
   * sprites, so their edges blend into the land. Call after buildings appear, finish or go away;
   * it only repaints the chunks whose ground actually changed.
   */
  syncBuildings(): void {
    const buildings: BuildingEntity[] = [];
    for (const e of this.state.entities.values()) if (e.type === "building") buildings.push(e);
    const key = buildingsKey(buildings);
    if (key === this.buildingsKey) return;
    this.buildingsKey = key;
    const w = this.state.world;
    const next = groundMasks(w, buildings);
    const touched = new Set<number>();
    for (let k = 0; k < next.wear.length; k++) {
      if (
        next.wear[k] === this.masks.wear[k] &&
        next.paved[k] === this.masks.paved[k] &&
        next.field[k] === this.masks.field[k]
      )
        continue;
      const x = k % w.width;
      const y = Math.floor(k / w.width);
      // Ground blends into its neighbours up to a couple of tiles away.
      for (const dx of [-2, 0, 2])
        for (const dy of [-2, 0, 2]) {
          const cx = Math.floor((x + dx) / CHUNK);
          const cy = Math.floor((y + dy) / CHUNK);
          if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows)
            touched.add(cy * this.cols + cx);
        }
    }
    if (touched.size === 0) return;
    this.masks = next;
    this.painter.setMasks(next);
    for (const key of touched) {
      const chunk = this.chunks.get(key);
      if (chunk) chunk.stale = true;
    }
  }

  animate(time: number): void {
    const frame = Math.floor(time / 450) % 3;
    this.ocean.texture = this.atlas.ocean[frame]!;
    this.ocean.tilePosition.set(Math.sin(time / 4000) * 6, (time / 400) % 64);
    // Waves run up the shore and back: every chunk shows the same step of the sequence.
    const step = WAVE_SEQUENCE[Math.floor(time / WAVE_MS) % WAVE_SEQUENCE.length]!;
    for (const c of this.chunks.values()) {
      if (c.waves?.sprite.visible) c.waves.sprite.texture = c.waves.textures[step]!;
    }
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

  private readonly rects = new Map<number, Rectangle>();

  /** A chunk's pixel bounds (worked out once). */
  private bounds(cx: number, cy: number): Rectangle {
    const key = cy * this.cols + cx;
    let b = this.rects.get(key);
    if (!b) {
      const r = chunkRect(cx, cy, CHUNK);
      b = new Rectangle(r.x, r.y, r.w, r.h);
      this.rects.set(key, b);
    }
    return b;
  }

  private overlaps(b: Rectangle, view: Rectangle): boolean {
    return !(
      b.right < view.left ||
      b.left > view.right ||
      b.bottom < view.top ||
      b.top > view.bottom
    );
  }

  /** Chunks touching a view rectangle, nearest to its centre first. */
  private chunksIn(view: Rectangle): { key: number; cx: number; cy: number; b: Rectangle }[] {
    const found: { key: number; cx: number; cy: number; b: Rectangle; d: number }[] = [];
    const mx = view.x + view.width / 2;
    const my = view.y + view.height / 2;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const b = this.bounds(cx, cy);
        if (!this.overlaps(b, view)) continue;
        const d = Math.hypot(b.x + b.width / 2 - mx, b.y + b.height / 2 - my);
        found.push({ key: cy * this.cols + cx, cx, cy, b, d });
      }
    }
    return found.sort((a, b) => a.d - b.d);
  }

  /** Painting jobs in flight, by chunk. */
  private readonly pending = new Map<number, Promise<void>>();

  /** Ask the worker for a chunk's ground unless it is already painted or being painted. */
  private request(c: { key: number; cx: number; cy: number; b: Rectangle }): Promise<void> {
    const existing = this.pending.get(c.key);
    if (existing) return existing;
    const known = this.chunks.get(c.key);
    if (known && known.ground !== undefined && !known.stale) return Promise.resolve();
    const chunk: Chunk = known ?? {
      lastSeen: this.frameNo,
      ground: undefined,
      stale: false,
      view: null,
      waves: null,
    };
    chunk.stale = false;
    this.chunks.set(c.key, chunk);
    const generation = this.generation;
    this.inFlight++;
    const job = this.painter
      .paint(c.cx, c.cy, { x: c.b.x, y: c.b.y, w: c.b.width, h: c.b.height })
      .then((painted) => {
        if (generation !== this.generation) return;
        this.inFlight--;
        this.pending.delete(c.key);
        // The chunk may have been evicted or replaced while it was being painted.
        if (this.chunks.get(c.key) !== chunk) return;
        chunk.ground = painted?.ground ?? null;
        this.setWaves(chunk, c.b, painted?.waves ?? null);
        this.dirty.add(c.key);
      });
    this.pending.set(c.key, job);
    return job;
  }

  /**
   * Paint the ground of everything in view and draw it, so the first frame is not empty. Gives up
   * waiting after a couple of seconds rather than hold up the game.
   */
  async preload(view: Rectangle): Promise<void> {
    const jobs = this.chunksIn(view).map((c) => this.request(c));
    await Promise.race([Promise.all(jobs), new Promise((done) => setTimeout(done, 2500))]);
    this.update(view, Infinity);
  }

  /** Keep visible chunks drawn; redraw at most `budget` per frame. */
  update(view: Rectangle, budget = 4): void {
    this.frameNo++;
    const visible = this.chunksIn(view);
    for (const v of visible) {
      const chunk = this.chunks.get(v.key);
      if (!chunk || chunk.ground === undefined || chunk.stale) {
        if (this.inFlight < MAX_IN_FLIGHT) void this.request(v);
        if (!chunk || chunk.ground === undefined) continue;
      }
      chunk.lastSeen = this.frameNo;
      if (chunk.waves) chunk.waves.sprite.visible = true;
      if (chunk.ground === null && !this.decorChunks.has(v.key)) continue;
      if (chunk.view && !this.dirty.has(v.key)) {
        chunk.view.sprite.visible = true;
        continue;
      }
      if (budget <= 0) continue;
      budget--;
      this.draw(v.key, v.cx, v.cy, v.b, chunk);
    }
    // While idle, paint one ring beyond the screen so panning finds the land already there.
    if (this.inFlight === 0 && this.frameNo % 6 === 0) {
      const wide = new Rectangle(
        view.x - view.width * 0.5,
        view.y - view.height * 0.5,
        view.width * 2,
        view.height * 2,
      );
      for (const v of this.chunksIn(wide)) {
        const chunk = this.chunks.get(v.key);
        if (chunk && chunk.ground !== undefined) {
          chunk.lastSeen = this.frameNo;
          continue;
        }
        void this.request(v);
        break;
      }
    }
    const visibleKeys = new Set(visible.map((v) => v.key));
    for (const [key, c] of this.chunks) {
      if (visibleKeys.has(key)) continue;
      if (c.view) c.view.sprite.visible = false;
      if (c.waves) c.waves.sprite.visible = false;
    }
    if (this.chunks.size > MAX_CACHED) {
      const old = [...this.chunks.entries()]
        .filter(([k, c]) => !visibleKeys.has(k) && c.ground !== undefined)
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [k] of old.slice(0, this.chunks.size - MAX_CACHED)) this.evict(k);
    }
  }

  /** Replace a chunk's wave frames (they are painted again whenever its ground is). */
  private setWaves(chunk: Chunk, b: Rectangle, frames: Pixels[] | null): void {
    if (chunk.waves) {
      chunk.waves.sprite.destroy();
      for (const t of chunk.waves.textures) t.destroy(true);
      chunk.waves = null;
    }
    if (!frames) return;
    const textures = frames.map((f) => pixelTexture(f, b.width, b.height));
    const sprite = new Sprite(textures[0]);
    sprite.position.set(b.x, b.y);
    sprite.visible = false;
    this.waves.addChild(sprite);
    chunk.waves = { sprite, textures };
  }

  private evict(key: number): void {
    const c = this.chunks.get(key);
    if (!c) return;
    if (c.view) {
      c.view.sprite.destroy();
      c.view.texture.destroy(true);
    }
    if (c.waves) {
      c.waves.sprite.destroy();
      for (const t of c.waves.textures) t.destroy(true);
    }
    this.chunks.delete(key);
    this.dirty.delete(key);
  }

  /** Stamp the decoration over the chunk's painted ground and render the result. */
  private draw(key: number, cx: number, cy: number, b: Rectangle, chunk: Chunk): void {
    this.dirty.delete(key);
    const tmp = new Container();
    // The land, cliffs, beaches, foam and shallows were painted per pixel from smooth fields, so
    // no tile edge ever shows; only decoration is stamped on top as sprites.
    let groundTexture: Texture | null = null;
    if (chunk.ground) {
      groundTexture = pixelTexture(chunk.ground, b.width, b.height);
      tmp.addChild(new Sprite(groundTexture));
    }
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
        const deco = this.decor.get(k);
        const rock = this.shoreRocks.get(k);
        if (!deco && !rock) continue;
        const sx = (x - y) * HALF_W;
        const sy = (x + y) * HALF_H;
        // Decoration is painted over the ground, so anything behind a cliff or hill is left out.
        const base = isLandTerrain(w.terrain[k]!) ? surfaceHeight(true, w.elevation[k]!) : 0;
        if (coverAt(w, x + 0.5, y + 0.5, base) > 8) continue;
        if (!isLandTerrain(w.terrain[k]!)) {
          if (deco?.kind === "sea_rock" || deco?.kind === "sea_arch")
            add(decorSprite("temperate", deco), sx, sy);
        } else if (occupancy[k] === 0) {
          const h = surfaceHeight(true, w.elevation[k]!);
          const j = tileJitter(x, y, 1.3);
          if (deco) add(decorSprite(biomeOfTile(w, x, y), deco), sx + j.dx, sy - h + j.dy);
          if (rock) add(rock.sprite, sx + rock.dx, sy - h + rock.dy);
        }
      }
    }
    if (!chunk.view) {
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
      chunk.view = { sprite, texture };
    }
    chunk.view.sprite.visible = true;
    this.renderer.render({
      container: tmp,
      target: chunk.view.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    tmp.destroy({ children: true });
    groundTexture?.destroy(true);
  }
}

import {
  SHIP,
  VILLAGER,
  HALF_H,
  HALF_W,
  isLandTerrain,
  surfaceHeight,
  tileIndex,
  TICK_SECONDS,
  type BuildingEntity,
  type Entity,
  type GameState,
  type NodeEntity,
  type ShipEntity,
  type VillagerEntity,
} from "@explorer/shared";
import { Container, Graphics, Sprite, type Rectangle } from "pixi.js";
import type { Atlas } from "../assets";
import {
  buildingSprite,
  markerSprite,
  nodeSprite,
  scaffoldSprite,
  tileJitter,
  villagerSprite,
} from "./names";

const INTERP_MS = TICK_SECONDS * 1000;
/** Pier decks sit a few pixels above the water. */
const DECK_PX = 5;

function tileHeight(state: GameState, x: number, y: number): number {
  const w = state.world;
  const tx = Math.min(w.width - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(w.height - 1, Math.max(0, Math.floor(y)));
  const k = tileIndex(w, tx, ty);
  const land = isLandTerrain(w.terrain[k]!);
  if (!land) {
    const e = state.entities.get(state.occupancy[k]!);
    if (e?.type === "building" && e.kind === "dock") return DECK_PX;
  }
  return surfaceHeight(land, w.elevation[k]!);
}

const screenX = (x: number, y: number) => (x - y) * HALF_W;
const screenY = (x: number, y: number) => (x + y) * HALF_H;

interface Smoke {
  sprite: Sprite;
  age: number;
  life: number;
  x: number;
  y: number;
}

abstract class View {
  abstract readonly root: Container;
  abstract update(e: Entity, now: number): void;
  frame(_now: number, _dt: number): void {}
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

class BuildingView extends View {
  readonly root = new Container();
  rect = { x: 0, y: 0, w: 0, h: 0 };
  kind = "";
  private main: Sprite | null = null;
  private scaffold: Sprite | null = null;
  private bar = new Graphics();
  private key = "";
  smokeAt: { x: number; y: number }[] = [];
  sparkleAt: { x: number; y: number }[] = [];
  private smokeTimer = 0;
  private sparkleTimer = 0;

  constructor(
    private readonly layer: EntityLayer,
    readonly flat: boolean,
  ) {
    super();
    this.root.addChild(this.bar);
  }

  update(e: Entity): void {
    const b = e as BuildingEntity;
    const state = this.layer.state;
    const h = tileHeight(state, b.x, b.y);
    this.rect = { x: b.x, y: b.y, w: b.w, h: b.h };
    this.kind = b.kind;
    const tribe = state.world.tribe;
    const key = `${buildingSprite(b, tribe)}|${b.complete}|${b.dir ?? ""}`;
    if (key !== this.key) {
      this.key = key;
      for (const c of [...this.root.children]) if (c !== this.bar) c.destroy();
      this.main = null;
      this.scaffold = null;
      if (b.kind === "dock") {
        this.buildDock(b);
      } else if (b.kind === "path") {
        // A finished path is painted into the ground by the terrain; only the plan is a sprite.
        if (!b.complete) {
          const s = this.layer.atlas.sprite("t_path");
          s.alpha = 0.45;
          this.root.addChildAt(s, 0);
        }
      } else {
        const name = buildingSprite(b, tribe);
        this.main = this.layer.atlas.sprite(name);
        this.root.addChildAt(this.main, 0);
        if (!b.complete) {
          this.main.alpha = 0.3;
          this.scaffold = this.layer.atlas.sprite(scaffoldSprite(b.w, b.h));
          this.root.addChild(this.scaffold);
        }
        const meta = this.layer.atlas.meta[name];
        this.smokeAt = b.complete && meta?.smoke ? meta.smoke : [];
        this.sparkleAt = b.complete && meta?.sparkle ? meta.sparkle : [];
      }
    }
    this.root.position.set(screenX(b.x, b.y), screenY(b.x, b.y) - h);
    this.root.zIndex = this.flat ? -1e6 + b.x + b.y : b.x + b.y + b.w + b.h - 1;
    // Progress bar for construction or a production queue.
    this.bar.clear();
    const job = b.queue[0];
    const total = job?.what === "ship" ? SHIP.buildSeconds : VILLAGER.trainSeconds;
    const progress = !b.complete ? b.progress : job ? 1 - job.remaining / total : null;
    if (progress !== null && b.kind !== "path") {
      const cx = screenX(b.w / 2, b.h / 2);
      const top = -((this.main?.height ?? 24) * (this.main?.anchor.y ?? 1)) - 6;
      this.bar
        .rect(cx - 13, top, 26, 5)
        .fill({ color: 0x1b1a1f })
        .rect(cx - 12, top + 1, Math.max(0, Math.min(1, progress)) * 24, 3)
        .fill({ color: b.complete ? 0xe2a841 : 0x8fae45 });
    }
  }

  private buildDock(b: BuildingEntity): void {
    const alongX = b.dir === "+x" || b.dir === "-x";
    for (let ty = 0; ty < b.h; ty++) {
      for (let tx = 0; tx < b.w; tx++) {
        const end =
          (b.dir === "+x" && tx === b.w - 1) ||
          (b.dir === "-x" && tx === 0) ||
          (b.dir === "+y" && ty === b.h - 1) ||
          (b.dir === "-y" && ty === 0);
        const s = this.layer.atlas.sprite(`dock_${alongX ? "x" : "y"}${end ? "_end" : ""}`);
        s.position.set(screenX(tx, ty), screenY(tx, ty));
        this.root.addChildAt(s, 0);
      }
    }
  }

  override frame(now: number, dt: number): void {
    if (!this.root.visible) return;
    if (this.smokeAt.length > 0) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.7 + Math.random() * 0.5;
        for (const p of this.smokeAt) this.layer.puff(this.root.x + p.x, this.root.y + p.y, now);
      }
    }
    if (this.sparkleAt.length > 0) {
      this.sparkleTimer -= dt;
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = 0.25 + Math.random() * 0.3;
        for (const p of this.sparkleAt)
          this.layer.sparkle(
            this.root.x + p.x + (Math.random() - 0.5) * 14,
            this.root.y + p.y + (Math.random() - 0.5) * 10,
            now,
          );
      }
    }
  }
}

class NodeView extends View {
  readonly root = new Container();
  private sprite: Sprite | null = null;
  private marker: Sprite | null = null;
  private name = "";

  constructor(private readonly layer: EntityLayer) {
    super();
  }

  update(e: Entity): void {
    const n = e as NodeEntity;
    const name = nodeSprite(n);
    if (name !== this.name) {
      this.sprite?.destroy();
      this.sprite = this.layer.atlas.sprite(name);
      this.root.addChildAt(this.sprite, 0);
      this.name = name;
    }
    if (n.marked && !this.marker) {
      this.marker = this.layer.atlas.sprite(markerSprite(n));
      this.root.addChild(this.marker);
    } else if (!n.marked && this.marker) {
      this.marker.destroy();
      this.marker = null;
    }
    if (this.marker) this.marker.y = -this.sprite!.height * this.sprite!.anchor.y + HALF_H - 2;
    const h = tileHeight(this.layer.state, n.x, n.y);
    const j = tileJitter(n.x, n.y);
    this.root.position.set(screenX(n.x, n.y) + j.dx, screenY(n.x, n.y) - h + j.dy);
    this.root.zIndex = n.x + n.y + 1;
    this.root.visible =
      this.layer.state.explored[tileIndex(this.layer.state.world, n.x, n.y)] === 1;
  }

  override frame(now: number): void {
    if (this.marker && this.sprite) {
      const base = -this.sprite.height * this.sprite.anchor.y + HALF_H - 2;
      this.marker.y = base + Math.round(Math.sin(now / 300) * 1.5);
    }
  }
}

/** Villagers and ships move every tick: interpolate between the last two known positions. */
abstract class MovingView extends View {
  protected fromX = 0;
  protected fromY = 0;
  protected toX = 0;
  protected toY = 0;
  protected since = 0;
  protected moving = false;
  x = 0;
  y = 0;

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

class VillagerView extends MovingView {
  readonly root = new Container();
  private body: Sprite;
  private carry: Sprite | null = null;
  private carryName = "";
  private v: VillagerEntity | null = null;
  private height = 0;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.body = layer.atlas.sprite(villagerSprite(layer.state.world.tribe, 0, false, "stand"));
    this.root.addChild(this.body);
  }

  update(e: Entity, now: number): void {
    const v = e as VillagerEntity;
    // Villagers at sea ride inside the ship.
    this.root.visible = v.aboard === null;
    const boarding = this.v !== null && this.v.aboard !== v.aboard;
    this.track(v.x, v.y, now, this.v === null || boarding);
    if (this.v === null) this.height = tileHeight(this.layer.state, v.x, v.y);
    this.v = v;
    const carryName = v.carrying ? `carry_${v.carrying.resource}` : "";
    if (carryName !== this.carryName) {
      this.carry?.destroy();
      this.carry = carryName ? this.layer.atlas.sprite(carryName) : null;
      if (this.carry) {
        this.carry.y = -21;
        this.root.addChild(this.carry);
      }
      this.carryName = carryName;
    }
  }

  override frame(now: number, dt: number): void {
    const v = this.v;
    if (!v) return;
    this.interpolate(now);
    const targetH = tileHeight(this.layer.state, this.x, this.y);
    this.height +=
      Math.sign(targetH - this.height) * Math.min(Math.abs(targetH - this.height), dt * 48);
    let pose = "stand";
    const phase = Math.floor(now / 160 + v.id) % 2;
    if (this.moving) pose = phase ? "walk0" : "walk1";
    else if (v.action === "work") {
      const beat = Math.floor(now / 380 + v.id * 0.37) % 2;
      pose = v.tool ? `work${beat}_${v.tool}` : beat ? "walk0" : "stand";
    }
    const back = v.facing === 2 || v.facing === 3;
    const flip = v.facing === 1 || v.facing === 2;
    const name = villagerSprite(this.layer.state.world.tribe, v.tunic, back, pose);
    const tex = this.layer.atlas.texture(name);
    if (this.body.texture !== tex) {
      this.body.texture = tex;
      this.layer.atlas.anchor(this.body, name);
    }
    this.body.scale.x = flip ? -1 : 1;
    if (this.carry) this.carry.y = -21 + (this.moving ? phase : 0);
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y) - this.height),
    );
    this.root.zIndex = this.x + this.y + 0.01;
  }
}

class ShipView extends MovingView {
  readonly root = new Container();
  private sprite: Sprite;
  private s: ShipEntity | null = null;
  private wakeTimer = 0;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.sprite = layer.atlas.sprite("ship_0");
    this.root.addChild(this.sprite);
  }

  update(e: Entity, now: number): void {
    const s = e as ShipEntity;
    this.track(s.x, s.y, now, this.s === null);
    this.s = s;
    const name = `ship_${s.heading % 8}`;
    this.sprite.texture = this.layer.atlas.texture(name);
    this.layer.atlas.anchor(this.sprite, name);
  }

  override frame(now: number, dt: number): void {
    if (!this.s) return;
    this.interpolate(now);
    const bob = Math.round(Math.sin(now / 520 + this.s.id) * 1);
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y)) + bob,
    );
    this.root.zIndex = this.x + this.y;
    if (this.moving) {
      this.wakeTimer -= dt;
      if (this.wakeTimer <= 0) {
        this.wakeTimer = 0.12;
        this.layer.sparkle(
          this.root.x + (Math.random() - 0.5) * 16,
          this.root.y + 4 + Math.random() * 6,
          now,
        );
      }
    }
  }
}

interface Sparkle {
  sprite: Sprite;
  age: number;
}

export class EntityLayer {
  /** Flat things (paths, piers) under everything else. */
  readonly ground = new Container({ sortableChildren: true });
  /** Depth-sorted buildings, trees, villagers and ships. */
  readonly container = new Container({ sortableChildren: true });
  readonly effects = new Container();
  private views = new Map<number, View>();
  private smoke: Smoke[] = [];
  private sparkles: Sparkle[] = [];

  constructor(
    readonly atlas: Atlas,
    public state: GameState,
    /** Buildings hide terrain decoration, so the terrain redraws under them on add/remove. */
    private readonly onFootprintChange: (rect: {
      x: number;
      y: number;
      w: number;
      h: number;
    }) => void,
    /** Finished paths are painted into the terrain, so it repaints when they change. */
    private readonly onPathsChange: () => void,
  ) {}

  rebuild(state: GameState): void {
    this.state = state;
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.sync([...state.entities.keys()], [], performance.now());
  }

  view(id: number): View | undefined {
    return this.views.get(id);
  }

  position(id: number): { x: number; y: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.root.x, y: v.root.y } : null;
  }

  sync(changed: Iterable<number>, removed: Iterable<number>, now: number): void {
    let paths = false;
    for (const id of removed) {
      const v = this.views.get(id);
      if (!v) continue;
      if (v instanceof BuildingView) {
        this.onFootprintChange(v.rect);
        if (v.kind === "path") paths = true;
      }
      v.destroy();
      this.views.delete(id);
    }
    for (const id of changed) {
      const e = this.state.entities.get(id);
      if (!e) continue;
      let v = this.views.get(id);
      const isNew = !v;
      if (!v) {
        v = this.create(e);
        this.views.set(id, v);
        const flat = v instanceof BuildingView && v.flat;
        (flat ? this.ground : this.container).addChild(v.root);
      }
      v.update(e, now);
      if (e.type === "building" && isNew) this.onFootprintChange(e);
      if (e.type === "building" && e.kind === "path") paths = true;
    }
    if (paths) this.onPathsChange();
  }

  /** Re-check visibility of nodes on newly explored tiles. */
  revealed(tiles: number[]): void {
    const set = new Set(tiles);
    for (const [id, v] of this.views) {
      if (!(v instanceof NodeView)) continue;
      const e = this.state.entities.get(id) as NodeEntity | undefined;
      if (e && set.has(tileIndex(this.state.world, e.x, e.y))) v.root.visible = true;
    }
  }

  private create(e: Entity): View {
    switch (e.type) {
      case "building":
        return new BuildingView(this, e.kind === "path" || e.kind === "dock");
      case "node":
        return new NodeView(this);
      case "villager":
        return new VillagerView(this);
      case "ship":
        return new ShipView(this);
    }
  }

  frame(now: number, dt: number, view: Rectangle): void {
    for (const v of this.views.values()) {
      const r = v.root;
      const onScreen =
        r.x > view.left - 64 &&
        r.x < view.right + 64 &&
        r.y > view.top - 32 &&
        r.y < view.bottom + 96;
      if (v instanceof VillagerView || v instanceof ShipView || onScreen) v.frame(now, dt);
    }
    // Chimney smoke rises, drifts and fades.
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i]!;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.destroy();
        this.smoke.splice(i, 1);
        continue;
      }
      const frame = Math.min(3, Math.floor(t * 4));
      const name = `smoke_${frame}`;
      p.sprite.texture = this.atlas.texture(name);
      this.atlas.anchor(p.sprite, name);
      p.sprite.position.set(Math.round(p.x + t * 10), Math.round(p.y - t * 22));
      p.sprite.alpha = 0.9 * (1 - t * 0.6);
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i]!;
      s.age += dt;
      if (s.age > 0.6) {
        s.sprite.destroy();
        this.sparkles.splice(i, 1);
        continue;
      }
      const name = `sparkle_${Math.min(2, Math.floor((s.age / 0.6) * 3))}`;
      s.sprite.texture = this.atlas.texture(name);
    }
  }

  puff(x: number, y: number, _now: number): void {
    if (this.smoke.length > 80) return;
    const sprite = this.atlas.sprite("smoke_0");
    sprite.position.set(x, y);
    this.effects.addChild(sprite);
    this.smoke.push({ sprite, age: 0, life: 2.4 + Math.random() * 0.6, x, y });
  }

  sparkle(x: number, y: number, _now: number): void {
    if (this.sparkles.length > 60) return;
    const sprite = this.atlas.sprite("sparkle_0");
    sprite.position.set(Math.round(x), Math.round(y));
    this.effects.addChild(sprite);
    this.sparkles.push({ sprite, age: 0 });
  }

  /** Occasional glints on open water inside the view. */
  ambientSparkles(view: Rectangle, dt: number): void {
    const w = this.state.world;
    const expected = dt * 6;
    let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    while (n-- > 0) {
      const sx = view.x + Math.random() * view.width;
      const sy = view.y + Math.random() * view.height;
      const wx = Math.floor((sx / HALF_W + sy / HALF_H) / 2);
      const wy = Math.floor((sy / HALF_H - sx / HALF_W) / 2);
      if (wx < 0 || wy < 0 || wx >= w.width || wy >= w.height) continue;
      const k = tileIndex(w, wx, wy);
      if (isLandTerrain(w.terrain[k]!) || !this.state.explored[k]) continue;
      this.sparkle(sx, sy, 0);
    }
  }
}

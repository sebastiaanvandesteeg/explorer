import {
  HALF_H,
  HALF_W,
  isLandTerrain,
  tileIndex,
  type Entity,
  type GameState,
  type NodeEntity,
} from "@explorer/shared";
import { Container, Graphics, Sprite, type Rectangle } from "pixi.js";
import { Atlas } from "../../assets";
import { type Smoke, View, screenX, screenY } from "./base";
import { BuildingView } from "./building";
import { ItemView, NodeView, SiteView, WreckView } from "./resources";
import { HeroView, VillagerView } from "./people";
import { PirateView, ShipView } from "./ships";
import { StormView } from "./storm";

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
  /** Foam and ripples on the water: under the ships, above the sea and shore. */
  readonly wakes = new Container();
  private foams: {
    sprite: Sprite;
    age: number;
    life: number;
    vx: number;
    vy: number;
    s0: number;
    s1: number;
    peak: number;
  }[] = [];
  /** Night glows: drawn by the game above the colour grade, so darkness cannot dim them. */
  readonly lights = new Container();
  /** 0 by day up to 1 at midnight. */
  night = 0;
  /** The colour of a player (0xRRGGBB), for their character's cape; the game fills this in. */
  playerColour: (playerId: string) => number = () => 0xffffff;
  private views = new Map<number, View>();
  private smoke: Smoke[] = [];
  private sparkles: Sparkle[] = [];
  private bolts: { g: Graphics; age: number }[] = [];

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
    /** Paths, fields and yards are painted into the terrain, so it repaints when buildings change. */
    private readonly onBuildingsChange: () => void,
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
    const e = this.state.entities.get(id);
    if (e?.type === "character" && e.aboard !== null) {
      const ship = this.views.get(e.aboard);
      const spot = ship instanceof ShipView ? ship.spots.get(id) : undefined;
      if (spot) return spot;
    }
    const v = this.views.get(id);
    return v ? { x: v.root.x, y: v.root.y } : null;
  }

  sync(changed: Iterable<number>, removed: Iterable<number>, now: number): void {
    let buildings = false;
    for (const id of removed) {
      const v = this.views.get(id);
      if (!v) continue;
      if (v instanceof BuildingView) {
        this.onFootprintChange(v.rect);
        buildings = true;
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
        (v.overhead ? this.effects : v.flat ? this.ground : this.container).addChild(v.root);
      }
      v.update(e, now);
      if (e.type === "building" && isNew) this.onFootprintChange(e);
      if (e.type === "building") buildings = true;
    }
    if (buildings) this.onBuildingsChange();
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
      case "character":
        return new HeroView(this);
      case "ship":
        return new ShipView(this);
      case "pirate":
        return new PirateView(this);
      case "wreck":
        return new WreckView(this);
      case "site":
        return new SiteView(this);
      case "storm":
        return new StormView(this);
      case "item":
        return new ItemView(this);
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
      // Big or fast things are always kept up to date; the rest only while they are on screen.
      if (
        v instanceof VillagerView ||
        v instanceof HeroView ||
        v instanceof ShipView ||
        v instanceof PirateView ||
        v instanceof StormView ||
        onScreen
      )
        v.frame(now, dt);
    }
    // Foam spreads out, drifts and fades.
    for (let i = this.foams.length - 1; i >= 0; i--) {
      const f = this.foams[i]!;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.sprite.destroy();
        this.foams.splice(i, 1);
        continue;
      }
      f.sprite.x += f.vx * dt;
      f.sprite.y += f.vy * dt;
      f.sprite.scale.set(f.s0 + (f.s1 - f.s0) * t);
      f.sprite.alpha = f.peak * Math.min(1, t * 8) * (1 - t);
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
      this.atlas.setFrame(p.sprite, name);
      p.sprite.position.set(Math.round(p.x + t * 10), Math.round(p.y - t * 22));
      p.sprite.alpha = 0.9 * (1 - t * 0.6);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.age += dt;
      b.g.alpha = Math.max(0, 1 - b.age / 0.3);
      if (b.age > 0.3) {
        b.g.destroy();
        this.bolts.splice(i, 1);
      }
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

  /** A cannon shot: smoke at the muzzle and sparks where it lands. Bolts are drawn as lightning. */
  shot(
    kind: "cannon" | "bolt",
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    const fx = screenX(from.x, from.y);
    const fy = screenY(from.x, from.y) - 10;
    const tx = screenX(to.x, to.y);
    const ty = screenY(to.x, to.y) - 6;
    if (kind === "bolt") {
      const g = new Graphics();
      let x = tx;
      let y = ty - 90;
      g.moveTo(x, y);
      for (let i = 0; i < 6; i++) {
        x = tx + (Math.random() - 0.5) * 14 * (1 - i / 6);
        y += 15;
        g.lineTo(x, y);
      }
      g.stroke({ color: 0xf4eeff, width: 3 }).stroke({ color: 0xa48cf0, width: 1, alpha: 0.8 });
      this.effects.addChild(g);
      this.bolts.push({ g, age: 0 });
      for (let i = 0; i < 4; i++)
        this.sparkle(tx + (Math.random() - 0.5) * 20, ty + Math.random() * 8, 0);
      return;
    }
    this.puff(fx, fy, 0);
    for (let i = 0; i < 3; i++)
      this.sparkle(tx + (Math.random() - 0.5) * 14, ty + (Math.random() - 0.5) * 8, 0);
  }

  /** A puff of foam that spreads and fades; `kind` 0 to 2 picks a small, medium or large blob. */
  foam(
    x: number,
    y: number,
    kind: 0 | 1 | 2,
    vx: number,
    vy: number,
    life: number,
    peak: number,
    spread: number,
  ): void {
    if (this.foams.length > 220) return;
    const sprite = this.atlas.sprite(`wake_foam_${kind}`);
    sprite.position.set(x, y);
    sprite.alpha = 0;
    this.wakes.addChild(sprite);
    this.foams.push({ sprite, age: 0, life, vx, vy, s0: 0.7, s1: spread, peak });
  }

  /** A slow ring spreading over still water. */
  ring(x: number, y: number, life: number, scale: number): void {
    if (this.foams.length > 220) return;
    const sprite = this.atlas.sprite("wake_ring");
    sprite.position.set(x, y);
    sprite.alpha = 0;
    this.wakes.addChild(sprite);
    this.foams.push({
      sprite,
      age: 0,
      life,
      vx: 0,
      vy: 0,
      s0: 0.35 * scale,
      s1: scale,
      peak: 0.35,
    });
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

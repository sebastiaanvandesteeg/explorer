import {
  hash2d,
  PATROL,
  CARGO,
  SHIP,
  VILLAGER,
  isLandTerrain,
  tileIndex,
  type BuildingEntity,
  type Entity,
} from "@explorer/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import { coverAlpha, coverAt } from "../occlusion";
import { buildingSprite, scaffoldSprite } from "../names";
import { View, beamTexture, glowTexture, screenX, screenY, tileHeight } from "./base";
import type { EntityLayer } from "./layer";

export class BuildingView extends View {
  readonly root = new Container();
  rect = { x: 0, y: 0, w: 0, h: 0 };
  kind = "";
  private main: Sprite | null = null;
  private scaffold: Sprite | null = null;
  private bar = new Graphics();
  private key = "";
  smokeAt: { x: number; y: number }[] = [];
  sparkleAt: { x: number; y: number }[] = [];
  private lightAt: { x: number; y: number; r: number }[] = [];
  private lights: Sprite[] = [];
  /** A lighthouse's sweeping beam: two opposite wedges, squashed into the isometric view. */
  private beam: Container | null = null;
  private beamSweep: Container | null = null;
  private beamAt: { x: number; y: number } | null = null;
  private smokeTimer = 0;
  private sparkleTimer = 0;
  /** Things standing on a pier: they sort with people and ships, so they live in the main layer. */
  private props: Sprite[] = [];

  constructor(
    private readonly layer: EntityLayer,
    override readonly flat: boolean,
  ) {
    super();
    this.root.addChild(this.bar);
  }

  update(e: Entity): void {
    const b = e as BuildingEntity;
    const state = this.layer.state;
    // Piers and harbours standing in the water have their deck baked into the art: no lifting.
    const inWater =
      (b.kind === "dock" || b.kind === "harbour") &&
      !isLandTerrain(state.world.terrain[tileIndex(state.world, b.x, b.y)]!);
    const h = inWater ? 0 : tileHeight(state, b.x, b.y);
    this.rect = { x: b.x, y: b.y, w: b.w, h: b.h };
    this.kind = b.kind;
    const tribe = state.world.tribe;
    const up = state.upgrades;
    const pierLook =
      b.kind === "dock" && b.harbour !== undefined
        ? `|${b.w}x${b.h}|${up.has("quay") ? 1 : 0}${up.has("grand_pier") ? 1 : 0}${up.has("cannons") ? 1 : 0}${up.has("iron_hulls") ? 1 : 0}`
        : "";
    const key = `${buildingSprite(b, tribe)}|${b.complete}|${b.dir ?? ""}${pierLook}`;
    if (key !== this.key) {
      this.key = key;
      for (const c of [...this.root.children]) if (c !== this.bar) c.destroy();
      for (const p of this.props) p.destroy();
      this.props = [];
      this.main = null;
      this.scaffold = null;
      if (b.kind === "dock" && b.harbour !== undefined) {
        this.buildPier(b);
      } else if (b.kind === "dock") {
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
        this.setLights(b.complete && meta?.lights ? meta.lights : []);
        this.setBeam(b.complete && meta?.beam ? (meta.beam[0] ?? null) : null);
      }
    }
    this.root.position.set(screenX(b.x, b.y), screenY(b.x, b.y) - h);
    this.root.zIndex = this.flat ? -1e6 + b.x + b.y : b.x + b.y + b.w + b.h - 1;
    // Behind a cliff or hill in front of it, a building shows as a ghost instead of overlapping it.
    if (!this.flat)
      this.root.alpha = coverAlpha(coverAt(state.world, b.x + b.w - 0.5, b.y + b.h - 0.5, h));
    // Progress bar for construction or a production queue.
    this.bar.clear();
    const job = b.queue[0];
    const total =
      job?.what === "ship"
        ? SHIP.buildSeconds
        : job?.what === "cargo"
          ? CARGO.buildSeconds
          : job?.what === "patrol"
            ? PATROL.buildSeconds
            : VILLAGER.trainSeconds;
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

  /** Windows and fires shine at night: soft additive glows drawn above the colour grade. */
  private setLights(lights: { x: number; y: number; r: number }[]): void {
    for (const l of this.lights) l.destroy();
    this.lightAt = lights;
    this.lights = lights.map(() => {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      this.layer.lights.addChild(s);
      return s;
    });
  }

  private setBeam(at: { x: number; y: number } | null): void {
    this.beam?.destroy({ children: true });
    this.beam = null;
    this.beamSweep = null;
    this.beamAt = at;
    if (!at) return;
    const sweep = new Container();
    for (const angle of [0, Math.PI]) {
      const wedge = new Sprite(beamTexture());
      wedge.anchor.set(0, 0.5);
      wedge.rotation = angle;
      wedge.blendMode = "add";
      sweep.addChild(wedge);
    }
    const beam = new Container();
    // A beam sweeping level around a tower looks like an ellipse from the isometric camera.
    beam.scale.y = 0.5;
    beam.addChild(sweep);
    this.layer.lights.addChild(beam);
    this.beam = beam;
    this.beamSweep = sweep;
  }

  override destroy(): void {
    for (const p of this.props) p.destroy();
    for (const l of this.lights) l.destroy();
    this.beam?.destroy({ children: true });
    super.destroy();
  }

  private shine(now: number): void {
    const night = this.layer.night;
    if (this.beam && this.beamSweep && this.beamAt) {
      this.beam.visible = night > 0.02 && this.root.visible;
      this.beam.position.set(this.root.x + this.beamAt.x, this.root.y + this.beamAt.y);
      this.beamSweep.rotation = now / 2400;
      this.beam.alpha = Math.min(1, night * 1.1);
    }
    this.lights.forEach((s, i) => {
      const at = this.lightAt[i]!;
      s.visible = night > 0.02 && this.root.visible;
      if (!s.visible) return;
      s.position.set(this.root.x + at.x, this.root.y + at.y);
      s.scale.set((at.r * (this.kind === "lighthouse" ? 3 : 2.4)) / 64);
      // A gentle flicker, out of step from window to window.
      // The lantern room is six overlapping glows: keep them gentler than a window's.
      const gain = this.kind === "lighthouse" ? 0.4 : 1;
      s.alpha = night * gain * (0.62 + 0.14 * Math.sin(now / 230 + i * 2.1 + this.root.x));
    });
  }

  /**
   * A harbour's pier: plank tiles with rails along the outer edges, and, along the edges only (so
   * the middle stays clear to walk on), what the harbour upgrades bring: crates and barrels with
   * the Stone Quay, warehouse stacks with the Grand Pier, cannons, ingots and lamps.
   */
  private buildPier(b: BuildingEntity): void {
    const state = this.layer.state;
    const up = state.upgrades;
    const dir = b.dir ?? "+x";
    const axisX = dir === "+x" || dir === "-x";
    const length = axisX ? b.w : b.h;
    const width = axisX ? b.h : b.w;
    const tier = up.has("grand_pier") ? 2 : up.has("quay") ? 1 : 0;
    // One continuous picture of the whole pier (older, odd-sized ones keep the plain tiles).
    const whole = `pier_${axisX ? "x" : "y"}_${length}`;
    if (width === 3 && this.layer.atlas.has(whole)) {
      this.root.addChildAt(this.layer.atlas.sprite(whole), 0);
    } else {
      this.buildDock(b);
    }
    const side = (across: number): "+x" | "-x" | "+y" | "-y" => {
      // The edge with the lower across index looks towards -across.
      const low = across === 0;
      return axisX ? (low ? "-y" : "+y") : low ? "-x" : "+x";
    };
    for (let ty = 0; ty < b.h; ty++) {
      for (let tx = 0; tx < b.w; tx++) {
        const along =
          dir === "+x" ? tx : dir === "-x" ? b.w - 1 - tx : dir === "+y" ? ty : b.h - 1 - ty;
        const across = axisX ? ty : tx;
        const edge = across === 0 || across === width - 1;
        const end = along === length - 1;
        if (!edge || along === 0) continue;
        const r = hash2d(b.x + tx, b.y + ty, 71);
        let prop: string | null = null;
        if (up.has("cannons") && along % 2 === 0 && !end) prop = `pier_p_cannon_${side(across)}`;
        else if (end && across === 0 && tier > 0) prop = "pier_p_lamp";
        else if (tier === 2 && r < 0.45) prop = "pier_p_stack";
        else if (tier >= 1 && r < 0.3) prop = r < 0.15 ? "pier_p_crates" : "pier_p_barrels";
        else if (tier >= 1 && r < 0.45)
          prop = up.has("iron_hulls") ? "pier_p_ingots" : "pier_p_crate";
        else if (r > 0.92) prop = "pier_p_coil";
        if (!prop) continue;
        const sprite = this.layer.atlas.sprite(prop);
        const wx = b.x + tx;
        const wy = b.y + ty;
        sprite.position.set(screenX(wx, wy), screenY(wx, wy));
        sprite.zIndex = wx + wy + 0.6;
        this.layer.container.addChild(sprite);
        this.props.push(sprite);
      }
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
    if (this.lights.length > 0 || this.beam) this.shine(now);
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

import {
  HALF_H,
  tileIndex,
  type Entity,
  type NodeEntity,
  type SiteEntity,
  type WreckEntity,
  type ItemEntity,
  ITEMS,
} from "@explorer/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import { coverAlpha, coverAt } from "../occlusion";
import { markerSprite, nodeSprite, tileJitter } from "../names";
import { View, screenX, screenY, tileHeight } from "./base";
import type { EntityLayer } from "./layer";

export class NodeView extends View {
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
    this.root.alpha = coverAlpha(coverAt(this.layer.state.world, n.x + 0.5, n.y + 0.5, h));
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

/** A shipwreck bobbing at sea or bones on the sand. */
export class WreckView extends View {
  readonly root = new Container();
  private sprite: Sprite | null = null;
  private w: WreckEntity | null = null;

  constructor(private readonly layer: EntityLayer) {
    super();
  }

  update(e: Entity): void {
    const w = e as WreckEntity;
    this.w = w;
    const name = w.kind === "skeleton" ? "wreck_bones" : `wreck_ship_${w.variant % 2}`;
    if (!this.sprite) {
      this.sprite = this.layer.atlas.sprite(name);
      this.root.addChild(this.sprite);
    }
    const state = this.layer.state;
    if (w.kind === "skeleton") {
      const h = tileHeight(state, w.x, w.y);
      this.root.position.set(screenX(w.x, w.y), screenY(w.x, w.y) - h);
      this.root.zIndex = w.x + w.y + 0.5;
      this.root.alpha = coverAlpha(coverAt(state.world, w.x + 0.5, w.y + 0.5, h));
    } else {
      this.root.zIndex = w.x + w.y + 0.5;
    }
    this.root.visible = state.explored[tileIndex(state.world, w.x, w.y)] === 1;
  }

  override frame(now: number): void {
    const w = this.w;
    if (!w || w.kind === "skeleton") return;
    // A shipwreck rocks gently on the swell.
    this.root.position.set(
      Math.round(screenX(w.x + 0.5, w.y + 0.5)),
      Math.round(screenY(w.x + 0.5, w.y + 0.5) + Math.sin(now / 900 + w.id) * 1.2),
    );
  }
}

/** Sunken ruins seen through the water: only once a ship has sailed over them. */
export class SiteView extends View {
  readonly root = new Container();
  override readonly flat = true;
  private sprite: Sprite | null = null;

  constructor(private readonly layer: EntityLayer) {
    super();
  }

  update(e: Entity): void {
    const site = e as SiteEntity;
    const name = site.kind === "fortress" ? "site_fortress" : "site_ruin";
    if (!this.sprite) {
      this.sprite = this.layer.atlas.sprite(name);
      this.sprite.tint = 0x7fc4c8;
      this.sprite.alpha = 0.55;
      this.root.addChild(this.sprite);
    }
    const o = site.kind === "fortress" ? 0.5 : 0;
    this.root.position.set(screenX(site.x - o, site.y - o), screenY(site.x - o, site.y - o));
    this.root.zIndex = -1e6 + site.x + site.y;
    this.root.visible =
      site.found &&
      this.layer.state.explored[tileIndex(this.layer.state.world, site.x, site.y)] === 1;
    // Emptied sites fade further into the deep.
    this.sprite.alpha = Object.values(site.loot).some((n) => (n ?? 0) > 0) ? 0.6 : 0.3;
  }

  override frame(now: number): void {
    if (this.sprite && this.root.visible)
      this.sprite.y = Math.round(Math.sin(now / 1100 + this.root.x) * 1.5);
  }
}

/** Something lying on the ground: a small gem-like token in the item's colours, bobbing gently. */
export class ItemView extends View {
  readonly root = new Container();
  private readonly shadow = new Graphics();
  private readonly gem = new Graphics();
  private kind: string | null = null;
  private rare = false;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.root.addChild(this.shadow, this.gem);
    this.gem.scale.set(0.8);
    this.shadow.ellipse(0, 0, 6, 3).fill({ color: 0x000000, alpha: 0.3 });
  }

  update(e: Entity): void {
    const it = e as ItemEntity;
    const state = this.layer.state;
    if (this.kind !== it.kind) {
      this.kind = it.kind;
      const def = ITEMS[it.kind];
      const [body, light] = def.colour;
      this.rare = def.rarity !== "common";
      const g = this.gem.clear();
      // A faceted diamond with a pale top-left facet.
      g.poly([0, -12, 6, -6, 0, 0, -6, -6]).fill(body).stroke({ color: 0x1b1a1f, width: 1 });
      g.poly([0, -12, -6, -6, 0, -6]).fill(light);
      if (def.rarity === "rare") g.circle(0, -6, 9).stroke({ color: light, width: 1, alpha: 0.5 });
    }
    const x = it.x + 0.5;
    const y = it.y + 0.5;
    const h = tileHeight(state, it.x, it.y);
    this.root.position.set(Math.round(screenX(x, y)), Math.round(screenY(x, y) - h));
    this.root.zIndex = it.x + it.y + 0.6;
    this.root.alpha = coverAlpha(coverAt(state.world, x, y, h));
    this.root.visible = state.explored[tileIndex(state.world, it.x, it.y)] === 1;
  }

  override frame(now: number): void {
    const bob = Math.sin(now / 500 + this.root.x * 0.13) * (this.rare ? 1.6 : 1);
    this.gem.y = Math.round(bob) - 2;
  }
}

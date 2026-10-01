import { type Entity, type CharacterEntity, type Walker } from "@explorer/shared";
import { Container, Sprite } from "pixi.js";
import { HeroRig } from "../heroRig";
import { villagerSprite } from "../names";
import { MovingView, screenX, screenY, tileHeight } from "./base";
import type { EntityLayer } from "./layer";

/** Villagers and player characters look the same: a person on foot. */
export class VillagerView extends MovingView {
  readonly root = new Container();
  private body: Sprite;
  private carry: Sprite | null = null;
  private carryName = "";
  private v: Walker | null = null;
  private height = 0;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.body = layer.atlas.sprite(villagerSprite(layer.state.world.tribe, 0, false, "stand"));
    this.root.addChild(this.body);
  }

  update(e: Entity, now: number): void {
    const v = e as Entity & Walker;
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
    const k = 1 / this.layer.atlas.res(name);
    this.body.scale.set(flip ? -k : k, k);
    if (this.carry) this.carry.y = -21 + (this.moving ? phase : 0);
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y) - this.height),
    );
    this.root.zIndex = this.x + this.y + 0.01;
    this.root.alpha = this.fadeBehindTerrain(this.layer.state.world, this.height, dt);
  }
}

/**
 * A player's character: a quarter larger than the villagers so it stands out, with a cape and
 * sash in the player's colour (the greyscale cape layers multiplied by it).
 */
export class HeroView extends MovingView {
  readonly root = new Container();
  private readonly rig: HeroRig;
  private c: CharacterEntity | null = null;
  private height = 0;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.rig = new HeroRig(layer.atlas);
    this.root.addChild(this.rig.root);
  }

  update(e: Entity, now: number): void {
    const c = e as CharacterEntity;
    // On a ship the ship's own view draws you, standing on its deck.
    this.root.visible = c.inside === null && c.aboard === null;
    this.track(c.x, c.y, now, this.c === null);
    if (this.c === null) this.height = tileHeight(this.layer.state, c.x, c.y);
    this.c = c;
  }

  override frame(now: number, dt: number): void {
    const c = this.c;
    if (!c) return;
    this.interpolate(now);
    const targetH = tileHeight(this.layer.state, this.x, this.y);
    this.height +=
      Math.sign(targetH - this.height) * Math.min(Math.abs(targetH - this.height), dt * 48);
    const phase = Math.floor(now / 160 + c.id) % 2;
    const pose = this.moving ? (phase ? "walk0" : "walk1") : "stand";
    this.rig.set(c.look, this.layer.playerColour(c.playerId), c.facing, pose);
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y) - this.height),
    );
    // A hair in front of any villager on the same tile.
    this.root.zIndex = this.x + this.y + 0.02;
    this.root.alpha = this.fadeBehindTerrain(this.layer.state.world, this.height, dt);
  }
}

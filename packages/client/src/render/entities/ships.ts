import {
  deckSlot,
  pirateMaxHp,
  shipMaxHp,
  watched,
  tileIndex,
  type Entity,
  type PirateEntity,
  type ShipEntity,
} from "@explorer/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import { HeroRig } from "../heroRig";
import { DECK_HEIGHT, MovingView, screenX, screenY } from "./base";
import type { EntityLayer } from "./layer";

/** A small hull bar over a damaged ship; nothing at full health. */
export function hullBar(bar: Graphics, hp: number, max: number): void {
  bar.clear();
  if (hp >= max) return;
  const t = Math.max(0, hp / max);
  bar
    .rect(-11, -40, 22, 4)
    .fill({ color: 0x1b1a1f })
    .rect(-10, -39, Math.round(20 * t), 2)
    .fill({ color: t > 0.5 ? 0x8fae45 : t > 0.25 ? 0xe2a841 : 0xd9486a });
}

export class PirateView extends MovingView {
  readonly root = new Container();
  private readonly body = new Container({ sortableChildren: true });
  private readonly water: Waterline;
  private sprite: Sprite;
  private bar = new Graphics();
  private p: PirateEntity | null = null;
  private wakeTimer = 0;

  constructor(private readonly layer: EntityLayer) {
    super();
    this.sprite = layer.atlas.sprite("pirate_0");
    this.body.addChild(this.sprite);
    this.root.addChild(this.body, this.bar);
    this.water = new Waterline(layer, this.body);
  }

  override destroy(): void {
    this.water.destroy();
    super.destroy();
  }

  update(e: Entity, now: number): void {
    const p = e as PirateEntity;
    this.track(p.x, p.y, now, this.p === null);
    this.p = p;
    const name = `pirate_${(p.heading % 8) * 2}`;
    this.layer.atlas.setFrame(this.sprite, name);
    hullBar(this.bar, p.hp, pirateMaxHp(this.layer.state));
  }

  override frame(now: number, dt: number): void {
    const p = this.p;
    if (!p) return;
    this.interpolate(now);
    const world = this.layer.state.world;
    // Raiders are only seen on water someone has explored, and after dark only where a lamp or a
    // lighthouse's beam reaches.
    this.root.visible =
      this.layer.state.explored[tileIndex(world, Math.floor(this.x), Math.floor(this.y))] === 1 &&
      watched(this.layer.state, this.x, this.y);
    const heave = Math.round(Math.sin(now / 420 + p.id) * 1.3);
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y)),
    );
    this.body.y = heave;
    this.root.zIndex = this.x + this.y;
    const fade = this.fadeBehindTerrain(world, 0, dt);
    this.root.alpha = fade;
    this.water.set(
      "pirate",
      ((p.heading % 8) * 2) % 16,
      this.root.x,
      this.root.y,
      now,
      p.id,
      this.root.visible,
    );
    this.water.setAlpha(fade);
    if (this.moving && this.root.visible) {
      this.wakeTimer -= dt;
      if (this.wakeTimer <= 0) {
        this.wakeTimer = 0.14;
        this.layer.sparkle(
          this.root.x + (Math.random() - 0.5) * 16,
          this.root.y + 4 + Math.random() * 6,
          now,
        );
      }
    }
  }
}

/**
 * What puts a hull in the water: a shadow on the sea under it and a ring of lapping foam (both in
 * the wake layer, beneath everything), and a wet band over its lowest planks (part of the ship).
 */
export class Waterline {
  private readonly shadow: Sprite;
  private readonly foam: Sprite;
  private readonly wet: Sprite;

  constructor(
    private readonly layer: EntityLayer,
    body: Container,
  ) {
    const atlas = layer.atlas;
    this.shadow = atlas.sprite("shipshadow_scout_0");
    this.foam = atlas.sprite("shipfoam_scout_0_0");
    this.wet = atlas.sprite("shipwet_scout_0");
    layer.wakes.addChild(this.shadow, this.foam);
    this.wet.zIndex = 0.5;
    this.wet.y = 1;
    body.addChild(this.wet);
  }

  /** `x`, `y`: where the hull meets the water (it does not heave), `k`: the hull frame's heading. */
  set(
    style: string,
    k: number,
    x: number,
    y: number,
    now: number,
    phase: number,
    visible: boolean,
  ) {
    const atlas = this.layer.atlas;
    const f = Math.floor(now / 460 + phase) % 2;
    atlas.setFrame(this.shadow, `shipshadow_${style}_${k}`);
    atlas.setFrame(this.foam, `shipfoam_${style}_${k}_${f}`);
    atlas.setFrame(this.wet, `shipwet_${style}_${k}`);
    this.shadow.position.set(x, y);
    this.foam.position.set(x, y);
    this.shadow.visible = this.foam.visible = visible;
  }

  setAlpha(a: number): void {
    this.shadow.alpha = this.foam.alpha = a;
  }

  destroy(): void {
    this.shadow.destroy();
    this.foam.destroy();
  }
}

export class ShipView extends MovingView {
  readonly root = new Container();
  /** Hull, wet band and crew: they heave together on the swell while the waterline stays put. */
  private readonly body = new Container({ sortableChildren: true });
  private readonly water: Waterline;
  private sprite: Sprite;
  private s: ShipEntity | null = null;
  private wakeTimer = 0;
  private ringTimer = 0;
  private bar = new Graphics();
  /** The bow's direction as drawn: it eases towards the ship's own so turns look smooth. */
  private angle = 0;
  private speed = 0;
  private lastX = 0;
  private lastY = 0;
  /** The people on deck: drawn as part of the ship so they move, bob and turn with it exactly. */
  private readonly crew = new Map<number, HeroRig>();
  /** Where each rider stands, in world-layer pixels (for their name tag and the camera). */
  readonly spots = new Map<number, { x: number; y: number }>();

  constructor(private readonly layer: EntityLayer) {
    super();
    this.sprite = layer.atlas.sprite("ship_0");
    this.bar.zIndex = 1000;
    this.body.addChild(this.sprite);
    this.root.addChild(this.body, this.bar);
    this.water = new Waterline(layer, this.body);
  }

  override destroy(): void {
    this.water.destroy();
    super.destroy();
  }

  /** Draw everyone aboard standing at their places on the deck, relative to the ship. */
  private drawCrew(s: ShipEntity): void {
    const state = this.layer.state;
    const facing = ((Math.round(this.angle / (Math.PI / 2)) % 4) + 4) % 4;
    const seen = new Set<number>();
    s.riders.forEach((id, i) => {
      const c = state.entities.get(id);
      if (c?.type !== "character") return;
      seen.add(id);
      let rig = this.crew.get(id);
      if (!rig) {
        rig = new HeroRig(this.layer.atlas);
        this.crew.set(id, rig);
        this.body.addChild(rig.root);
      }
      rig.set(c.look, this.layer.playerColour(c.playerId), facing, "stand");
      const slot = deckSlot({ angle: this.angle, kind: s.kind }, i);
      const x = screenX(slot.x, slot.y);
      const y = screenY(slot.x, slot.y) - DECK_HEIGHT;
      rig.root.position.set(Math.round(x), Math.round(y));
      rig.root.zIndex = 1 + y;
      this.spots.set(id, {
        x: this.root.x + Math.round(x),
        y: this.root.y + this.body.y + Math.round(y),
      });
    });
    for (const [id, rig] of this.crew)
      if (!seen.has(id)) {
        rig.root.destroy({ children: true });
        this.crew.delete(id);
        this.spots.delete(id);
      }
  }

  update(e: Entity, now: number): void {
    const s = e as ShipEntity;
    if (this.s === null) {
      this.angle = s.angle;
      this.lastX = s.x;
      this.lastY = s.y;
    }
    this.track(s.x, s.y, now, this.s === null);
    this.s = s;
    hullBar(this.bar, s.hp, shipMaxHp(this.layer.state, s.kind));
  }

  override frame(now: number, dt: number): void {
    const s = this.s;
    if (!s) return;
    this.interpolate(now);
    // Swing the drawn bow round to where the ship points, the short way.
    const diff = Math.atan2(Math.sin(s.angle - this.angle), Math.cos(s.angle - this.angle));
    this.angle += diff * (1 - Math.exp(-dt * 9));
    const k = ((Math.round(this.angle / (Math.PI / 8)) % 16) + 16) % 16;
    this.layer.atlas.setFrame(this.sprite, `${s.kind === "scout" ? "ship" : s.kind}_${k}`);
    const style = s.kind;
    // How fast it is going (tiles a second), smoothed.
    const v = dt > 0 ? Math.hypot(this.x - this.lastX, this.y - this.lastY) / dt : 0;
    this.lastX = this.x;
    this.lastY = this.y;
    this.speed += (v - this.speed) * (1 - Math.exp(-dt * 6));
    const moving = this.speed > 0.3;
    // The hull heaves on the swell (a little more under way); the waterline stays where it is.
    const heave = Math.round(Math.sin(now / (moving ? 380 : 700) + s.id) * (moving ? 1.6 : 1.2));
    this.root.position.set(
      Math.round(screenX(this.x, this.y)),
      Math.round(screenY(this.x, this.y)),
    );
    this.body.y = heave;
    this.root.zIndex = this.x + this.y;
    const fade = this.fadeBehindTerrain(this.layer.state.world, 0, dt);
    this.root.alpha = fade;
    this.water.set(style, k, this.root.x, this.root.y, now, s.id, true);
    this.water.setAlpha(fade);
    this.drawCrew(s);
    // Waves: a bow wave and two trailing streams while under way, slow ripples when still.
    const half = s.kind === "cargo" ? 1.45 : 1.3;
    const ux = Math.cos(this.angle);
    const uy = Math.sin(this.angle);
    const at = (along: number, across: number) => ({
      x: screenX(this.x + ux * along - uy * across, this.y + uy * along + ux * across),
      y: screenY(this.x + ux * along - uy * across, this.y + uy * along + ux * across),
    });
    if (moving) {
      this.wakeTimer -= dt;
      if (this.wakeTimer <= 0) {
        this.wakeTimer = 0.07;
        const power = Math.min(1.4, this.speed / 3);
        for (const side of [-1, 1]) {
          const bow = at(half * 0.85, side * 0.18);
          const out = screenX(-uy * side, ux * side);
          const outY = screenY(-uy * side, ux * side);
          this.layer.foam(bow.x, bow.y, 1, out * 5, outY * 5 - 1, 0.9, 0.7, 1.4 + power * 0.3);
          const stern = at(-half * 0.8, side * 0.26);
          this.layer.foam(stern.x, stern.y, 2, out * 3, outY * 3, 1.5, 0.6, 1.5 + power * 0.3);
        }
        const tip = at(half, 0);
        this.layer.foam(tip.x, tip.y - 2, 0, 0, -6, 0.5, 0.8, 1.1);
        const keel = at(-half * 0.5, 0);
        this.layer.foam(keel.x, keel.y, 1, 0, 0, 1.1, 0.7, 1.3);
      }
    } else {
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 1.6;
        this.layer.ring(this.root.x, this.root.y + 2, 2.4, s.kind === "cargo" ? 1.1 : 0.9);
      }
    }
  }
}

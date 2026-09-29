// The feel of the biome under the camera: a colour grade on the world, a tinted vignette, a
// dark cracked texture for grim places and drifting particles (embers, snow, spores, petals…).
// Everything eases towards the new biome, so sailing between islands blends smoothly.
import type { BiomeId } from "@explorer/shared";
import {
  ColorMatrixFilter,
  Container,
  Sprite,
  Texture,
  TilingSprite,
  type Rectangle,
  type UniformGroup,
} from "pixi.js";
import type { Atlas } from "../assets";
import { ATMOSPHERE, OCEAN, type Atmosphere, type ParticleMotion } from "./biomeStyle";

interface Grade {
  tint: [number, number, number];
  saturation: number;
  brightness: number;
  contrast: number;
  vignette: [number, number, number];
  vignetteStrength: number;
  grain: number;
}

interface Particle {
  sprite: Sprite;
  kind: string;
  motion: ParticleMotion;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  phase: number;
}

const MAX_PARTICLES = 160;

function gradeOf(a: Atmosphere): Grade {
  return {
    tint: [...a.tint],
    saturation: a.saturation,
    brightness: a.brightness,
    contrast: a.contrast,
    vignette: [...a.vignette.color],
    vignetteStrength: a.vignette.strength,
    grain: a.grain,
  };
}

function vignetteTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 190);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(0.8, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return Texture.from(c);
}

/** Soot blotches and fine grit, tiled over the screen at low alpha for grim biomes. */
function grainTexture(): Texture {
  const size = 192;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Blotches wrap around the edges so the tile repeats seamlessly.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 26;
    for (const [ox, oy] of [
      [0, 0],
      [size, 0],
      [-size, 0],
      [0, size],
      [0, -size],
    ] as const) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(12, 2, 2, ${0.35 + rand() * 0.25})`);
      g.addColorStop(1, "rgba(12, 2, 2, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(10, 2, 2, ${rand() * 0.6})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  const t = Texture.from(c);
  t.source.scaleMode = "nearest";
  return t;
}

export class AtmosphereLayer {
  readonly filter = new ColorMatrixFilter();
  /** Screen-space layers drawn above the world. */
  readonly overlay = new Container();
  private readonly particles = new Container();
  private readonly vignette: Sprite;
  private readonly grain: TilingSprite;
  private grade: Grade = gradeOf(OCEAN);
  private target: Atmosphere = OCEAN;
  private live: Particle[] = [];
  private spawnDebt = 0;

  constructor(private readonly atlas: Atlas) {
    this.vignette = new Sprite(vignetteTexture());
    this.grain = new TilingSprite({ texture: grainTexture(), width: 1, height: 1 });
    this.grain.alpha = 0;
    this.overlay.addChild(this.particles, this.grain, this.vignette);
  }

  setBiome(biome: BiomeId | null): void {
    this.target = biome ? ATMOSPHERE[biome] : OCEAN;
  }

  update(dt: number, screen: Rectangle, zoom: number, pan: { dx: number; dy: number }): void {
    // Ease every parameter towards the target biome.
    const k = 1 - Math.exp(-dt * 1.6);
    const t = gradeOf(this.target);
    const g = this.grade;
    const mix = (a: number, b: number) => a + (b - a) * k;
    g.tint = [mix(g.tint[0], t.tint[0]), mix(g.tint[1], t.tint[1]), mix(g.tint[2], t.tint[2])];
    g.saturation = mix(g.saturation, t.saturation);
    g.brightness = mix(g.brightness, t.brightness);
    g.contrast = mix(g.contrast, t.contrast);
    g.vignette = [
      mix(g.vignette[0], t.vignette[0]),
      mix(g.vignette[1], t.vignette[1]),
      mix(g.vignette[2], t.vignette[2]),
    ];
    g.vignetteStrength = mix(g.vignetteStrength, t.vignetteStrength);
    g.grain = mix(g.grain, t.grain);
    // The `matrix` setter doesn't flag the uniforms as changed, so push the update explicitly.
    const uniforms = this.filter.resources.colorMatrixUniforms as UniformGroup;
    uniforms.uniforms.uColorMatrix = colourMatrix(g);
    uniforms.update();

    this.vignette.width = screen.width;
    this.vignette.height = screen.height;
    this.vignette.tint =
      (Math.round(g.vignette[0]) << 16) |
      (Math.round(g.vignette[1]) << 8) |
      Math.round(g.vignette[2]);
    this.vignette.alpha = g.vignetteStrength;
    this.grain.width = screen.width;
    this.grain.height = screen.height;
    this.grain.tileScale.set(zoom);
    this.grain.tilePosition.x += pan.dx;
    this.grain.tilePosition.y += pan.dy;
    this.grain.alpha = g.grain;

    this.updateParticles(dt, screen, zoom, pan);
  }

  private updateParticles(
    dt: number,
    screen: Rectangle,
    zoom: number,
    pan: { dx: number; dy: number },
  ): void {
    const spec = this.target.particles;
    if (spec) {
      // Rate is per 1000×1000 screen pixels, so small windows aren't flooded.
      this.spawnDebt += dt * spec.rate * ((screen.width * screen.height) / 1e6);
      while (this.spawnDebt >= 1 && this.live.length < MAX_PARTICLES) {
        this.spawnDebt -= 1;
        this.spawn(spec.kind, spec.motion, screen, zoom);
      }
      this.spawnDebt = Math.min(this.spawnDebt, 3);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.destroy();
        this.live.splice(i, 1);
        continue;
      }
      const sway =
        p.motion === "sway"
          ? Math.sin(p.age * 2.4 + p.phase) * 28
          : p.motion === "float"
            ? Math.sin(p.age * 1.3 + p.phase) * 10
            : 0;
      p.x += (p.vx + sway) * dt + pan.dx;
      p.y += p.vy * dt + pan.dy;
      const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 0.8);
      const blink =
        p.kind === "firefly" || p.kind === "mote" ? 0.55 + 0.45 * Math.sin(p.age * 5 + p.phase) : 1;
      p.sprite.alpha = Math.max(0, fade * blink);
      const frame = Math.floor(p.age * 4 + p.phase) % 2;
      p.sprite.texture = this.atlas.texture(`p_${p.kind}_${frame}`);
      p.sprite.position.set(Math.round(p.x), Math.round(p.y));
    }
  }

  private spawn(kind: string, motion: ParticleMotion, screen: Rectangle, zoom: number): void {
    const sprite = this.atlas.sprite(`p_${kind}_0`);
    sprite.scale.set(zoom);
    const r = Math.random;
    let x = r() * screen.width;
    let y = r() * screen.height;
    let vx = 0;
    let vy = 0;
    switch (motion) {
      case "rise":
        y = screen.height * (0.3 + r() * 0.75);
        vx = (r() - 0.5) * 16;
        vy = -(22 + r() * 30) * zoom * 0.5;
        break;
      case "fall":
      case "sway":
        y = -10 + r() * screen.height * 0.4;
        vx = (r() - 0.3) * 18;
        vy = (motion === "fall" ? 26 : 20) + r() * 18;
        break;
      case "drift":
        x = -10 + r() * screen.width * 0.5;
        vx = 50 + r() * 60;
        vy = (r() - 0.5) * 8;
        break;
      case "float":
        vx = (r() - 0.5) * 10;
        vy = -(3 + r() * 6);
        break;
    }
    this.particles.addChild(sprite);
    this.live.push({
      sprite,
      kind,
      motion,
      x,
      y,
      vx,
      vy,
      age: 0,
      life: 3 + r() * 4,
      phase: r() * 10,
    });
  }
}

/** Saturation, then contrast, then brightness and tint, as one 5×4 colour matrix. */
function colourMatrix(
  g: Grade,
): [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] {
  const s = g.saturation;
  const lr = 0.3086 * (1 - s);
  const lg = 0.6094 * (1 - s);
  const lb = 0.082 * (1 - s);
  const sat = [
    [lr + s, lg, lb],
    [lr, lg + s, lb],
    [lr, lg, lb + s],
  ];
  const c = g.contrast;
  const off = 0.5 * (1 - c);
  const rows = sat.map((row, i) => {
    const m = g.tint[i]! * g.brightness;
    return [row[0]! * c * m, row[1]! * c * m, row[2]! * c * m, 0, off * m];
  });
  return [...rows[0]!, ...rows[1]!, ...rows[2]!, 0, 0, 0, 1, 0] as ReturnType<typeof colourMatrix>;
}

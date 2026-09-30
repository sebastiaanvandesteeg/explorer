// Pixel weather: a canvas of little squares drifting over the page, for the current theme.
import type { WeatherSpec } from "./theme";

interface Speck {
  x: number;
  y: number;
  size: number;
  color: string;
  phase: number;
  speed: number;
  /** 0..1 fade: in after it spawns, out when the theme changes. */
  alpha: number;
  dying: boolean;
}

export class Weather {
  private readonly ctx: CanvasRenderingContext2D;
  private specks: Speck[] = [];
  private spec: WeatherSpec | null = null;
  private target = 0;
  private last = 0;
  private raf = 0;
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    const fit = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    fit();
    window.addEventListener("resize", fit);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }
  }

  /** Switch weather: the old specks fade away as new ones drift in. */
  set(spec: WeatherSpec | null, count: number): void {
    if (spec === this.spec && count === this.target) return;
    this.spec = spec;
    this.target = spec ? count : 0;
    for (const s of this.specks) s.dying = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }

  private spawn(spec: WeatherSpec, anywhere: boolean): Speck {
    const { width, height } = this.canvas;
    const r = Math.random;
    const fromTop = spec.vy > 0;
    const fromBottom = spec.vy < 0;
    return {
      x: r() * width,
      y: anywhere || (!fromTop && !fromBottom) ? r() * height : fromTop ? -6 : height + 6,
      size: Math.round(spec.size[0] + r() * (spec.size[1] - spec.size[0])),
      color: spec.colors[Math.floor(r() * spec.colors.length)]!,
      phase: r() * Math.PI * 2,
      speed: 0.6 + r() * 0.8,
      alpha: 0,
      dying: false,
    };
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this.time += dt;
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    const spec = this.spec;
    // Keep the right number of live specks for the current weather.
    if (spec) {
      const live = this.specks.filter((s) => !s.dying).length;
      for (let i = live; i < this.target; i++) this.specks.push(this.spawn(spec, true));
    }
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i]!;
      // Specks of the weather they belong to keep its motion; dying ones only fade.
      const motion = spec ?? null;
      if (motion) {
        s.x += (motion.vx * s.speed + Math.cos(this.time * 0.8 + s.phase) * motion.sway * 0.5) * dt;
        s.y += motion.vy * s.speed * dt;
      }
      s.alpha = s.dying ? s.alpha - dt * 1.2 : Math.min(1, s.alpha + dt * 0.8);
      const off = s.x < -10 || s.x > width + 10 || s.y < -10 || s.y > height + 10;
      if (s.alpha <= 0 && s.dying) {
        this.specks.splice(i, 1);
        continue;
      }
      if (off && !s.dying) {
        if (spec) this.specks[i] = this.spawn(spec, false);
        continue;
      }
      let a = s.alpha;
      if (spec?.blink)
        a *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 2.2 * s.speed + s.phase));
      ctx.globalAlpha = Math.max(0, a) * 0.85;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
}

// The continuous sound of the world: the sea, the wind, rain, night insects and the drone of
// strange places, all steady noise whose loudness follows the mood, plus the occasional bird or
// frog picked at random.
import type { Engine } from "./engine";
import { layerTargets, stingersFor, type Layers, type Mood } from "./mix";
import { SOUNDS } from "./sounds";

export class Ambience {
  private readonly stops: (() => void)[] = [];
  private readonly gains: Record<keyof Layers, GainNode>;
  private mood: Mood = { night: 0, storm: 0, biome: null };
  /** Seconds until the next stinger, per stinger index. */
  private wait = 3;
  private randomState = 0x9e3779b9;

  constructor(private readonly e: Engine) {
    const ctx = e.ctx;
    // The sea: a low wash that swells slowly.
    const sea = e.hiss("pink", [{ type: "lowpass", freq: 650, q: 0.5 }]);
    this.swell(sea.gain, 0.11, 0.35);
    // Wind: mid noise with slow gusts.
    const wind = e.hiss("pink", [
      { type: "bandpass", freq: 420, q: 0.7 },
      { type: "lowpass", freq: 1400 },
    ]);
    this.swell(wind.gain, 0.06, 0.5);
    // Rain: a bright, steady hiss.
    const rain = e.hiss("white", [
      { type: "highpass", freq: 1800 },
      { type: "lowpass", freq: 9000 },
    ]);
    // Deep drones (fire, fungus, distant thunder).
    const rumble = e.hiss("brown", [{ type: "lowpass", freq: 110 }]);

    // Night insects: a high carrier chopped fast, and again slowly.
    const crickets = ctx.createGain();
    crickets.gain.value = 0;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 4300;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const fast = ctx.createOscillator();
    fast.type = "square";
    fast.frequency.value = 23;
    const fastDepth = ctx.createGain();
    fastDepth.gain.value = 0.5;
    fast.connect(fastDepth);
    fastDepth.connect(chop.gain);
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    const slow = ctx.createOscillator();
    slow.type = "square";
    slow.frequency.value = 2.6;
    const slowDepth = ctx.createGain();
    slowDepth.gain.value = 0.5;
    slow.connect(slowDepth);
    slowDepth.connect(gate.gain);
    carrier.connect(chop);
    chop.connect(gate);
    gate.connect(crickets);
    crickets.connect(e.ambience);
    for (const o of [carrier, fast, slow]) o.start();
    this.stops.push(sea.stop, wind.stop, rain.stop, rumble.stop, () => {
      for (const o of [carrier, fast, slow]) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      crickets.disconnect();
    });
    this.gains = { sea: sea.gain, wind: wind.gain, rain: rain.gain, crickets, rumble: rumble.gain };
    this.apply(true);
  }

  /** A slow swell on a layer's own level, from a very slow oscillator. */
  private swell(target: GainNode, rate: number, depth: number): void {
    // The layer's gain param is driven by us; the swell rides on a second gain stage upstream by
    // modulating the filter-free path's level through this small LFO into the same param.
    const lfo = this.e.ctx.createOscillator();
    lfo.frequency.value = rate;
    const amount = this.e.ctx.createGain();
    amount.gain.value = depth * 0.1;
    lfo.connect(amount);
    amount.connect(target.gain);
    lfo.start();
    this.stops.push(() => {
      try {
        lfo.stop();
      } catch {
        /* already stopped */
      }
    });
  }

  private rand(): number {
    // Small xorshift: the ambience is not part of the simulation, but it need not be Math.random.
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 4294967296;
  }

  private apply(instant = false): void {
    const targets = layerTargets(this.mood);
    const t = this.e.now;
    for (const key of Object.keys(targets) as (keyof Layers)[]) {
      const g = this.gains[key].gain;
      if (instant) g.setValueAtTime(targets[key], t);
      else g.setTargetAtTime(targets[key], t, 1.2);
    }
  }

  /** Follow the mood (call a few times a second) and let the odd bird sing. */
  update(mood: Mood, dt: number): void {
    this.mood = mood;
    this.apply();
    this.wait -= dt;
    if (this.wait > 0) return;
    const options = stingersFor(mood);
    const pick = options[Math.floor(this.rand() * options.length)];
    if (!pick) {
      this.wait = 2;
      return;
    }
    this.wait = pick.every[0] + this.rand() * (pick.every[1] - pick.every[0]);
    SOUNDS[pick.sound](this.e, { gain: pick.gain, pan: this.rand() * 1.6 - 0.8 });
  }

  dispose(): void {
    for (const stop of this.stops) stop();
    this.stops.length = 0;
  }
}

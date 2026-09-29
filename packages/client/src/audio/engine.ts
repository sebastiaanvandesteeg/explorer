// A tiny synthesiser on top of the Web Audio API. Everything you hear in the game is built from
// oscillators and filtered noise, in keeping with the art: nothing is loaded from a file. The
// engine only needs a `BaseAudioContext`, so the same code plays live and renders offline.

export type NoiseColour = "white" | "pink" | "brown";

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Sweep the cutoff to this over the sound's life. */
  freqEnd?: number;
  q?: number;
}

/** Where and when a sound plays. */
export interface Place {
  /** Loudness scale, 0..1 (distance falls off through this). */
  gain?: number;
  /** -1 (left) to 1 (right). */
  pan?: number;
  /** Seconds to wait before it starts. */
  delay?: number;
}

export interface ToneSpec extends Place {
  type?: OscillatorType;
  freq: number;
  /** Glide to this pitch over the sound's life. */
  freqEnd?: number;
  attack?: number;
  decay: number;
  /** Peak level before `gain`. */
  level: number;
  filter?: FilterSpec;
  vibrato?: { rate: number; depth: number };
}

export interface NoiseSpec extends Place {
  colour?: NoiseColour;
  attack?: number;
  decay: number;
  level: number;
  filter?: FilterSpec;
  filter2?: FilterSpec;
}

/** More than this many sounds at once and new ones are dropped, so a battle cannot pile up. */
const MAX_VOICES = 48;
const FLOOR = 0.0001;

export class Engine {
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly ambience: GainNode;
  private readonly buffers = new Map<NoiseColour, AudioBuffer>();
  private voices = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly volume = 0.7,
  ) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1.5;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.6;
    this.sfx.connect(this.master);
    this.ambience.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(ctx.destination);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  get activeVoices(): number {
    return this.voices;
  }

  setMuted(muted: boolean): void {
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.now, 0.04);
  }

  /** Two seconds of noise of a colour, made once and shared. */
  noiseBuffer(colour: NoiseColour): AudioBuffer {
    let buf = this.buffers.get(colour);
    if (buf) return buf;
    const rate = this.ctx.sampleRate;
    buf = this.ctx.createBuffer(1, Math.floor(rate * 2), rate);
    const data = buf.getChannelData(0);
    // A fixed seed: the same hiss every run, and no Math.random in the audio thread's setup.
    let seed = 0x2545f491;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) / 4294967296) * 2 - 1;
    };
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = rand();
      if (colour === "white") data[i] = white * 0.6;
      else if (colour === "pink") {
        // Paul Kellet's economy filter: a good enough -3 dB per octave.
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    this.buffers.set(colour, buf);
    return buf;
  }

  private chain(nodes: AudioNode[], place: Place, bus: GainNode): void {
    let tail = nodes[nodes.length - 1]!;
    for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
    if (place.pan !== undefined && typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, place.pan));
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(bus);
  }

  private filterNode(spec: FilterSpec, t0: number, life: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = spec.type;
    f.Q.value = spec.q ?? 0.7;
    f.frequency.setValueAtTime(Math.max(20, spec.freq), t0);
    if (spec.freqEnd)
      f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), t0 + life);
    return f;
  }

  private envelope(
    param: AudioParam,
    t0: number,
    attack: number,
    decay: number,
    peak: number,
  ): void {
    const a = Math.max(0.004, attack);
    param.setValueAtTime(FLOOR, t0);
    param.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak), t0 + a);
    param.exponentialRampToValueAtTime(FLOOR, t0 + a + decay);
  }

  private claim(source: AudioScheduledSourceNode, extra: AudioScheduledSourceNode[] = []): void {
    this.voices++;
    source.onended = () => {
      this.voices--;
      for (const e of extra) {
        try {
          e.stop();
        } catch {
          /* already stopped */
        }
      }
    };
  }

  /** One note or blip. */
  tone(spec: ToneSpec): void {
    if (this.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const t0 = this.now + (spec.delay ?? 0);
    const attack = Math.max(0.004, spec.attack ?? 0.005);
    const life = attack + spec.decay;
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.freqEnd)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), t0 + life);
    const extra: AudioScheduledSourceNode[] = [];
    if (spec.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = spec.vibrato.depth;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + life + 0.05);
      extra.push(lfo);
    }
    const g = ctx.createGain();
    this.envelope(g.gain, t0, attack, spec.decay, spec.level * (spec.gain ?? 1));
    const nodes: AudioNode[] = [osc];
    if (spec.filter) nodes.push(this.filterNode(spec.filter, t0, life));
    nodes.push(g);
    this.chain(nodes, spec, this.sfx);
    this.claim(osc, extra);
    osc.start(t0);
    osc.stop(t0 + life + 0.05);
  }

  /** A burst of filtered noise: a knock, a splash, a boom's body. */
  noise(spec: NoiseSpec): void {
    if (this.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const t0 = this.now + (spec.delay ?? 0);
    const attack = Math.max(0.004, spec.attack ?? 0.004);
    const life = attack + spec.decay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(spec.colour ?? "white");
    src.loop = true;
    const g = ctx.createGain();
    this.envelope(g.gain, t0, attack, spec.decay, spec.level * (spec.gain ?? 1));
    const nodes: AudioNode[] = [src];
    if (spec.filter) nodes.push(this.filterNode(spec.filter, t0, life));
    if (spec.filter2) nodes.push(this.filterNode(spec.filter2, t0, life));
    nodes.push(g);
    this.chain(nodes, spec, this.sfx);
    this.claim(src);
    // Start somewhere different each time, so two knocks never sound identical.
    src.start(t0, (t0 * 7.13) % 1.5);
    src.stop(t0 + life + 0.05);
  }

  /** A steady noise for the ambience: the nodes stay up until `stop()`. */
  hiss(colour: NoiseColour, filters: FilterSpec[], level = 0): { gain: GainNode; stop(): void } {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(colour);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = level;
    const nodes: AudioNode[] = [src, ...filters.map((f) => this.filterNode(f, this.now, 1)), g];
    this.chain(nodes, {}, this.ambience);
    src.start(this.now, 0);
    return {
      gain: g,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        g.disconnect();
      },
    };
  }
}

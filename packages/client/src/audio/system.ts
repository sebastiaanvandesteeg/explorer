// The game's sound as one object: it makes the audio context once a player has interacted with the
// page (browsers do not allow sound before that), remembers whether it is muted, plays the cues
// for events and keeps the ambience following the mood.
import type { GameEvent, Tool } from "@explorer/shared";
import { Ambience } from "./ambience";
import { Engine } from "./engine";
import { soundsFor, workSound, type Cue, type Mood } from "./mix";
import { SOUNDS, type SoundName } from "./sounds";

const PREF = "explorer.sound";

function loadMuted(): boolean {
  try {
    return localStorage.getItem(PREF) === "off";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(PREF, muted ? "off" : "on");
  } catch {
    /* private mode: the preference just does not stick */
  }
}

/** The shortest gap between two of the same sound, so a flurry does not turn to noise. */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  click: 0.06,
  select: 0.08,
  error: 0.2,
  pop: 0.1,
  chop: 0.08,
  pick: 0.08,
  hammer: 0.12,
  dig: 0.1,
  boom: 0.08,
  coin: 0.1,
  splash: 0.1,
  step_grass: 0.1,
  step_sand: 0.1,
  step_stone: 0.1,
  step_wood: 0.1,
  step_dirt: 0.1,
  step_water: 0.1,
  door_open: 0.2,
  door_close: 0.2,
  voice: 0.05,
};

export interface Locate {
  (x: number, y: number): { gain: number; pan: number };
}

export class SoundSystem {
  private engine: Engine | null = null;
  private ambience: Ambience | null = null;
  private muted = loadMuted();
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly locate: Locate) {
    const unlock = () => this.unlock();
    for (const type of ["pointerdown", "keydown"] as const) {
      window.addEventListener(type, unlock, { once: true });
      this.listeners.push(() => window.removeEventListener(type, unlock));
    }
    // A player who has already clicked or typed on the page (the lobby) can hear sound at once.
    if (navigator.userActivation?.hasBeenActive) this.unlock();
    const visibility = () => this.follow();
    document.addEventListener("visibilitychange", visibility);
    this.listeners.push(() => document.removeEventListener("visibilitychange", visibility));
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Whether the browser can play sound at all. */
  get supported(): boolean {
    return typeof AudioContext !== "undefined";
  }

  toggle(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    // A click on the toggle is a user gesture: it is also the moment sound can begin.
    this.unlock();
    this.follow();
    return this.muted;
  }

  private unlock(): void {
    if (this.engine || !this.supported) return;
    try {
      this.engine = new Engine(new AudioContext());
      this.ambience = new Ambience(this.engine);
      this.follow();
    } catch {
      this.engine = null;
    }
  }

  /** Run only while unmuted and the page is in front: no sound (and no work) otherwise. */
  private follow(): void {
    const e = this.engine;
    if (!e || !(e.ctx instanceof AudioContext)) return;
    const on = !this.muted && !document.hidden;
    e.setMuted(this.muted);
    if (on) void e.ctx.resume();
    else void e.ctx.suspend();
  }

  private get live(): Engine | null {
    return this.engine && !this.muted && !document.hidden ? this.engine : null;
  }

  /** Play a sound now, at a place in the world if it has one. */
  cue(cue: Cue): void {
    const e = this.live;
    if (!e) return;
    const now = e.now;
    const gap = MIN_GAP[cue.sound] ?? 0;
    const last = this.lastPlayed.get(cue.sound) ?? -1;
    if (gap > 0 && now - last < gap) return;
    this.lastPlayed.set(cue.sound, now);
    const heard = cue.at ? this.locate(cue.at.x, cue.at.y) : { gain: 1, pan: 0 };
    SOUNDS[cue.sound](e, {
      gain: (cue.gain ?? 1) * heard.gain,
      pan: heard.pan,
      delay: cue.delay ?? 0,
    });
  }

  event(ev: GameEvent): void {
    for (const cue of soundsFor(ev)) this.cue(cue);
  }

  ui(kind: "click" | "select" | "error"): void {
    this.cue({ sound: kind, gain: 1 });
  }

  /** A villager working with a tool somewhere in the world. */
  work(tool: Tool | null, x: number, y: number): void {
    const sound = workSound(tool);
    if (sound) this.cue({ sound, at: { x, y }, gain: 0.55 });
  }

  /** Someone says a line: a few soft syllables. */
  voice(at?: { x: number; y: number }): void {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.cue({ sound: "voice", ...(at ? { at } : {}), gain: 0.7, delay: i * 0.075 });
    }
  }

  update(mood: Mood, dt: number): void {
    if (this.live && this.ambience) this.ambience.update(mood, dt);
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.ambience?.dispose();
    if (this.engine?.ctx instanceof AudioContext) void this.engine.ctx.close();
    this.engine = null;
  }
}

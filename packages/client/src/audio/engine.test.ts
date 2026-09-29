import { describe, expect, it } from "vitest";
import { Ambience } from "./ambience";
import { Engine } from "./engine";
import { SOUNDS, type SoundName } from "./sounds";

/**
 * A stand-in for the browser's audio context: every node is a recorder that accepts whatever is
 * done to it. It cannot check the sounds are right (the offline render in a real browser does),
 * only that the engine builds a graph, schedules it and cleans up.
 */
function fakeContext() {
  const log = { nodes: 0, started: 0, stopped: 0 };
  const ending: (() => void)[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });
  const node = (extra: Record<string, unknown> = {}): Record<string, unknown> => {
    log.nodes++;
    const n: Record<string, unknown> = {
      connect: (to: unknown) => to,
      disconnect: () => {},
      gain: param(),
      frequency: param(),
      Q: param(),
      pan: param(),
      threshold: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      start: () => log.started++,
      // As in a browser, a stopped source only reports back once its time has passed.
      stop: () => {
        log.stopped++;
        ending.push(() => (n.onended as (() => void) | undefined)?.());
      },
      ...extra,
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    createGain: () => node(),
    createOscillator: () => node({ type: "sine" }),
    createBiquadFilter: () => node({ type: "lowpass" }),
    createBufferSource: () => node({ buffer: null, loop: false }),
    createDynamicsCompressor: () => node(),
    createStereoPanner: () => node(),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  };
  return {
    ctx: ctx as unknown as BaseAudioContext,
    log,
    /** Let the clock run past everything scheduled. */
    finish: () => ending.splice(0).forEach((end) => end()),
  };
}

describe("engine", () => {
  it("builds every sound without complaint, and lets each one go", () => {
    const { ctx, log, finish } = fakeContext();
    const engine = new Engine(ctx);
    for (const name of Object.keys(SOUNDS) as SoundName[])
      expect(() => SOUNDS[name](engine, { gain: 0.8, pan: -0.3, delay: 0.1 }), name).not.toThrow();
    expect(log.started).toBeGreaterThan(30);
    expect(engine.activeVoices).toBeGreaterThan(0);
    finish();
    expect(engine.activeVoices).toBe(0);
  });

  it("frees a voice when its sound ends, and drops sounds beyond the limit", () => {
    const { ctx, finish } = fakeContext();
    const engine = new Engine(ctx);
    for (let i = 0; i < 200; i++) engine.tone({ freq: 440, decay: 0.2, level: 0.1 });
    expect(engine.activeVoices).toBe(48);
    finish();
    expect(engine.activeVoices).toBe(0);
  });

  it("makes noise buffers once, of the right colour, and always the same", () => {
    const { ctx } = fakeContext();
    const engine = new Engine(ctx);
    const a = engine.noiseBuffer("pink");
    expect(engine.noiseBuffer("pink")).toBe(a);
    expect(engine.noiseBuffer("brown")).not.toBe(a);
  });

  it("runs an ambience that follows the mood and shuts down cleanly", () => {
    const { ctx, log } = fakeContext();
    const engine = new Engine(ctx);
    const ambience = new Ambience(engine);
    for (let i = 0; i < 40; i++)
      ambience.update(
        { night: i / 40, storm: i > 20 ? 1 : 0, biome: i % 2 ? "swamp" : "crystal" },
        0.5,
      );
    ambience.dispose();
    expect(log.stopped).toBeGreaterThan(5);
  });
});

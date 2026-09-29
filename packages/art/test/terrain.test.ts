import { HALF_H, HALF_W, Terrain, generateWorld } from "@explorer/shared";
import { describe, expect, it } from "vitest";
import { WAVE_FRAMES, WAVE_SEQUENCE, chunkRect, paintChunk, type TerrainWorld } from "../src";
import { Fields, MARGIN, tileLevel } from "../src/terrain/field";

const CHUNK = 16;

/** A hand-made world: open sea with one raised plateau, a beach ring and nothing else. */
function island(size = 48): TerrainWorld {
  const terrain = new Uint8Array(size * size).fill(Terrain.Deep);
  const elevation = new Uint8Array(size * size);
  const shore = new Uint8Array(size * size).fill(255);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const k = y * size + x;
      if (d < 7) {
        terrain[k] = Terrain.Grass;
        elevation[k] = 2;
      } else if (d < 9) {
        terrain[k] = Terrain.Sand;
        elevation[k] = 0;
      } else shore[k] = Math.min(255, Math.max(1, Math.round(d - 8)));
    }
  return {
    width: size,
    height: size,
    terrain,
    elevation,
    biome: new Uint8Array(size * size),
    shore,
  };
}

function paint(world: TerrainWorld, cx: number, cy: number, chunk = CHUNK) {
  const rect = chunkRect(cx, cy, chunk);
  const painted = paintChunk(world, cx, cy, chunk, rect);
  return { rect, pixels: painted?.ground ?? null, waves: painted?.waves ?? null };
}

describe("paintChunk", () => {
  it("paints nothing for open sea", () => {
    const world = island(96);
    expect(paint(world, 0, 0).pixels).toBeNull();
  });

  it("is deterministic", () => {
    const world = island();
    const a = paint(world, 1, 1).pixels!;
    const b = paint(world, 1, 1).pixels!;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });

  it("draws land, cliffs and shallows around an island", () => {
    const world = island();
    const { rect, pixels } = paint(world, 1, 1);
    let opaque = 0;
    let translucent = 0;
    for (let i = 3; i < pixels!.length; i += 4) {
      if (pixels![i] === 255) opaque++;
      else if (pixels![i]! > 0) translucent++;
    }
    expect(rect.w).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(2000);
    expect(translucent).toBeGreaterThan(200);
  });

  it("has no straight tile staircase: the coast follows a smooth contour", () => {
    // Along a row of screen pixels crossing the coast, the land/water boundary of neighbouring
    // rows should not jump by a whole tile (16 px) the way stamped diamonds do.
    const world = island();
    const { rect, pixels } = paint(world, 1, 1);
    const opaqueRun = (py: number) => {
      let first = -1;
      let last = -1;
      for (let px = 0; px < rect.w; px++)
        if (pixels![(py * rect.w + px) * 4 + 3] === 255) {
          if (first < 0) first = px;
          last = px;
        }
      return { first, last };
    };
    let biggestJump = 0;
    let previous = opaqueRun(150);
    for (let py = 151; py < 230; py++) {
      const run = opaqueRun(py);
      if (run.first >= 0 && previous.first >= 0)
        biggestJump = Math.max(biggestJump, Math.abs(run.first - previous.first));
      previous = run;
    }
    expect(biggestJump).toBeLessThan(HALF_W);
  });

  it("owns each pixel in exactly one chunk", () => {
    const world = island();
    const seen = new Map<number, number>();
    let overlaps = 0;
    const cols = Math.ceil(world.width / CHUNK);
    for (let cy = 0; cy < cols; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const { rect, pixels } = paint(world, cx, cy);
        if (!pixels) continue;
        for (let py = 0; py < rect.h; py++)
          for (let px = 0; px < rect.w; px++) {
            if (pixels[(py * rect.w + px) * 4 + 3] === 0) continue;
            const key = (rect.y + py) * 100000 + (rect.x + px);
            if (seen.has(key)) overlaps++;
            seen.set(key, cx + cy * cols);
          }
      }
    expect(seen.size).toBeGreaterThan(5000);
    expect(overlaps).toBe(0);
  });

  it("paints the same pixels in small chunks as in one piece (no seams)", () => {
    const world = generateWorld("art-seams", "islanders", 64);
    const whole = paint(world, 0, 0, 64);
    const cols = Math.ceil(world.width / CHUNK);
    let compared = 0;
    let differing = 0;
    // The standing ground and every wave frame must agree with the one-piece paint.
    const layers = (r: ReturnType<typeof paint>) => [r.pixels!, ...r.waves!];
    for (let cy = 0; cy < cols; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const part = paint(world, cx, cy);
        if (!part.pixels) continue;
        const partLayers = layers(part);
        const wholeLayers = layers(whole);
        for (let layer = 0; layer < partLayers.length; layer++) {
          const pixels = partLayers[layer]!;
          const reference = wholeLayers[layer]!;
          const { rect } = part;
          for (let py = 0; py < rect.h; py++)
            for (let px = 0; px < rect.w; px++) {
              const i = (py * rect.w + px) * 4;
              if (pixels[i + 3] === 0) continue;
              const wx = rect.x + px - whole.rect.x;
              const wy = rect.y + py - whole.rect.y;
              const j = (wy * whole.rect.w + wx) * 4;
              compared++;
              for (let k = 0; k < 4; k++)
                if (pixels[i + k] !== reference[j + k]) {
                  differing++;
                  break;
                }
            }
        }
      }
    expect(compared).toBeGreaterThan(60000);
    expect(differing).toBe(0);
  });

  it("stacks cliffs: a raised plateau shows a face below its rim", () => {
    const world = island();
    const { rect, pixels } = paint(world, 1, 1);
    // Screen position of the plateau's front-most tile centre, at its rim height.
    const c = 24;
    const sx = (c - c) * HALF_W - rect.x;
    const sy = (c + c) * HALF_H - rect.y;
    // Walk down the centre column: the top should be grass-coloured, then rock, then sand or water.
    const colours: number[][] = [];
    for (let dy = 0; dy < 140; dy++) {
      const i = ((sy + dy) * rect.w + sx) * 4;
      colours.push([pixels![i]!, pixels![i + 1]!, pixels![i + 2]!, pixels![i + 3]!]);
    }
    const opaque = colours.filter((p) => p[3] === 255);
    expect(opaque.length).toBeGreaterThan(60);
    const greens = opaque.filter((p) => p[1]! > p[0]! && p[1]! > p[2]!).length;
    expect(greens).toBeGreaterThan(15);
  });
});

describe("waves", () => {
  it("paints WAVE_FRAMES frames that differ near the coast and agree far from it", () => {
    const world = island();
    const { rect, waves } = paint(world, 1, 1);
    expect(waves).toHaveLength(WAVE_FRAMES);
    for (const step of WAVE_SEQUENCE) expect(step).toBeLessThan(WAVE_FRAMES);
    let painted = 0;
    let differs = 0;
    for (let i = 0; i < rect.w * rect.h * 4; i += 4) {
      const alphas = waves!.map((w) => w[i + 3]!);
      if (alphas.every((a) => a === 0)) continue;
      painted++;
      const same = waves!.every(
        (w) =>
          w[i] === waves![0]![i] &&
          w[i + 1] === waves![0]![i + 1] &&
          w[i + 3] === waves![0]![i + 3],
      );
      if (!same) differs++;
    }
    // A band of water round the island moves; most of the wave pixels change between frames.
    expect(painted).toBeGreaterThan(2000);
    expect(differs).toBeGreaterThan(painted * 0.15);
    expect(differs).toBeLessThan(painted);
  });

  it("keeps the foam lapping: the white line is wider in the last frame than in the first", () => {
    const world = island();
    const { rect, waves } = paint(world, 1, 1);
    const white = (frame: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < rect.w * rect.h * 4; i += 4)
        if (frame[i + 3] === 255 && frame[i]! > 235 && frame[i + 1]! > 240) n++;
      return n;
    };
    expect(white(waves![WAVE_FRAMES - 1]!)).toBeGreaterThan(white(waves![0]!) * 1.3);
  });
});

describe("paved paths", () => {
  it("paint flagstones that differ from the ground they replace", () => {
    const plain = island();
    const paved = { ...plain, paved: new Uint8Array(plain.width * plain.height) };
    // A three-tile strip across the top of the plateau.
    for (let x = 22; x < 27; x++) paved.paved![24 * plain.width + x] = 1;
    const a = paint(plain, 1, 1);
    const b = paint(paved, 1, 1);
    let changed = 0;
    for (let i = 0; i < a.pixels!.length; i += 4)
      if (
        a.pixels![i] !== b.pixels![i] ||
        a.pixels![i + 1] !== b.pixels![i + 1] ||
        a.pixels![i + 2] !== b.pixels![i + 2]
      )
        changed++;
    // About five tiles' worth of pixels change, and nothing far away does.
    expect(changed).toBeGreaterThan(600);
    expect(changed).toBeLessThan(4000);
  });
});

describe("settlement ground", () => {
  const changedPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let changed = 0;
    for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
    return changed;
  };
  const size = 48 * 48;

  it("tramples grass into bare earth around a building, in an irregular clearing", () => {
    const plain = island();
    const worn = { ...plain, wear: new Uint8Array(size) };
    for (let y = 22; y < 27; y++)
      for (let x = 22; x < 27; x++) worn.wear![y * plain.width + x] = 255;
    const a = paint(plain, 1, 1).pixels!;
    const b = paint(worn, 1, 1).pixels!;
    const changed = changedPixels(a, b);
    // About a 5×5 tile clearing (and nothing elsewhere).
    expect(changed).toBeGreaterThan(3000);
    expect(changed).toBeLessThan(16000);
  });

  it("leaves untouched ground alone when the wear mask is empty", () => {
    const plain = island();
    const none = { ...plain, wear: new Uint8Array(size), field: new Uint8Array(size) };
    expect(changedPixels(paint(plain, 1, 1).pixels!, paint(none, 1, 1).pixels!)).toBe(0);
  });

  it("ploughs the tiles under a farm", () => {
    const plain = island();
    const ploughed = { ...plain, field: new Uint8Array(size) };
    for (let y = 21; y < 24; y++)
      for (let x = 21; x < 24; x++) ploughed.field![y * plain.width + x] = 1;
    const changed = changedPixels(paint(plain, 1, 1).pixels!, paint(ploughed, 1, 1).pixels!);
    expect(changed).toBeGreaterThan(1500);
    expect(changed).toBeLessThan(9000);
  });
});

describe("fields", () => {
  it("agree with the tile grid: land stays land and sea stays sea", () => {
    // The contours are smoothed and wobbled, but the game still plays on tiles: buildings and
    // villagers must stand on painted ground. Only isolated specks may be lost.
    for (const seed of ["fidelity-a", "fidelity-b"]) {
      const world = generateWorld(seed, "islanders");
      let land = 0;
      let lost = 0;
      let wrongLevel = 0;
      let sea = 0;
      let gained = 0;
      const chunks = Math.ceil(world.width / CHUNK);
      for (let cy = 0; cy < chunks; cy++)
        for (let cx = 0; cx < chunks; cx++) {
          const fields = new Fields(
            world,
            cx * CHUNK - MARGIN,
            cy * CHUNK - MARGIN,
            CHUNK + MARGIN * 2,
          );
          if (!fields.hasLand) continue;
          for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++)
            for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
              const want = tileLevel(world, x, y);
              const got = fields.levelAt(x + 0.5, y + 0.5);
              if (want > 0) {
                land++;
                if (got === 0) lost++;
                else if (got !== want) wrongLevel++;
              } else {
                sea++;
                if (got > 0) gained++;
              }
            }
        }
      expect(land).toBeGreaterThan(4000);
      expect(lost / land).toBeLessThan(0.002);
      expect(wrongLevel / land).toBeLessThan(0.005);
      expect(gained / sea).toBeLessThan(0.001);
    }
  });
});

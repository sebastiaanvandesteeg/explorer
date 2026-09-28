import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot } from "@explorer/shared";

export interface SavedPlayer {
  id: string;
  name: string;
  color: string;
  /** SHA-256 of the player's reconnect token; the raw token never touches disk. */
  tokenHash: string;
}

export interface SavedWorld {
  version: 1;
  id: string;
  seed: string;
  createdAt: string;
  players: SavedPlayer[];
  snapshot: Snapshot;
}

/** One JSON file per world, written atomically (temp file + rename). */
export class WorldStore {
  private ready: Promise<unknown>;
  private counter = 0;

  constructor(readonly dir: string) {
    // Temp files only survive a crash mid-write; the real file is still the last good save.
    this.ready = mkdir(dir, { recursive: true }).then(async () => {
      for (const f of await readdir(dir))
        if (f.endsWith(".tmp")) await rm(join(dir, f), { force: true });
    });
  }

  private path(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async save(world: SavedWorld): Promise<void> {
    await this.ready;
    const target = this.path(world.id);
    const tmp = `${target}.${process.pid}.${++this.counter}.tmp`;
    await writeFile(tmp, JSON.stringify(world));
    await rename(tmp, target);
  }

  async load(id: string): Promise<SavedWorld | null> {
    await this.ready;
    try {
      const data = JSON.parse(await readFile(this.path(id), "utf8")) as SavedWorld;
      return data.version === 1 ? data : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
}

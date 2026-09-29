// What the settlement does to the ground under it, as per-tile masks for the terrain painter:
// flagstones under finished paths, ploughed soil under farms, and trampled earth around every
// building, so grass gives way to a worn yard instead of ending at a sprite's edge.
import type { BuildingEntity, BuildingKind, WorldMap } from "@explorer/shared";

export interface GroundMasks {
  /** 1 under finished paths. */
  paved: Uint8Array;
  /** 0..255: how bare the earth is. */
  wear: Uint8Array;
  /** 1 under farms. */
  field: Uint8Array;
}

/** How far, in tiles, the ground is trampled beyond each kind of building (workplaces most). */
const YARD: Partial<Record<BuildingKind, number>> = {
  town_hall: 1.5,
  house: 1,
  storehouse: 1.3,
  lumber_camp: 1.6,
  quarry: 1.7,
  mine: 1.6,
  blacksmith: 1.4,
  market: 1.6,
  church: 1.4,
  magic_house: 1.2,
  farm: 0.9,
};

export function groundMasks(
  world: Pick<WorldMap, "width" | "height">,
  buildings: Iterable<BuildingEntity>,
): GroundMasks {
  const n = world.width * world.height;
  const masks: GroundMasks = {
    paved: new Uint8Array(n),
    wear: new Uint8Array(n),
    field: new Uint8Array(n),
  };
  for (const b of buildings) {
    if (b.kind === "dock") continue;
    if (b.kind === "path") {
      if (!b.complete) continue;
      for (let y = b.y; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++)
          if (x >= 0 && y >= 0 && x < world.width && y < world.height)
            masks.paved[y * world.width + x] = 1;
      continue;
    }
    const reach = YARD[b.kind] ?? 1;
    const span = Math.ceil(reach);
    for (let y = b.y - span; y < b.y + b.h + span; y++) {
      for (let x = b.x - span; x < b.x + b.w + span; x++) {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
        const k = y * world.width + x;
        if (b.kind === "farm" && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
          masks.field[k] = 1;
        // Distance from the tile's centre to the building's footprint.
        const cx = x + 0.5;
        const cy = y + 0.5;
        const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w));
        const dy = Math.max(b.y - cy, 0, cy - (b.y + b.h));
        const wear = Math.round(255 * Math.max(0, 1 - Math.hypot(dx, dy) / reach));
        if (wear > masks.wear[k]!) masks.wear[k] = wear;
      }
    }
  }
  return masks;
}

/** A cheap fingerprint of everything the masks depend on, to skip work when nothing changed. */
export function buildingsKey(buildings: Iterable<BuildingEntity>): string {
  const parts: string[] = [];
  for (const b of buildings)
    if (b.kind !== "dock") parts.push(`${b.id}:${b.kind}:${b.x},${b.y}:${b.complete ? 1 : 0}`);
  return parts.sort().join("|");
}

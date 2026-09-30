// How the villagers of an adventure world organise themselves: nobody orders them about, so they
// raise whatever needs raising, and otherwise spread over the jobs the settlement needs, keeping
// wood, food, stone, ore, tools and faith in balance.
import { BUILDINGS, NODES, SMITH, type Resource, type WorkerJob } from "./catalogue";
import { releaseTask } from "./commands";
import { landPath } from "./navigation";
import { buildingAround } from "./rules";
import {
  islandAt,
  markDirty,
  stockOf,
  type BuildingEntity,
  type GameState,
  type NodeEntity,
  type Task,
  type VillagerEntity,
} from "./state";
import { tileOf } from "./walk";

export type JobKind = "wood" | "food" | "stone" | "ore" | "tools" | "faith";
export const JOB_KINDS: readonly JobKind[] = ["wood", "food", "stone", "ore", "tools", "faith"];

/** What share of the workforce each kind of job should get, when there is work of every kind. */
export const JOB_SHARE: Record<JobKind, number> = {
  wood: 0.3,
  food: 0.25,
  stone: 0.15,
  ore: 0.15,
  tools: 0.1,
  faith: 0.05,
};

const WORKPLACE_JOB: Record<WorkerJob, JobKind> = {
  lumber: "wood",
  farm: "food",
  quarry: "stone",
  mine: "ore",
  smith: "tools",
  priest: "faith",
};

/** Plants and rocks villagers gather by hand when no workplace needs them. */
const GATHERED: Partial<Record<Resource, JobKind>> = {
  wood: "wood",
  food: "food",
  stone: "stone",
  ore: "ore",
};

const STOCK: Record<JobKind, Resource> = {
  wood: "wood",
  food: "food",
  stone: "stone",
  ore: "ore",
  tools: "tools",
  faith: "faith",
};

/** Builders wanted at a site: one villager for a house, three for a monument. */
const BUILDERS_WANTED = (b: BuildingEntity): number => (b.kind === "great_work" ? 3 : 1);
/** How far, in tiles, a villager will walk to gather something by hand. */
const GATHER_REACH = 45;

const workplaceJob = (b: BuildingEntity): JobKind | null => {
  const job = BUILDINGS[b.kind].worker?.job;
  return job ? WORKPLACE_JOB[job] : null;
};

/** The kind of job a villager is doing right now, if any (building does not count). */
export function jobOf(state: GameState, v: VillagerEntity): JobKind | null {
  const t = v.task;
  if (!t) return null;
  if (t.kind === "staff") {
    const b = state.entities.get(t.buildingId);
    return b?.type === "building" ? workplaceJob(b) : null;
  }
  if (t.kind === "harvest") {
    if (t.auto !== undefined) {
      const b = state.entities.get(t.auto);
      if (b?.type === "building") return workplaceJob(b);
    }
    const n = state.entities.get(t.nodeId);
    return n?.type === "node" ? (GATHERED[NODES[n.kind].resource] ?? "ore") : null;
  }
  return null;
}

/** How many villagers are on each job, leaving one villager out. */
export function jobCounts(state: GameState, except?: number): Map<JobKind, number> {
  const counts = new Map<JobKind, number>();
  for (const e of state.entities.values()) {
    if (e.type !== "villager" || e.id === except || e.aboard !== null) continue;
    const job = jobOf(state, e);
    if (job) counts.set(job, (counts.get(job) ?? 0) + 1);
  }
  return counts;
}

const total = (counts: Map<JobKind, number>): number => {
  let n = 0;
  for (const c of counts.values()) n += c;
  return n;
};

export interface JobOffer {
  job: JobKind;
  task: Task;
  workplace?: BuildingEntity;
  node?: NodeEntity;
}

/** The job of each kind a villager could take now: a free workplace, else the nearest plant or rock. */
export function jobOffers(state: GameState, v: VillagerEntity): JobOffer[] {
  const here = islandAt(state, Math.floor(v.x), Math.floor(v.y));
  const staff = new Map<JobKind, { offer: JobOffer; d: number }>();
  const hand = new Map<JobKind, { offer: JobOffer; d: number }>();
  for (const e of state.entities.values()) {
    if (e.type === "building") {
      if (!e.complete || e.workerId !== null || !BUILDINGS[e.kind].worker) continue;
      if (islandAt(state, e.x, e.y) !== here) continue;
      const job = workplaceJob(e)!;
      // A forge with nothing to forge would only stand idle.
      if (job === "tools" && stockOf(state, here).ore < SMITH.ore) continue;
      const d = Math.hypot(e.x + e.w / 2 - v.x, e.y + e.h / 2 - v.y);
      if (!staff.has(job) || d < staff.get(job)!.d)
        staff.set(job, {
          d,
          offer: { job, task: { kind: "staff", buildingId: e.id }, workplace: e },
        });
    } else if (e.type === "node") {
      if (e.stage !== "grown" || e.amount <= 0 || e.claimedBy !== null) continue;
      const job = GATHERED[NODES[e.kind].resource];
      if (!job) continue;
      if ((state.unreachable.get(e.id) ?? 0) > state.time) continue;
      const d = Math.hypot(e.x + 0.5 - v.x, e.y + 0.5 - v.y);
      if (d > GATHER_REACH || islandAt(state, e.x, e.y) !== here) continue;
      if (!hand.has(job) || d < hand.get(job)!.d)
        hand.set(job, { d, offer: { job, task: { kind: "harvest", nodeId: e.id }, node: e } });
    }
  }
  const out: JobOffer[] = [];
  for (const job of JOB_KINDS) {
    const pick = staff.get(job) ?? hand.get(job);
    if (pick) out.push(pick.offer);
  }
  return out;
}

/**
 * Which job the settlement needs most: the kind furthest below its share of the workforce, with
 * a nudge towards whatever the treasury is running short of.
 */
export function pickJob(state: GameState, v: VillagerEntity): JobOffer | null {
  const offers = jobOffers(state, v);
  if (offers.length === 0) return null;
  const counts = jobCounts(state, v.id);
  const workers = total(counts);
  let best: { offer: JobOffer; score: number } | null = null;
  for (const offer of offers) {
    const deficit = JOB_SHARE[offer.job] * (workers + 1) - (counts.get(offer.job) ?? 0);
    const scarcity = 0.6 / (1 + state.stock[STOCK[offer.job]] / 25);
    const score = deficit + scarcity;
    if (!best || score > best.score) best = { offer, score };
  }
  return best?.offer ?? null;
}

/** Put a villager on a job, claiming the workplace or the plant for them. */
export function takeJob(state: GameState, v: VillagerEntity, offer: JobOffer): void {
  if (offer.node) {
    // Claimed, not marked: marks are the player's colony tool, and show as badges on the plant.
    offer.node.claimedBy = v.id;
    markDirty(state, offer.node.id);
  }
  if (offer.workplace) {
    offer.workplace.workerId = v.id;
    markDirty(state, offer.workplace.id);
  }
  v.task = offer.task;
  v.retryAt = 0;
  markDirty(state, v.id);
}

const villagers = (state: GameState): VillagerEntity[] => {
  const out: VillagerEntity[] = [];
  for (const e of state.entities.values())
    if (e.type === "villager" && e.aboard === null) out.push(e);
  return out;
};

/**
 * Whenever a building needs raising, somebody drops what they are doing and goes to build it: the
 * nearest villager on its island who is not already building (an idle one is preferred to one
 * in the middle of a job). When the building is done they look for a new job, by balance.
 * Checked once a second.
 */
export function assignBuilders(state: GameState): void {
  if (state.tick % 10 !== 0) return;
  let crew: VillagerEntity[] | null = null;
  for (const b of state.entities.values()) {
    if (b.type !== "building" || b.complete) continue;
    crew ??= villagers(state);
    let have = 0;
    for (const v of crew) if (v.task?.kind === "build" && v.task.buildingId === b.id) have++;
    const want = BUILDERS_WANTED(b);
    if (have >= want) continue;
    const island = islandAt(state, b.x, b.y);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const candidates = crew
      .filter(
        (v) =>
          v.task?.kind !== "build" &&
          v.task?.kind !== "board" &&
          islandAt(state, Math.floor(v.x), Math.floor(v.y)) === island,
      )
      .map((v) => ({ v, cost: Math.hypot(v.x - cx, v.y - cy) + (v.task ? 6 : 0) }))
      .sort((a, c) => a.cost - c.cost);
    const goals = buildingAround(state, b);
    let tried = 0;
    for (const { v } of candidates) {
      if (have >= want || tried >= 4) break;
      tried++;
      // Only send someone who can actually walk there.
      if (!landPath(state, tileOf(v), goals)) continue;
      releaseTask(state, v);
      v.task = { kind: "build", buildingId: b.id };
      v.retryAt = 0;
      markDirty(state, v.id);
      have++;
    }
  }
}

/**
 * New workplaces would never be staffed if every villager was already busy gathering by hand, so
 * every few seconds one hand-gatherer from the most over-staffed kind of job moves to a free
 * workplace of a kind that is short of workers.
 */
export function rebalance(state: GameState): void {
  if (state.tick % 50 !== 25) return;
  const crew = villagers(state);
  const counts = jobCounts(state);
  const workers = total(counts);
  if (workers < 2) return;
  const gap = (job: JobKind) => JOB_SHARE[job] * workers - (counts.get(job) ?? 0);
  let target: { b: BuildingEntity; job: JobKind; need: number } | null = null;
  for (const e of state.entities.values()) {
    if (e.type !== "building" || !e.complete || e.workerId !== null) continue;
    const job = workplaceJob(e);
    if (!job) continue;
    const need = gap(job);
    if (need < 0.75) continue;
    if (!target || need > target.need) target = { b: e, job, need };
  }
  if (!target) return;
  const island = islandAt(state, target.b.x, target.b.y);
  let donor: { v: VillagerEntity; surplus: number; d: number } | null = null;
  for (const v of crew) {
    if (v.task?.kind !== "harvest" || v.task.auto !== undefined) continue;
    if (islandAt(state, Math.floor(v.x), Math.floor(v.y)) !== island) continue;
    const job = jobOf(state, v);
    if (!job || job === target.job) continue;
    const surplus = -gap(job);
    if (surplus < 0.75) continue;
    const d = Math.hypot(v.x - target.b.x, v.y - target.b.y);
    if (!donor || surplus > donor.surplus || (surplus === donor.surplus && d < donor.d))
      donor = { v, surplus, d };
  }
  if (!donor) return;
  releaseTask(state, donor.v);
  takeJob(state, donor.v, {
    job: target.job,
    task: { kind: "staff", buildingId: target.b.id },
    workplace: target.b,
  });
}

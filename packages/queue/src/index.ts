import { env } from "@laqta/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

/**
 * Shared Redis connection + BullMQ queue plumbing. A single queue ("pipeline")
 * carries all image/photo jobs, distinguished by job name. `apps/api` enqueues;
 * `apps/worker` processes. BullMQ is built around ioredis (the best-supported
 * driver); if it cannot run under Bun, the worker runs on Node — see plan §4.
 */
export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ workers
});

export const QUEUE_NAME = "pipeline";

// ── Job payloads ────────────────────────────────────────────────────────────
export interface ProcessImageJob {
  photoId: string;
}
export interface ModerateJob {
  photoId: string;
}
export interface EmbedJob {
  photoId: string;
}
export interface GenerateAltJob {
  photoId: string;
}
export interface IndexSearchJob {
  photoId: string;
}
export interface DeindexSearchJob {
  photoId: string;
}
export interface PurgeR2Job {
  keys: string[];
}

export type JobMap = {
  process_image: ProcessImageJob;
  moderate: ModerateJob;
  embed: EmbedJob;
  generate_alt: GenerateAltJob;
  index_search: IndexSearchJob;
  deindex_search: DeindexSearchJob;
  purge_r2: PurgeR2Job;
  flush_counters: Record<string, never>;
};

export type JobName = keyof JobMap;

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 3000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const pipelineQueue = new Queue<JobMap[JobName], unknown, JobName>(
  QUEUE_NAME,
  { connection, defaultJobOptions },
);

/** Type-safe enqueue for a single job. */
export function enqueue<N extends JobName>(name: N, data: JobMap[N]) {
  return pipelineQueue.add(name, data);
}

// ── Engagement counters (Redis-buffered, flushed to Postgres) ───────────────
const DIRTY_SET = "counters:dirty";
const viewsKey = (id: string) => `counter:views:${id}`;
const downloadsKey = (id: string) => `counter:downloads:${id}`;

/**
 * Increment a view/download counter in Redis with a per-identity dedup window
 * (defeats refresh/bot inflation). `identity` is a session id or client IP.
 * Returns true if counted, false if within the dedup window.
 */
export async function incrementCounter(
  kind: "views" | "downloads",
  photoId: string,
  identity: string,
  dedupWindowSec = 3600,
): Promise<boolean> {
  const dedupKey = `dedup:${kind}:${photoId}:${identity}`;
  const set = await connection.set(dedupKey, "1", "EX", dedupWindowSec, "NX");
  if (set !== "OK") return false;
  const key = kind === "views" ? viewsKey(photoId) : downloadsKey(photoId);
  await connection.incr(key);
  await connection.sadd(DIRTY_SET, photoId);
  return true;
}

/**
 * Drains buffered counter deltas. Returns per-photo deltas for the flush job to
 * apply to Postgres; also clears the dirty set. Uses GETDEL for atomic drain.
 */
export async function drainCounters(): Promise<
  { photoId: string; views: number; downloads: number }[]
> {
  const ids = await connection.smembers(DIRTY_SET);
  if (ids.length === 0) return [];
  const out: { photoId: string; views: number; downloads: number }[] = [];
  for (const photoId of ids) {
    const [v, d] = await Promise.all([
      connection.getdel(viewsKey(photoId)),
      connection.getdel(downloadsKey(photoId)),
    ]);
    await connection.srem(DIRTY_SET, photoId);
    const views = Number(v ?? 0);
    const downloads = Number(d ?? 0);
    if (views || downloads) out.push({ photoId, views, downloads });
  }
  return out;
}

/**
 * Registers the repeatable counter-flush job (idempotent — safe to call on
 * every worker boot). Flushes Redis view/download deltas into Postgres.
 */
export async function ensureRepeatableJobs() {
  await pipelineQueue.add(
    "flush_counters",
    {},
    {
      repeat: { every: 60_000 },
      jobId: "flush_counters", // stable id prevents duplicates
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

import {
  QUEUE_NAME,
  connection,
  ensureRepeatableJobs,
  type JobMap,
  type JobName,
} from "@laqta/queue";
import { ensureCollection } from "@laqta/search";
import { Worker } from "bullmq";
import { embed } from "./handlers/embed.ts";
import { flushCounters } from "./handlers/flush-counters.ts";
import { generateAlt } from "./handlers/generate-alt.ts";
import { deindexSearch, indexSearch } from "./handlers/index-search.ts";
import { moderate } from "./handlers/moderate.ts";
import { processImage } from "./handlers/process-image.ts";
import { purgeR2 } from "./handlers/purge.ts";

/**
 * Laqta background worker. Runs BullMQ workers over the shared pipeline queue.
 * Handlers are registered per job name and wired in as each subsystem lands.
 */
async function main() {
  await ensureCollection();
  await ensureRepeatableJobs();

  const worker = new Worker<JobMap[JobName], unknown, JobName>(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "process_image":
          return processImage(job.data as { photoId: string });
        case "moderate":
          return moderate(job.data as { photoId: string });
        case "embed":
          return embed(job.data as { photoId: string });
        case "generate_alt":
          return generateAlt(job.data as { photoId: string });
        case "index_search":
          return indexSearch(job.data as { photoId: string });
        case "deindex_search":
          return deindexSearch(job.data as { photoId: string });
        case "purge_r2":
          return purgeR2(job.data as { keys: string[] });
        case "flush_counters":
          return flushCounters();
        default:
          console.warn(`No handler for job "${job.name}" yet`);
          return;
      }
    },
    { connection, concurrency: 4 },
  );

  worker.on("failed", (job, err) => {
    console.error(`✗ job ${job?.name} (${job?.id}) failed:`, err.message);
  });
  worker.on("completed", (job) => {
    console.log(`✓ job ${job.name} (${job.id}) done`);
  });

  console.log("laqta worker started");
}

main().catch((err) => {
  console.error("worker boot failed:", err);
  process.exit(1);
});

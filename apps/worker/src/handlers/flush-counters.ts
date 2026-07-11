import { db, photos } from "@laqta/db";
import { drainCounters, enqueue } from "@laqta/queue";
import { eq, sql } from "drizzle-orm";

/**
 * Repeatable job: flush buffered Redis view/download deltas into Postgres and
 * refresh the search index so popularity ranking stays current.
 */
export async function flushCounters(): Promise<void> {
  const deltas = await drainCounters();
  for (const { photoId, views, downloads } of deltas) {
    await db
      .update(photos)
      .set({
        viewsCount: sql`${photos.viewsCount} + ${views}`,
        downloadsCount: sql`${photos.downloadsCount} + ${downloads}`,
      })
      .where(eq(photos.id, photoId));
    // Popularity changed → refresh the Typesense doc (no-ops if unpublished).
    await enqueue("index_search", { photoId });
  }
}

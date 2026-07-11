import type { PurgeR2Job } from "@laqta/queue";
import { deleteObjects } from "@laqta/storage";

/**
 * Deletes stored objects for a photo/user — photo deletion and
 * right-to-be-forgotten. DB rows are removed by the caller (cascade); this
 * clears the object storage side.
 */
export async function purgeR2({ keys }: PurgeR2Job): Promise<void> {
  if (keys.length === 0) return;
  await deleteObjects(keys);
}

import { env } from "@laqta/config";
import { embed as openrouterEmbed } from "@laqta/core";
import { categories, db, photoTags, photos, tags } from "@laqta/db";
import { type EmbedJob, enqueue } from "@laqta/queue";
import { eq } from "drizzle-orm";

/**
 * Builds a semantic embedding for the photo from its textual metadata (title,
 * caption, description, alt, category, tags) via OpenRouter, stores it in the
 * pgvector column, and re-indexes search so the vector reaches Typesense.
 */
export async function embed({ photoId }: EmbedJob): Promise<void> {
  const [p] = await db
    .select({
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      captionAr: photos.captionAr,
      captionEn: photos.captionEn,
      descAr: photos.descAr,
      descEn: photos.descEn,
      altAr: photos.altAr,
      altEn: photos.altEn,
      locationName: photos.locationName,
      categoryAr: categories.nameAr,
      categoryEn: categories.nameEn,
    })
    .from(photos)
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .where(eq(photos.id, photoId));
  if (!p) throw new Error(`embed: photo ${photoId} not found`);

  const tagRows = await db
    .select({ ar: tags.nameAr, en: tags.nameEn })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(eq(photoTags.photoId, photoId));

  const text = [
    p.titleAr,
    p.titleEn,
    p.captionAr,
    p.captionEn,
    p.descAr,
    p.descEn,
    p.altAr,
    p.altEn,
    p.locationName,
    p.categoryAr,
    p.categoryEn,
    ...tagRows.flatMap((t) => [t.ar, t.en]),
  ]
    .filter(Boolean)
    .join(" \n ")
    .trim();

  // Nothing to embed yet — skip (re-runs after metadata/alt exist).
  if (!text) return;

  const vector = await openrouterEmbed(env.OPENROUTER_MODEL_EMBEDDING, text);
  await db
    .update(photos)
    .set({ embedding: vector })
    .where(eq(photos.id, photoId));

  await enqueue("index_search", { photoId });
}

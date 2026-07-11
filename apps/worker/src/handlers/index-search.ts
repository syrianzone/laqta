import { creditName } from "@laqta/core";
import { categories, db, photoTags, photos, tags, user } from "@laqta/db";
import type { DeindexSearchJob, IndexSearchJob } from "@laqta/queue";
import { type PhotoDocument, deindexPhoto, indexPhoto } from "@laqta/search";
import { eq } from "drizzle-orm";

/** Weighted popularity used for search ranking/tie-breaking. */
export function popularityScore(
  views: number,
  downloads: number,
  likes: number,
): number {
  return views + downloads * 2 + likes * 3;
}

/**
 * Upserts a published photo's Typesense document (including its embedding when
 * present). Non-published photos are removed from the index instead.
 */
export async function indexSearch({ photoId }: IndexSearchJob): Promise<void> {
  const [p] = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      status: photos.status,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      captionAr: photos.captionAr,
      captionEn: photos.captionEn,
      descAr: photos.descAr,
      descEn: photos.descEn,
      license: photos.license,
      width: photos.width,
      height: photos.height,
      dominantColor: photos.dominantColor,
      blurhash: photos.blurhash,
      lat: photos.lat,
      lng: photos.lng,
      embedding: photos.embedding,
      viewsCount: photos.viewsCount,
      downloadsCount: photos.downloadsCount,
      likesCount: photos.likesCount,
      publishedAt: photos.publishedAt,
      categorySlug: categories.slug,
      creditOverride: photos.creditOverride,
      displayName: user.displayName,
      userName: user.name,
      creditFormat: user.creditFormat,
    })
    .from(photos)
    .innerJoin(user, eq(photos.userId, user.id))
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .where(eq(photos.id, photoId));

  if (!p || p.status !== "published") {
    await deindexPhoto(photoId);
    return;
  }

  const tagRows = await db
    .select({ slug: tags.slug })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(eq(photoTags.photoId, photoId));

  const doc: PhotoDocument = {
    id: p.id,
    slug: p.slug,
    title_ar: p.titleAr ?? undefined,
    title_en: p.titleEn ?? undefined,
    caption_ar: p.captionAr ?? undefined,
    caption_en: p.captionEn ?? undefined,
    desc_ar: p.descAr ?? undefined,
    desc_en: p.descEn ?? undefined,
    tags: tagRows.map((t) => t.slug),
    category: p.categorySlug ?? undefined,
    license: p.license,
    credit: creditName({
      license: p.license,
      displayName: p.displayName ?? p.userName,
      creditOverride: p.creditOverride,
      creditFormat: p.creditFormat,
      photoUrl: "",
    }),
    width: p.width ?? undefined,
    height: p.height ?? undefined,
    dominant_color: p.dominantColor ?? undefined,
    blurhash: p.blurhash ?? undefined,
    lat: p.lat ?? undefined,
    lng: p.lng ?? undefined,
    published_at: p.publishedAt ? Math.floor(p.publishedAt.getTime() / 1000) : 0,
    popularity: popularityScore(p.viewsCount, p.downloadsCount, p.likesCount),
    embedding: p.embedding ?? undefined,
  };

  await indexPhoto(doc);
}

export async function deindexSearch({
  photoId,
}: DeindexSearchJob): Promise<void> {
  await deindexPhoto(photoId);
}

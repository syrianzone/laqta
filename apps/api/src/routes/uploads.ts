import {
  ACCEPTED_UPLOAD_MIME,
  type AcceptedUploadMime,
  LICENSES,
  MAX_UPLOAD_BYTES,
  buildSlug,
  slugify,
} from "@laqta/core";
import { categories, db, photoTags, photos, tags } from "@laqta/db";
import { enqueue } from "@laqta/queue";
import {
  objectExists,
  originalKey,
  presignUpload,
} from "@laqta/storage";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";

export const uploadRoutes = new Hono<AppEnv>();
uploadRoutes.use("*", requireAuth);

const EXT: Record<AcceptedUploadMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
};

const presignSchema = z.object({
  contentType: z.enum(ACCEPTED_UPLOAD_MIME),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/**
 * Step 1: reserve a photo row (status `pending`) and hand back a presigned PUT
 * so the browser uploads the original directly to R2 (no proxying of large files).
 */
uploadRoutes.post("/presign", async (c) => {
  const u = c.get("user")!;
  const body = presignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HTTPException(400, { message: "Invalid upload request" });
  }
  const { contentType, sizeBytes } = body.data;

  const photoId = crypto.randomUUID();
  const key = originalKey(photoId, EXT[contentType]);

  await db.insert(photos).values({
    id: photoId,
    userId: u.id,
    slug: photoId, // temporary; finalized at /complete once titled
    originalKey: key,
    status: "pending",
  });

  const uploadUrl = await presignUpload(key, contentType);
  return c.json({ photoId, uploadUrl, key, sizeBytes });
});

const completeSchema = z.object({
  photoId: z.string().uuid(),
  titleAr: z.string().max(200).optional(),
  titleEn: z.string().max(200).optional(),
  captionAr: z.string().max(500).optional(),
  captionEn: z.string().max(500).optional(),
  descAr: z.string().max(4000).optional(),
  descEn: z.string().max(4000).optional(),
  altAr: z.string().max(500).optional(),
  altEn: z.string().max(500).optional(),
  categorySlug: z.string().optional(),
  license: z.enum(LICENSES).optional(),
  creditOverride: z.string().max(200).optional(),
  locationName: z.string().max(200).optional(),
  tags: z.array(z.string().min(1).max(50)).max(30).optional(),
});

/**
 * Step 2: attach metadata to the uploaded original and kick off processing.
 * Verifies ownership and that the object actually landed in R2.
 */
uploadRoutes.post("/complete", async (c) => {
  const u = c.get("user")!;
  const body = completeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HTTPException(400, { message: "Invalid metadata" });
  }
  const d = body.data;

  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, d.photoId), eq(photos.userId, u.id)));
  if (!photo) throw new HTTPException(404, { message: "Photo not found" });
  if (photo.status !== "pending") {
    throw new HTTPException(409, { message: "Photo already processed" });
  }
  if (!(await objectExists(photo.originalKey))) {
    throw new HTTPException(400, { message: "Upload not found in storage" });
  }

  let categoryId: string | null = null;
  if (d.categorySlug) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, d.categorySlug));
    categoryId = cat?.id ?? null;
  }

  const titleForSlug = d.titleAr || d.titleEn || "photo";
  const slug = buildSlug(titleForSlug, photo.id);

  await db
    .update(photos)
    .set({
      titleAr: d.titleAr,
      titleEn: d.titleEn,
      captionAr: d.captionAr,
      captionEn: d.captionEn,
      descAr: d.descAr,
      descEn: d.descEn,
      altAr: d.altAr,
      altEn: d.altEn,
      categoryId,
      license: d.license ?? "cc-by",
      creditOverride: d.creditOverride,
      locationName: d.locationName,
      slug,
    })
    .where(eq(photos.id, photo.id));

  if (d.tags?.length) await attachTags(photo.id, d.tags);

  await enqueue("process_image", { photoId: photo.id });
  return c.json({ ok: true, photoId: photo.id, slug });
});

/** Upserts tags by slug and links them to the photo. */
async function attachTags(photoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    const [tag] = await db
      .insert(tags)
      .values({ slug, nameAr: name, nameEn: name })
      .onConflictDoUpdate({ target: tags.slug, set: { slug } })
      .returning({ id: tags.id });
    if (tag) {
      await db
        .insert(photoTags)
        .values({ photoId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

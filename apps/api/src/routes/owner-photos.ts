import { LICENSES } from "@laqta/core";
import { categories, db, photoRenditions, photos } from "@laqta/db";
import { enqueue } from "@laqta/queue";
import { publicUrl, renditionKey } from "@laqta/storage";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";

/** Contributor management of their own photos. */
export const ownerPhotoRoutes = new Hono<AppEnv>();
ownerPhotoRoutes.use("*", requireAuth);

ownerPhotoRoutes.get("/", async (c) => {
  const u = c.get("user")!;
  const rows = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      status: photos.status,
      blurhash: photos.blurhash,
      viewsCount: photos.viewsCount,
      downloadsCount: photos.downloadsCount,
      likesCount: photos.likesCount,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .where(eq(photos.userId, u.id))
    .orderBy(desc(photos.createdAt));
  return c.json({
    items: rows.map((p) => ({
      ...p,
      thumb: publicUrl(renditionKey(p.id, "thumb", "webp")),
    })),
  });
});

const editSchema = z.object({
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
});

/** Edit metadata (including the contributor caption). Re-indexes if published. */
ownerPhotoRoutes.patch("/:id", async (c) => {
  const u = c.get("user")!;
  const id = c.req.param("id");
  const [photo] = await db
    .select({ id: photos.id, status: photos.status })
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.userId, u.id)));
  if (!photo) throw new HTTPException(404, { message: "Photo not found" });

  const parsed = editSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid fields" });
  const { categorySlug, ...fields } = parsed.data;

  let categoryId: string | undefined;
  if (categorySlug) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug));
    categoryId = cat?.id;
  }

  await db
    .update(photos)
    .set({ ...fields, ...(categoryId ? { categoryId } : {}) })
    .where(eq(photos.id, id));

  if (photo.status === "published") {
    await enqueue("embed", { photoId: id });
    await enqueue("index_search", { photoId: id });
  }
  return c.json({ ok: true });
});

/** Delete own photo → purge objects + deindex + remove rows. */
ownerPhotoRoutes.delete("/:id", async (c) => {
  const u = c.get("user")!;
  const id = c.req.param("id");
  const [photo] = await db
    .select({ id: photos.id, originalKey: photos.originalKey })
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.userId, u.id)));
  if (!photo) throw new HTTPException(404, { message: "Photo not found" });

  const rends = await db
    .select({ key: photoRenditions.key })
    .from(photoRenditions)
    .where(eq(photoRenditions.photoId, id));
  await enqueue("purge_r2", {
    keys: [photo.originalKey, ...rends.map((r) => r.key)],
  });
  await enqueue("deindex_search", { photoId: id });
  await db.delete(photos).where(eq(photos.id, id));
  return c.json({ ok: true });
});

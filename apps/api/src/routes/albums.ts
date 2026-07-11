import { buildSlug } from "@laqta/core";
import { albumPhotos, albums, db, photos } from "@laqta/db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";

/** Contributor-owned collections (albums) of their photos. */
export const albumRoutes = new Hono<AppEnv>();
albumRoutes.use("*", requireAuth);

async function ownedAlbum(userId: string, albumId: string) {
  const [a] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
  if (!a) throw new HTTPException(404, { message: "Album not found" });
  return a;
}

albumRoutes.get("/", async (c) => {
  const u = c.get("user")!;
  const rows = await db
    .select({
      id: albums.id,
      slug: albums.slug,
      titleAr: albums.titleAr,
      titleEn: albums.titleEn,
      createdAt: albums.createdAt,
      count: sql<number>`count(${albumPhotos.photoId})::int`,
    })
    .from(albums)
    .leftJoin(albumPhotos, eq(albumPhotos.albumId, albums.id))
    .where(eq(albums.userId, u.id))
    .groupBy(albums.id)
    .orderBy(albums.createdAt);
  return c.json({ items: rows });
});

const albumSchema = z.object({
  titleAr: z.string().max(200).optional(),
  titleEn: z.string().max(200).optional(),
});

albumRoutes.post("/", async (c) => {
  const u = c.get("user")!;
  const body = albumSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success || (!body.data.titleAr && !body.data.titleEn)) {
    throw new HTTPException(400, { message: "Title required" });
  }
  const id = crypto.randomUUID();
  const slug = buildSlug(body.data.titleAr || body.data.titleEn || "album", id);
  const [row] = await db
    .insert(albums)
    .values({ id, userId: u.id, slug, titleAr: body.data.titleAr, titleEn: body.data.titleEn })
    .returning();
  return c.json(row, 201);
});

albumRoutes.patch("/:id", async (c) => {
  const u = c.get("user")!;
  await ownedAlbum(u.id, c.req.param("id"));
  const body = albumSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HTTPException(400, { message: "Invalid" });
  await db.update(albums).set(body.data).where(eq(albums.id, c.req.param("id")));
  return c.json({ ok: true });
});

albumRoutes.delete("/:id", async (c) => {
  const u = c.get("user")!;
  await ownedAlbum(u.id, c.req.param("id"));
  await db.delete(albums).where(eq(albums.id, c.req.param("id")));
  return c.json({ ok: true });
});

const addSchema = z.object({ photoId: z.string().uuid() });

/** Add one of the caller's own photos to their album. */
albumRoutes.post("/:id/photos", async (c) => {
  const u = c.get("user")!;
  const albumId = c.req.param("id");
  await ownedAlbum(u.id, albumId);
  const body = addSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HTTPException(400, { message: "photoId required" });

  const [photo] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.id, body.data.photoId), eq(photos.userId, u.id)));
  if (!photo) throw new HTTPException(404, { message: "Photo not found" });

  await db
    .insert(albumPhotos)
    .values({ albumId, photoId: body.data.photoId })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

albumRoutes.delete("/:id/photos/:photoId", async (c) => {
  const u = c.get("user")!;
  const albumId = c.req.param("id");
  await ownedAlbum(u.id, albumId);
  await db
    .delete(albumPhotos)
    .where(
      and(
        eq(albumPhotos.albumId, albumId),
        eq(albumPhotos.photoId, c.req.param("photoId")),
      ),
    );
  return c.json({ ok: true });
});

import { hasAtLeastRole } from "@laqta/core";
import { comments, db, photoLikes, photos, user as userTable } from "@laqta/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";

/** Likes and comments for published photos. */
export const engagementRoutes = new Hono<AppEnv>();

/** Auto-hide a comment once this many reports accumulate. */
const REPORT_HIDE_THRESHOLD = 3;

async function publishedPhotoBySlug(slug: string) {
  const [p] = await db
    .select({ id: photos.id, status: photos.status })
    .from(photos)
    .where(eq(photos.slug, slug));
  if (!p || p.status !== "published") {
    throw new HTTPException(404, { message: "Photo not found" });
  }
  return p;
}

// ── Likes ─────────────────────────────────────────────────────────────────
engagementRoutes.post("/photos/:slug/like", requireAuth, async (c) => {
  const u = c.get("user")!;
  const p = await publishedPhotoBySlug(c.req.param("slug"));
  const inserted = await db
    .insert(photoLikes)
    .values({ userId: u.id, photoId: p.id })
    .onConflictDoNothing()
    .returning({ userId: photoLikes.userId });
  if (inserted.length > 0) {
    await db
      .update(photos)
      .set({ likesCount: sql`${photos.likesCount} + 1` })
      .where(eq(photos.id, p.id));
  }
  const [row] = await db
    .select({ likes: photos.likesCount })
    .from(photos)
    .where(eq(photos.id, p.id));
  return c.json({ liked: true, likes: row!.likes });
});

engagementRoutes.delete("/photos/:slug/like", requireAuth, async (c) => {
  const u = c.get("user")!;
  const p = await publishedPhotoBySlug(c.req.param("slug"));
  const deleted = await db
    .delete(photoLikes)
    .where(and(eq(photoLikes.userId, u.id), eq(photoLikes.photoId, p.id)))
    .returning({ userId: photoLikes.userId });
  if (deleted.length > 0) {
    await db
      .update(photos)
      .set({ likesCount: sql`GREATEST(${photos.likesCount} - 1, 0)` })
      .where(eq(photos.id, p.id));
  }
  const [row] = await db
    .select({ likes: photos.likesCount })
    .from(photos)
    .where(eq(photos.id, p.id));
  return c.json({ liked: false, likes: row!.likes });
});

// ── Comments ────────────────────────────────────────────────────────────────
engagementRoutes.get("/photos/:slug/comments", async (c) => {
  const p = await publishedPhotoBySlug(c.req.param("slug"));
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: userTable.displayName,
      authorReal: userTable.name,
    })
    .from(comments)
    .innerJoin(userTable, eq(comments.userId, userTable.id))
    .where(and(eq(comments.photoId, p.id), eq(comments.status, "visible")))
    .orderBy(desc(comments.createdAt))
    .limit(200);
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: r.authorName ?? r.authorReal,
    })),
  });
});

const commentSchema = z.object({ body: z.string().min(1).max(2000) });

engagementRoutes.post("/photos/:slug/comments", requireAuth, async (c) => {
  const u = c.get("user")!;
  const p = await publishedPhotoBySlug(c.req.param("slug"));
  const parsed = commentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Empty comment" });
  const [row] = await db
    .insert(comments)
    .values({ photoId: p.id, userId: u.id, body: parsed.data.body.trim() })
    .returning({ id: comments.id, createdAt: comments.createdAt });
  return c.json(
    { id: row!.id, body: parsed.data.body.trim(), createdAt: row!.createdAt, author: u.displayName ?? u.name },
    201,
  );
});

/** Delete own comment, or any comment as a moderator. */
engagementRoutes.delete("/comments/:id", requireAuth, async (c) => {
  const u = c.get("user")!;
  const id = c.req.param("id");
  const [cm] = await db
    .select({ id: comments.id, userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, id));
  if (!cm) throw new HTTPException(404, { message: "Comment not found" });
  const isOwner = cm.userId === u.id;
  const isMod = hasAtLeastRole(u.role, "moderator");
  if (!isOwner && !isMod) throw new HTTPException(403, { message: "Forbidden" });
  await db
    .update(comments)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(eq(comments.id, id));
  return c.json({ ok: true });
});

/** Report a comment; auto-hide once the threshold is crossed. */
engagementRoutes.post("/comments/:id/report", requireAuth, async (c) => {
  const id = c.req.param("id");
  const [row] = await db
    .update(comments)
    .set({ reportCount: sql`${comments.reportCount} + 1` })
    .where(eq(comments.id, id))
    .returning({ reportCount: comments.reportCount });
  if (!row) throw new HTTPException(404, { message: "Comment not found" });
  if (row.reportCount >= REPORT_HIDE_THRESHOLD) {
    await db.update(comments).set({ status: "hidden" }).where(eq(comments.id, id));
  }
  return c.json({ ok: true, reports: row.reportCount });
});

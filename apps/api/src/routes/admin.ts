import {
  type PhotoStatus,
  type UserRole,
  hasAtLeastRole,
  slugify,
} from "@laqta/core";
import {
  categories,
  db,
  moderationEvents,
  photoRenditions,
  photos,
  user as userTable,
} from "@laqta/db";
import { enqueue } from "@laqta/queue";
import { publicUrl, renditionKey } from "@laqta/storage";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireRole } from "../middleware/guards.ts";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireRole("moderator"));

/** Moderation queue: pending or flagged photos with their latest AI verdict. */
adminRoutes.get("/queue", async (c) => {
  const status = (c.req.query("status") ?? "pending") as PhotoStatus;
  if (status !== "pending" && status !== "flagged") {
    throw new HTTPException(400, { message: "status must be pending|flagged" });
  }
  const rows = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      blurhash: photos.blurhash,
      createdAt: photos.createdAt,
      ownerName: userTable.displayName,
      ownerId: userTable.id,
    })
    .from(photos)
    .innerJoin(userTable, eq(photos.userId, userTable.id))
    .where(eq(photos.status, status))
    .orderBy(desc(photos.createdAt))
    .limit(100);

  // Attach latest AI verdict + a thumb URL for each.
  const items = await Promise.all(
    rows.map(async (p) => {
      const [ev] = await db
        .select({ verdict: moderationEvents.verdict, scores: moderationEvents.scores, reason: moderationEvents.reason })
        .from(moderationEvents)
        .where(
          and(
            eq(moderationEvents.photoId, p.id),
            eq(moderationEvents.source, "ai"),
          ),
        )
        .orderBy(desc(moderationEvents.createdAt))
        .limit(1);
      return {
        ...p,
        thumbUrl: publicUrl(renditionKey(p.id, "thumb", "webp")),
        ai: ev ?? null,
      };
    }),
  );
  return c.json({ status, items });
});

/** Approve a photo → publish + post-publish fan-out (same as trusted flow). */
adminRoutes.post("/photos/:id/approve", async (c) => {
  const mod = c.get("user")!;
  const id = c.req.param("id");
  const [p] = await db
    .select({ id: photos.id, status: photos.status, altAr: photos.altAr })
    .from(photos)
    .where(eq(photos.id, id));
  if (!p) throw new HTTPException(404, { message: "Photo not found" });

  await db
    .update(photos)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(photos.id, id));
  await db.insert(moderationEvents).values({
    photoId: id,
    source: "admin",
    verdict: "approved",
    moderatorId: mod.id,
  });
  await enqueue("embed", { photoId: id });
  if (!p.altAr) await enqueue("generate_alt", { photoId: id });
  await enqueue("index_search", { photoId: id });
  return c.json({ ok: true });
});

const rejectSchema = z.object({ reason: z.string().max(500).optional() });

/** Reject → delete objects + deindex, record the reason. */
adminRoutes.post("/photos/:id/reject", async (c) => {
  const mod = c.get("user")!;
  const id = c.req.param("id");
  const body = rejectSchema.safeParse(await c.req.json().catch(() => ({})));
  const [p] = await db
    .select({ id: photos.id, originalKey: photos.originalKey })
    .from(photos)
    .where(eq(photos.id, id));
  if (!p) throw new HTTPException(404, { message: "Photo not found" });

  const rends = await db
    .select({ key: photoRenditions.key })
    .from(photoRenditions)
    .where(eq(photoRenditions.photoId, id));

  await db
    .update(photos)
    .set({ status: "rejected" })
    .where(eq(photos.id, id));
  await db.insert(moderationEvents).values({
    photoId: id,
    source: "admin",
    verdict: "rejected",
    reason: body.success ? body.data.reason : undefined,
    moderatorId: mod.id,
  });
  await enqueue("purge_r2", {
    keys: [p.originalKey, ...rends.map((r) => r.key)],
  });
  await enqueue("deindex_search", { photoId: id });
  return c.json({ ok: true });
});

const promoteSchema = z.object({
  role: z.enum(["registered", "trusted", "moderator", "admin"]),
});

/** Change a user's role. Moderators can only grant up to `trusted`; admins any. */
adminRoutes.post("/users/:id/role", async (c) => {
  const actor = c.get("user")!;
  const targetId = c.req.param("id");
  const body = promoteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HTTPException(400, { message: "Invalid role" });
  const role = body.data.role as UserRole;

  const grantsAdminTier = hasAtLeastRole(role, "moderator");
  if (grantsAdminTier && actor.role !== "admin") {
    throw new HTTPException(403, {
      message: "Only admins can grant moderator/admin",
    });
  }
  await db.update(userTable).set({ role }).where(eq(userTable.id, targetId));
  return c.json({ ok: true, role });
});

adminRoutes.post("/users/:id/block", async (c) => {
  await db
    .update(userTable)
    .set({ blockedAt: new Date() })
    .where(eq(userTable.id, c.req.param("id")));
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/unblock", async (c) => {
  await db
    .update(userTable)
    .set({ blockedAt: null })
    .where(eq(userTable.id, c.req.param("id")));
  return c.json({ ok: true });
});

const categorySchema = z.object({
  slug: z.string().min(1).max(60).optional(),
  nameAr: z.string().min(1).max(80),
  nameEn: z.string().min(1).max(80),
});

adminRoutes.post("/categories", async (c) => {
  const body = categorySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HTTPException(400, { message: "Invalid category" });
  const slug = body.data.slug ?? slugify(body.data.nameEn);
  const [row] = await db
    .insert(categories)
    .values({ slug, nameAr: body.data.nameAr, nameEn: body.data.nameEn })
    .onConflictDoUpdate({
      target: categories.slug,
      set: { nameAr: body.data.nameAr, nameEn: body.data.nameEn },
    })
    .returning();
  return c.json({ ok: true, category: row });
});

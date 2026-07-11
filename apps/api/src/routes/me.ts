import { db, photoRenditions, photos, user as userTable } from "@laqta/db";
import { enqueue } from "@laqta/queue";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use("*", requireAuth);

/** Current profile (self — includes private email, which the public API omits). */
meRoutes.get("/", (c) => {
  const u = c.get("user")!;
  return c.json({
    id: u.id,
    email: u.email,
    name: u.name,
    displayName: u.displayName,
    role: u.role,
  });
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  creditFormat: z.string().max(200).optional(),
});

/** Update editable profile fields. Role is never client-settable. */
meRoutes.patch("/", async (c) => {
  const u = c.get("user")!;
  const body = profileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw new HTTPException(400, { message: "Invalid profile fields" });
  }
  await db.update(userTable).set(body.data).where(eq(userTable.id, u.id));
  return c.json({ ok: true });
});

/**
 * Right-to-be-forgotten: enqueue deletion of every stored object, deindex
 * search documents, then hard-delete the user (cascades photos, sessions,
 * likes, comments, albums, api keys). Irreversible.
 */
meRoutes.delete("/account", async (c) => {
  const u = c.get("user")!;

  const owned = await db
    .select({ id: photos.id, originalKey: photos.originalKey })
    .from(photos)
    .where(eq(photos.userId, u.id));

  const renditionRows = await db
    .select({ key: photoRenditions.key })
    .from(photoRenditions)
    .innerJoin(photos, eq(photoRenditions.photoId, photos.id))
    .where(eq(photos.userId, u.id));

  const keys = [
    ...owned.map((p) => p.originalKey),
    ...renditionRows.map((r) => r.key),
  ];
  if (keys.length > 0) await enqueue("purge_r2", { keys });
  for (const p of owned) await enqueue("deindex_search", { photoId: p.id });

  await db.delete(userTable).where(eq(userTable.id, u.id));
  return c.json({ ok: true, deletedPhotos: owned.length });
});

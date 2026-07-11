/**
 * Engagement tests: likes (idempotent + counts), comments (create/list/delete/
 * report-autohide), and owner caption editing. Real Postgres/Redis.
 */
import { comments, db, photos, sql, user as userTable } from "@laqta/db";
import { pipelineQueue } from "@laqta/queue";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, CtxUser } from "../context.ts";
import { engagementRoutes } from "./engagement.ts";
import { ownerPhotoRoutes } from "./owner-photos.ts";

let currentUser: CtxUser | null = null;
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", currentUser);
  await next();
});
app.route("/", engagementRoutes);
app.route("/me/photos", ownerPhotoRoutes);

const OWNER = "eng-owner";
const A = "eng-user-a";
const B = "eng-user-b";
const MOD = "eng-mod";
const users: Record<string, CtxUser> = {
  [A]: { id: A, email: "a@t.local", name: "A", displayName: "أ", role: "registered", blockedAt: null },
  [B]: { id: B, email: "b@t.local", name: "B", displayName: "ب", role: "registered", blockedAt: null },
  [MOD]: { id: MOD, email: "m@t.local", name: "M", displayName: "مشرف", role: "moderator", blockedAt: null },
  [OWNER]: { id: OWNER, email: "o@t.local", name: "O", displayName: "مالك", role: "registered", blockedAt: null },
};
let slug: string;
let photoId: string;

beforeAll(async () => {
  await db
    .insert(userTable)
    .values(
      [OWNER, A, B, MOD].map((id) => ({
        id,
        name: id,
        email: `${id}@t.local`,
        displayName: users[id]!.displayName,
        role: users[id]!.role,
      })),
    )
    .onConflictDoNothing();
  photoId = crypto.randomUUID();
  slug = `eng-${photoId.slice(0, 8)}`;
  await db.insert(photos).values({
    id: photoId,
    userId: OWNER,
    slug,
    originalKey: `originals/${photoId}.jpg`,
    titleAr: "صورة",
    status: "published",
    publishedAt: new Date(),
  });
});

afterAll(async () => {
  for (const id of [OWNER, A, B, MOD]) await db.delete(userTable).where(eq(userTable.id, id));
  await pipelineQueue.obliterate({ force: true });
});

describe("likes", () => {
  test("like is idempotent and count is accurate", async () => {
    currentUser = users[A]!;
    let res = await app.request(`/photos/${slug}/like`, { method: "POST" });
    expect((await res.json()).likes).toBe(1);
    // same user likes again → still 1
    res = await app.request(`/photos/${slug}/like`, { method: "POST" });
    expect((await res.json()).likes).toBe(1);

    currentUser = users[B]!;
    res = await app.request(`/photos/${slug}/like`, { method: "POST" });
    expect((await res.json()).likes).toBe(2);

    currentUser = users[A]!;
    res = await app.request(`/photos/${slug}/like`, { method: "DELETE" });
    const body = await res.json();
    expect(body.liked).toBe(false);
    expect(body.likes).toBe(1);
  });

  test("guest cannot like", async () => {
    currentUser = null;
    const res = await app.request(`/photos/${slug}/like`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("comments", () => {
  test("post, list, owner-delete", async () => {
    currentUser = users[A]!;
    const post = await app.request(`/photos/${slug}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "صورة جميلة" }),
    });
    expect(post.status).toBe(201);
    const created = await post.json();

    // public list shows it
    currentUser = null;
    let list = await (await app.request(`/photos/${slug}/comments`)).json();
    expect(list.items.some((c: any) => c.id === created.id)).toBe(true);

    // author deletes own
    currentUser = users[A]!;
    const del = await app.request(`/comments/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    currentUser = null;
    list = await (await app.request(`/photos/${slug}/comments`)).json();
    expect(list.items.some((c: any) => c.id === created.id)).toBe(false);
  });

  test("non-owner cannot delete; moderator can", async () => {
    currentUser = users[A]!;
    const created = await (
      await app.request(`/photos/${slug}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "تعليق آخر" }),
      })
    ).json();

    currentUser = users[B]!; // not owner, not mod
    let del = await app.request(`/comments/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(403);

    currentUser = users[MOD]!;
    del = await app.request(`/comments/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
  });

  test("3 reports auto-hide a comment", async () => {
    currentUser = users[A]!;
    const created = await (
      await app.request(`/photos/${slug}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "تعليق مُبلَّغ عنه" }),
      })
    ).json();

    for (const u of [A, B, MOD]) {
      currentUser = users[u]!;
      await app.request(`/comments/${created.id}/report`, { method: "POST" });
    }
    const [row] = await db.select().from(comments).where(eq(comments.id, created.id));
    expect(row!.status).toBe("hidden");
  });
});

describe("owner caption edit", () => {
  test("updates caption and re-indexes published photo", async () => {
    currentUser = users[OWNER]!;
    await pipelineQueue.obliterate({ force: true });
    const res = await app.request(`/me/photos/${photoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captionAr: "تعليق توضيحي جديد" }),
    });
    expect(res.status).toBe(200);
    const [p] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(p!.captionAr).toBe("تعليق توضيحي جديد");
    const names = (await pipelineQueue.getWaiting()).map((j) => j.name);
    expect(names).toContain("index_search");

    // a different user cannot edit it
    currentUser = users[B]!;
    const forbidden = await app.request(`/me/photos/${photoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captionAr: "hack" }),
    });
    expect(forbidden.status).toBe(404);
  });
});

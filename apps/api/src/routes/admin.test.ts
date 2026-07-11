/**
 * Admin route integration tests. Exercises the real route handlers + role
 * guards by injecting the session user directly (rather than minting Better
 * Auth cookies). Uses the real Postgres/Redis from docker-compose.
 */
import {
  db,
  moderationEvents,
  photoRenditions,
  photos,
  sql,
  user as userTable,
} from "@laqta/db";
import { pipelineQueue } from "@laqta/queue";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, CtxUser } from "../context.ts";
import { adminRoutes } from "./admin.ts";

// Injected session for the test harness.
let currentUser: CtxUser | null = null;

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", currentUser);
  await next();
});
app.route("/admin", adminRoutes);

const MOD = "test-mod";
const OWNER = "test-owner";
const modUser: CtxUser = {
  id: MOD,
  email: "m@test.local",
  name: "Mod",
  displayName: "Mod",
  role: "moderator",
  blockedAt: null,
};

async function makePendingPhoto(status: "pending" | "flagged" = "pending") {
  const id = crypto.randomUUID();
  await db.insert(photos).values({
    id,
    userId: OWNER,
    slug: id,
    originalKey: `originals/${id}.jpg`,
    titleAr: "اختبار",
    status,
  });
  for (const variant of ["thumb", "medium"] as const) {
    await db.insert(photoRenditions).values({
      photoId: id,
      variant,
      key: `renditions/${id}/${variant}.webp`,
      width: 400,
      height: 300,
      format: "webp",
      bytes: 100,
    });
  }
  await db.insert(moderationEvents).values({
    photoId: id,
    source: "ai",
    verdict: "clean",
    scores: { nsfw: false, on_topic: true, confidence: 0.9 },
    reason: "ok",
  });
  return id;
}

beforeAll(async () => {
  await pipelineQueue.obliterate({ force: true });
  await db
    .insert(userTable)
    .values([
      { id: MOD, name: "Mod", email: "m@test.local", role: "moderator" },
      { id: OWNER, name: "Owner", email: "o@test.local", role: "registered" },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, MOD));
  await db.delete(userTable).where(eq(userTable.id, OWNER));
  await pipelineQueue.obliterate({ force: true });
});

describe("admin guards", () => {
  test("unauthenticated → 401", async () => {
    currentUser = null;
    const res = await app.request("/admin/queue");
    expect(res.status).toBe(401);
  });

  test("non-moderator → 403", async () => {
    currentUser = { ...modUser, role: "registered" };
    const res = await app.request("/admin/queue");
    expect(res.status).toBe(403);
  });
});

describe("moderation queue", () => {
  test("lists pending photos with AI verdict + thumb", async () => {
    currentUser = modUser;
    const id = await makePendingPhoto();
    const res = await app.request("/admin/queue?status=pending");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; ai: unknown; thumbUrl: string }[] };
    const found = body.items.find((i) => i.id === id);
    expect(found).toBeTruthy();
    expect(found!.ai).toBeTruthy();
    expect(found!.thumbUrl).toContain(`/renditions/${id}/thumb.webp`);
  });
});

describe("approve / reject", () => {
  test("approve → published + fan-out jobs", async () => {
    currentUser = modUser;
    await pipelineQueue.obliterate({ force: true });
    const id = await makePendingPhoto();
    const res = await app.request(`/admin/photos/${id}/approve`, { method: "POST" });
    expect(res.status).toBe(200);

    const [p] = await db.select().from(photos).where(eq(photos.id, id));
    expect(p!.status).toBe("published");
    expect(p!.publishedAt).not.toBeNull();

    const names = (await pipelineQueue.getWaiting()).map((j) => j.name);
    expect(names).toContain("embed");
    expect(names).toContain("index_search");

    const [ev] = await db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.photoId, id));
    expect(names).toContain("generate_alt"); // no alt set → generated
    expect(ev).toBeTruthy();
  });

  test("reject → rejected + purge_r2 + deindex", async () => {
    currentUser = modUser;
    await pipelineQueue.obliterate({ force: true });
    const id = await makePendingPhoto();
    const res = await app.request(`/admin/photos/${id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "off-topic" }),
    });
    expect(res.status).toBe(200);

    const [p] = await db.select().from(photos).where(eq(photos.id, id));
    expect(p!.status).toBe("rejected");

    const jobs = await pipelineQueue.getWaiting();
    const purge = jobs.find((j) => j.name === "purge_r2");
    expect(purge).toBeTruthy();
    expect((purge!.data as { keys: string[] }).keys).toContain(`originals/${id}.jpg`);
    expect(jobs.map((j) => j.name)).toContain("deindex_search");
  });
});

describe("user management", () => {
  test("moderator cannot grant moderator; admin can", async () => {
    currentUser = modUser; // moderator
    let res = await app.request(`/admin/users/${OWNER}/role`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "moderator" }),
    });
    expect(res.status).toBe(403);

    // moderator CAN grant trusted
    res = await app.request(`/admin/users/${OWNER}/role`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "trusted" }),
    });
    expect(res.status).toBe(200);
    const [u] = await db.select().from(userTable).where(eq(userTable.id, OWNER));
    expect(u!.role).toBe("trusted");
  });

  test("block / unblock sets blockedAt", async () => {
    currentUser = modUser;
    await app.request(`/admin/users/${OWNER}/block`, { method: "POST" });
    let [u] = await db.select().from(userTable).where(eq(userTable.id, OWNER));
    expect(u!.blockedAt).not.toBeNull();
    await app.request(`/admin/users/${OWNER}/unblock`, { method: "POST" });
    [u] = await db.select().from(userTable).where(eq(userTable.id, OWNER));
    expect(u!.blockedAt).toBeNull();
  });
});

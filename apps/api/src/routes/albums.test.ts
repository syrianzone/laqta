/** Albums: owner CRUD + membership + public view. Real Postgres. */
import { db, photos, user as userTable } from "@laqta/db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, CtxUser } from "../context.ts";
import { albumRoutes } from "./albums.ts";
import { ssrRoutes } from "./ssr.ts";

let currentUser: CtxUser | null = null;
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", currentUser);
  await next();
});
app.route("/me/albums", albumRoutes);
app.route("/ssr", ssrRoutes);

const OWNER = "album-owner";
const OTHER = "album-other";
const ownerU: CtxUser = { id: OWNER, email: "o@t.local", name: "O", displayName: "مالك", role: "registered", blockedAt: null };
const otherU: CtxUser = { id: OTHER, email: "x@t.local", name: "X", displayName: "غريب", role: "registered", blockedAt: null };
let photoId: string;

beforeAll(async () => {
  await db
    .insert(userTable)
    .values([
      { id: OWNER, name: "O", email: "o@t.local", displayName: "مالك" },
      { id: OTHER, name: "X", email: "x@t.local", displayName: "غريب" },
    ])
    .onConflictDoNothing();
  photoId = crypto.randomUUID();
  await db.insert(photos).values({
    id: photoId,
    userId: OWNER,
    slug: `alb-${photoId.slice(0, 8)}`,
    originalKey: `originals/${photoId}.jpg`,
    titleAr: "صورة الألبوم",
    status: "published",
    publishedAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, OWNER));
  await db.delete(userTable).where(eq(userTable.id, OTHER));
});

describe("albums", () => {
  test("create → add own photo → count → public view", async () => {
    currentUser = ownerU;
    const create = await app.request("/me/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titleAr: "رحلة إلى حلب" }),
    });
    expect(create.status).toBe(201);
    const album = (await create.json()) as { id: string };

    const add = await app.request(`/me/albums/${album.id}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
    expect(add.status).toBe(200);

    const list = (await (await app.request("/me/albums")).json()) as {
      items: { id: string; count: number }[];
    };
    expect(list.items.find((a) => a.id === album.id)?.count).toBe(1);

    // public view (no auth)
    currentUser = null;
    const view = (await (await app.request(`/ssr/albums/${album.id}`)).json()) as {
      items: { slug: string }[];
    };
    expect(view.items.length).toBe(1);
  });

  test("cannot add someone else's photo", async () => {
    currentUser = otherU;
    const create = await app.request("/me/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titleAr: "ألبوم غريب" }),
    });
    const album = (await create.json()) as { id: string };
    const add = await app.request(`/me/albums/${album.id}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoId }), // owned by OWNER, not OTHER
    });
    expect(add.status).toBe(404);
  });

  test("cannot manage another user's album", async () => {
    currentUser = ownerU;
    const create = await app.request("/me/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titleAr: "خاص" }),
    });
    const album = (await create.json()) as { id: string };
    currentUser = otherU;
    const del = await app.request(`/me/albums/${album.id}`, { method: "DELETE" });
    expect(del.status).toBe(404);
  });
});

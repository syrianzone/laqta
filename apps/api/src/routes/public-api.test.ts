/**
 * Public developer API + key management tests. Real Postgres/Redis.
 * Session-guarded /me/api-keys uses an injected session; /api/v1 uses the
 * api-key header (no session).
 */
import { apiKeys, db, photos, sql, user as userTable } from "@laqta/db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, CtxUser } from "../context.ts";
import { generateApiKey } from "../lib/apikey.ts";
import { apiKeyRoutes } from "./api-keys.ts";
import { publicApiRoutes } from "./public-api.ts";

let currentUser: CtxUser | null = null;
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", currentUser);
  await next();
});
app.route("/me/api-keys", apiKeyRoutes);
app.route("/api/v1", publicApiRoutes);

const OWNER = "pub-api-owner";
const OWNER_EMAIL = "secret-email@test.local";
const ownerSession: CtxUser = {
  id: OWNER,
  email: OWNER_EMAIL,
  name: "Owner",
  displayName: "المصوّر",
  role: "registered",
  blockedAt: null,
};
let photoSlug: string;

async function makeKey(rateLimit: number): Promise<string> {
  const k = generateApiKey();
  await db
    .insert(apiKeys)
    .values({ userId: OWNER, name: "t", prefix: k.prefix, keyHash: k.keyHash, rateLimit });
  return k.fullKey;
}

beforeAll(async () => {
  await db
    .insert(userTable)
    .values({
      id: OWNER,
      name: "Owner",
      email: OWNER_EMAIL,
      displayName: "المصوّر",
      creditFormat: "Owner Portfolio",
    })
    .onConflictDoNothing();

  const id = crypto.randomUUID();
  photoSlug = `pub-${id.slice(0, 8)}`;
  await db.insert(photos).values({
    id,
    userId: OWNER,
    slug: photoSlug,
    originalKey: `originals/${id}.jpg`,
    titleAr: "صورة عامة",
    license: "cc-by",
    status: "published",
    publishedAt: new Date(),
    width: 1000,
    height: 800,
  });
});

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, OWNER));
});

describe("key management (/me/api-keys)", () => {
  test("create returns the secret once; list never does; revoke works", async () => {
    currentUser = ownerSession;

    const createRes = await app.request("/me/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "my app" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; key: string };
    expect(created.key).toMatch(/^laqta_[A-Za-z0-9]{8}_/);

    const listRes = await app.request("/me/api-keys");
    const list = (await listRes.json()) as { items: Record<string, unknown>[] };
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list.items)).not.toContain(created.key);

    // Use the key against the public API — works.
    let apiRes = await app.request("/api/v1/categories", {
      headers: { authorization: `Bearer ${created.key}` },
    });
    expect(apiRes.status).toBe(200);

    // Revoke → key rejected.
    const revoke = await app.request(`/me/api-keys/${created.id}`, {
      method: "DELETE",
    });
    expect(revoke.status).toBe(200);
    apiRes = await app.request("/api/v1/categories", {
      headers: { authorization: `Bearer ${created.key}` },
    });
    expect(apiRes.status).toBe(401);
  });
});

describe("public API auth + rate limiting", () => {
  test("missing key → 401", async () => {
    const res = await app.request("/api/v1/photos");
    expect(res.status).toBe(401);
  });

  test("valid key → 200 with rate-limit headers", async () => {
    const key = await makeKey(60);
    const res = await app.request("/api/v1/photos", {
      headers: { "x-api-key": key },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).not.toBeNull();
  });

  test("exceeding the per-key limit → 429", async () => {
    const key = await makeKey(2);
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/api/v1/photos", {
        headers: { "x-api-key": key },
      });
      codes.push(res.status);
    }
    expect(codes.filter((s) => s === 200).length).toBe(2);
    expect(codes).toContain(429);
  });
});

describe("no personal data leaks", () => {
  test("photo detail exposes credit but not email", async () => {
    const key = await makeKey(100);
    const res = await app.request(`/api/v1/photos/${photoSlug}`, {
      headers: { "x-api-key": key },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(OWNER_EMAIL);
    expect(text).not.toContain(OWNER); // internal user id
    const body = JSON.parse(text) as { credit: string; creator: { name: string } };
    expect(body.creator.name).toBe("المصوّر");
    expect(body.credit).toContain("Owner Portfolio");
  });
});

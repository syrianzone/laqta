/**
 * Search integration tests: keyword search + vector "similar images".
 * Indexes docs directly into Typesense (with embeddings) and creates matching
 * photo rows so the similar-by-slug route can resolve ids. Real Typesense/PG.
 */
import { EMBEDDING_DIM } from "@laqta/core";
import { db, photos, sql, user as userTable } from "@laqta/db";
import {
  PHOTOS_COLLECTION,
  type PhotoDocument,
  client as tsClient,
  ensureCollection,
  indexPhoto,
} from "@laqta/search";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { ssrRoutes } from "./ssr.ts";

const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("user", null);
  await next();
});
app.route("/ssr", ssrRoutes);

const OWNER = "search-test-owner";
const ids: Record<string, string> = {};

function vec(...set: [number, number][]): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0);
  for (const [i, val] of set) v[i] = val;
  return v;
}

async function seedPhoto(
  slug: string,
  titleAr: string,
  embedding: number[],
): Promise<string> {
  const id = crypto.randomUUID();
  ids[slug] = id;
  await db.insert(photos).values({
    id,
    userId: OWNER,
    slug,
    originalKey: `originals/${id}.jpg`,
    titleAr,
    status: "published",
    publishedAt: new Date(),
  });
  const doc: PhotoDocument = {
    id,
    slug,
    title_ar: titleAr,
    license: "cc-by",
    published_at: Math.floor(Date.now() / 1000),
    popularity: 1,
    embedding,
  };
  await indexPhoto(doc);
  return id;
}

async function waitIndexed(id: string) {
  for (let i = 0; i < 20; i++) {
    try {
      await tsClient.collections(PHOTOS_COLLECTION).documents(id).retrieve();
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`doc ${id} not indexed`);
}

beforeAll(async () => {
  await ensureCollection();
  await db
    .insert(userTable)
    .values({ id: OWNER, name: "S", email: "s@test.local", displayName: "S" })
    .onConflictDoNothing();
  await seedPhoto("citadel-near", "قلعة حلب الشهباء", vec([0, 1.0]));
  await seedPhoto("citadel-far", "قلعة دمشق", vec([0, 0.98], [1, 0.05]));
  await seedPhoto("food-unrelated", "طعام سوري", vec([500, 1.0]));
  for (const id of Object.values(ids)) await waitIndexed(id);
});

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, OWNER)); // cascades photos
  for (const id of Object.values(ids)) {
    try {
      await tsClient.collections(PHOTOS_COLLECTION).documents(id).delete();
    } catch {}
  }
});

describe("keyword search", () => {
  test("finds photos by Arabic title token", async () => {
    const res = await app.request("/ssr/search?q=قلعة");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      found: number;
      items: { slug: string }[];
    };
    expect(body.found).toBeGreaterThanOrEqual(2);
    const slugs = body.items.map((i) => i.slug);
    expect(slugs).toContain("citadel-near");
    expect(slugs).toContain("citadel-far");
  });

  test("empty query returns empty result set", async () => {
    const res = await app.request("/ssr/search?q=");
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBe(0);
  });
});

describe("similar images (vector NN)", () => {
  test("nearest neighbor by embedding, excluding the source", async () => {
    const res = await app.request("/ssr/photos/citadel-near/similar");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { slug: string }[] };
    const slugs = body.items.map((i) => i.slug);
    expect(slugs).not.toContain("citadel-near"); // source excluded
    // The near-duplicate vector should rank first.
    expect(slugs[0]).toBe("citadel-far");
  });
});

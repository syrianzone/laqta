/**
 * Integration tests for the Phase 4 pipeline handlers. Uses the real
 * Postgres/Redis/Typesense from docker-compose; mocks ONLY the OpenRouter HTTP
 * layer (no real AI key needed locally).
 */
import { EMBEDDING_DIM } from "@laqta/core";
import {
  categories,
  db,
  moderationEvents,
  photoRenditions,
  photos,
  sql,
  user,
} from "@laqta/db";
import { drainCounters, incrementCounter, pipelineQueue } from "@laqta/queue";
import { PHOTOS_COLLECTION, client as tsClient } from "@laqta/search";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { embed } from "./embed.ts";
import { flushCounters } from "./flush-counters.ts";
import { indexSearch } from "./index-search.ts";
import { moderate } from "./moderate.ts";

const originalFetch = globalThis.fetch;

// Mock OpenRouter; passthrough everything else (Typesense/MinIO/etc.).
let verdictFlagged = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("openrouter.ai/api/v1/chat/completions")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const system = String(body.messages?.[0]?.content ?? "");
    const content = system.includes("alt text")
      ? JSON.stringify({ alt_ar: "منظر", alt_en: "a view" })
      : JSON.stringify({
          nsfw: verdictFlagged,
          violence: false,
          hate: false,
          on_topic: !verdictFlagged,
          confidence: 0.95,
          reason: "test",
        });
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { headers: { "content-type": "application/json" } },
    );
  }
  if (url.includes("openrouter.ai/api/v1/embeddings")) {
    return new Response(
      JSON.stringify({
        data: [{ embedding: Array(EMBEDDING_DIM).fill(0.0123) }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  return originalFetch(input, init);
}) as typeof fetch;

const TRUSTED = "test-trusted-user";
const REGULAR = "test-regular-user";
let categoryId: string;

async function makePhoto(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(photos).values({
    id,
    userId,
    slug: id,
    originalKey: `originals/${id}.jpg`,
    titleAr: "قلعة حلب",
    titleEn: "Aleppo Citadel",
    categoryId,
    status: "pending",
  });
  await db.insert(photoRenditions).values({
    photoId: id,
    variant: "medium",
    key: `renditions/${id}/medium.webp`,
    width: 1024,
    height: 768,
    format: "webp",
    bytes: 1000,
  });
  return id;
}

async function enqueuedNames(): Promise<string[]> {
  const jobs = await pipelineQueue.getWaiting();
  return jobs.map((j) => j.name);
}

beforeAll(async () => {
  await pipelineQueue.obliterate({ force: true });
  const [cat] = await db.select().from(categories).limit(1);
  categoryId = cat!.id;
  for (const [id, role] of [
    [TRUSTED, "trusted"],
    [REGULAR, "registered"],
  ] as const) {
    await db
      .insert(user)
      .values({
        id,
        name: id,
        email: `${id}@test.local`,
        displayName: id,
        role,
      })
      .onConflictDoUpdate({ target: user.id, set: { role } });
  }
});

afterAll(async () => {
  await db.delete(user).where(eq(user.id, TRUSTED));
  await db.delete(user).where(eq(user.id, REGULAR));
  await pipelineQueue.obliterate({ force: true });
  globalThis.fetch = originalFetch;
});

describe("moderate", () => {
  test("clean + trusted → published, fans out embed/alt/index", async () => {
    verdictFlagged = false;
    await pipelineQueue.obliterate({ force: true });
    const id = await makePhoto(TRUSTED);
    await moderate({ photoId: id });

    const [p] = await db.select().from(photos).where(eq(photos.id, id));
    expect(p!.status).toBe("published");
    expect(p!.publishedAt).not.toBeNull();

    const names = await enqueuedNames();
    expect(names).toContain("embed");
    expect(names).toContain("generate_alt");
    expect(names).toContain("index_search");

    const events = await db
      .select()
      .from(moderationEvents)
      .where(eq(moderationEvents.photoId, id));
    expect(events[0]!.verdict).toBe("clean");
  });

  test("clean + untrusted → pending (no publish)", async () => {
    verdictFlagged = false;
    const id = await makePhoto(REGULAR);
    await moderate({ photoId: id });
    const [p] = await db.select().from(photos).where(eq(photos.id, id));
    expect(p!.status).toBe("pending");
    expect(p!.publishedAt).toBeNull();
  });

  test("unsafe verdict → flagged", async () => {
    verdictFlagged = true;
    const id = await makePhoto(TRUSTED);
    await moderate({ photoId: id });
    const [p] = await db.select().from(photos).where(eq(photos.id, id));
    expect(p!.status).toBe("flagged");
  });
});

describe("embed", () => {
  test("stores a pgvector of the right dimension", async () => {
    const id = await makePhoto(TRUSTED);
    await embed({ photoId: id });
    const [p] = await db
      .select({ embedding: photos.embedding })
      .from(photos)
      .where(eq(photos.id, id));
    expect(p!.embedding).not.toBeNull();
    expect(p!.embedding!.length).toBe(EMBEDDING_DIM);
  });
});

describe("index_search", () => {
  test("published photo is indexed; unpublished is removed", async () => {
    const id = await makePhoto(TRUSTED);
    await db
      .update(photos)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(photos.id, id));
    await indexSearch({ photoId: id });
    const doc = await tsClient
      .collections(PHOTOS_COLLECTION)
      .documents(id)
      .retrieve();
    expect((doc as { slug: string }).slug).toBe(id);

    // Unpublish → indexSearch removes it.
    await db
      .update(photos)
      .set({ status: "flagged" })
      .where(eq(photos.id, id));
    await indexSearch({ photoId: id });
    expect(
      tsClient.collections(PHOTOS_COLLECTION).documents(id).retrieve(),
    ).rejects.toThrow();
  });
});

describe("flush_counters", () => {
  test("Redis view/download deltas land in Postgres", async () => {
    const id = await makePhoto(TRUSTED);
    await incrementCounter("views", id, "ip-1");
    await incrementCounter("views", id, "ip-1"); // deduped
    await incrementCounter("views", id, "ip-2");
    await incrementCounter("downloads", id, "ip-1");
    await flushCounters();
    const [p] = await db
      .select({ v: photos.viewsCount, d: photos.downloadsCount })
      .from(photos)
      .where(eq(photos.id, id));
    expect(p!.v).toBe(2); // ip-1 counted once + ip-2
    expect(p!.d).toBe(1);
  });
});

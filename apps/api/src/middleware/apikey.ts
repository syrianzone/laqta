import { apiKeys, db } from "@laqta/db";
import { connection } from "@laqta/queue";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context.ts";
import { keyPrefix, sha256Hex } from "../lib/apikey.ts";

/**
 * Authenticates a developer API key and enforces a per-key, per-minute rate
 * limit in Redis. Sets `X-RateLimit-*` headers and attaches the key to context.
 * Harvest protection: every public API call must present a valid key.
 */
export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header =
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    c.req.header("x-api-key") ??
    "";
  const prefix = keyPrefix(header);
  if (!prefix) {
    throw new HTTPException(401, { message: "Missing or malformed API key" });
  }

  const [key] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      keyHash: apiKeys.keyHash,
      rateLimit: apiKeys.rateLimit,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)));

  if (!key || sha256Hex(header) !== key.keyHash) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }

  // Fixed-window rate limit: one Redis counter per key per minute.
  const windowStart = Math.floor(Date.now() / 60000);
  const rlKey = `ratelimit:api:${key.id}:${windowStart}`;
  const count = await connection.incr(rlKey);
  if (count === 1) await connection.expire(rlKey, 60);

  const remaining = Math.max(0, key.rateLimit - count);
  c.header("X-RateLimit-Limit", String(key.rateLimit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String((windowStart + 1) * 60));

  if (count > key.rateLimit) {
    throw new HTTPException(429, { message: "Rate limit exceeded" });
  }

  c.set("apiKey", { id: key.id, userId: key.userId });
  // Best-effort last-used timestamp (fire and forget).
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  await next();
});

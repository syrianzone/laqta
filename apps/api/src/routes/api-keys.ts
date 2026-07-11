import { apiKeys, db } from "@laqta/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { requireAuth } from "../middleware/guards.ts";
import { generateApiKey } from "../lib/apikey.ts";

export const apiKeyRoutes = new Hono<AppEnv>();
apiKeyRoutes.use("*", requireAuth);

/** List the caller's keys (never returns the secret). */
apiKeyRoutes.get("/", async (c) => {
  const u = c.get("user")!;
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      rateLimit: apiKeys.rateLimit,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, u.id))
    .orderBy(desc(apiKeys.createdAt));
  return c.json({ items: rows });
});

const createSchema = z.object({ name: z.string().min(1).max(80) });

/** Create a key. The full secret is returned exactly once here. */
apiKeyRoutes.post("/", async (c) => {
  const u = c.get("user")!;
  const body = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw new HTTPException(400, { message: "Name required" });

  const { fullKey, prefix, keyHash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ userId: u.id, name: body.data.name, prefix, keyHash })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix });

  return c.json({ ...row, key: fullKey }, 201);
});

/** Revoke a key (soft — sets revokedAt). */
apiKeyRoutes.delete("/:id", async (c) => {
  const u = c.get("user")!;
  const id = c.req.param("id");
  const res = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, u.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (res.length === 0) throw new HTTPException(404, { message: "Key not found" });
  return c.json({ ok: true });
});

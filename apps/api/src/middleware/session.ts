import type { UserRole } from "@laqta/core";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth.ts";
import type { AppEnv, CtxUser } from "../context.ts";

/**
 * Resolves the Better Auth session on every request and attaches the user to
 * the context (or null for guests). Downstream guards read `c.get("user")`.
 */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) {
    const u = session.user as unknown as Record<string, unknown>;
    const user: CtxUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      displayName: (u.displayName as string | null) ?? null,
      role: ((u.role as UserRole | undefined) ?? "registered"),
      blockedAt: (u.blockedAt as Date | null) ?? null,
    };
    c.set("user", user);
  } else {
    c.set("user", null);
  }
  await next();
});

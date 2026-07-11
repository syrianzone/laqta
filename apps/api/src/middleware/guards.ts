import { type UserRole, hasAtLeastRole } from "@laqta/core";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context.ts";

/** Requires an authenticated, non-blocked user. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Authentication required" });
  if (user.blockedAt) throw new HTTPException(403, { message: "Account blocked" });
  await next();
});

/** Requires at least the given role (registered < trusted < moderator < admin). */
export function requireRole(role: UserRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Authentication required" });
    if (user.blockedAt) throw new HTTPException(403, { message: "Account blocked" });
    if (!hasAtLeastRole(user.role, role)) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    await next();
  });
}

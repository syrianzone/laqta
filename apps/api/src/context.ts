import type { UserRole } from "@laqta/core";

/** Session user attached to the Hono context by the session middleware. */
export interface CtxUser {
  id: string;
  email: string;
  name: string;
  displayName: string | null;
  role: UserRole;
  blockedAt: Date | null;
}

/** Authenticated developer API key attached by the api-key middleware. */
export interface CtxApiKey {
  id: string;
  userId: string;
}

/** Hono environment: typed `c.get("user")` / `c.get("session")`. */
export interface AppEnv {
  Variables: {
    user: CtxUser | null;
    sessionToken: string | null;
    apiKey: CtxApiKey | null;
  };
}

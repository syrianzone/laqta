import { env } from "@laqta/config";
import { USER_ROLES } from "@laqta/core";
import { db, schema } from "@laqta/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * The single auth authority for Laqta. Better Auth owns sign-in/callback,
 * sessions, and cookies; mounted into Hono at `/api/auth/*`. Google is the only
 * provider (no passwords). The `user` table is extended with Laqta fields via
 * `additionalFields` — Better Auth reads/writes them through the Drizzle adapter.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.PUBLIC_WEB_URL, env.PUBLIC_API_URL],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: { enabled: false },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  user: {
    additionalFields: {
      displayName: { type: "string", required: false, input: true },
      bio: { type: "string", required: false, input: true },
      creditFormat: { type: "string", required: false, input: true },
      role: {
        type: USER_ROLES as unknown as string[],
        required: false,
        defaultValue: "registered",
        input: false, // never client-settable — promotion happens admin-side
      },
      blockedAt: { type: "date", required: false, input: false },
      deletedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  },

  advanced: {
    // Share the session cookie across syrian.zone subdomains in production so
    // the SvelteKit app (web) and API can both read it.
    crossSubDomainCookies:
      env.NODE_ENV === "production"
        ? { enabled: true, domain: ".syrian.zone" }
        : { enabled: false },
  },
});

export type Auth = typeof auth;
export type SessionUser = Auth["$Infer"]["Session"]["user"];

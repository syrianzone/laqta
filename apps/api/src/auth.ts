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
    // Cookie behavior for Better Auth sessions.
    //
    // - If PUBLIC_WEB_URL and PUBLIC_API_URL are on the *same host* (no subdomain),
    //   we disable crossSubDomainCookies (simpler, works with same-origin cookies).
    // - If they are on different subdomains, we enable cross-subdomain cookies.
    //
    // The domain below is currently hardcoded for the SyrianZone setup.
    // If you use different domains entirely, you may need to adjust this.
    crossSubDomainCookies: (() => {
      try {
        const webHost = new URL(env.PUBLIC_WEB_URL).host;
        const apiHost = new URL(env.PUBLIC_API_URL).host;
        const isSameHost = webHost === apiHost;

        if (isSameHost || env.NODE_ENV !== "production") {
          return { enabled: false };
        }

        // Different hosts (typical subdomain setup). Enable cross-subdomain.
        // Change ".syrian.zone" to your parent domain if needed.
        return { enabled: true, domain: ".syrian.zone" };
      } catch {
        return { enabled: false };
      }
    })(),
  },
});

export type Auth = typeof auth;
export type SessionUser = Auth["$Infer"]["Session"]["user"];

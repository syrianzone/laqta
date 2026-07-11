import { env } from "@laqta/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth.ts";
import type { AppEnv } from "./context.ts";
import { sessionMiddleware } from "./middleware/session.ts";
import { adminRoutes } from "./routes/admin.ts";
import { albumRoutes } from "./routes/albums.ts";
import { apiKeyRoutes } from "./routes/api-keys.ts";
import { engagementRoutes } from "./routes/engagement.ts";
import { meRoutes } from "./routes/me.ts";
import { ownerPhotoRoutes } from "./routes/owner-photos.ts";
import { publicApiRoutes } from "./routes/public-api.ts";
import { ssrRoutes } from "./routes/ssr.ts";
import { uploadRoutes } from "./routes/uploads.ts";

/**
 * Laqta backend. Hono owns ALL backend: auth, uploads, admin/moderation, the
 * public developer API, and internal SSR endpoints for the SvelteKit frontend.
 */
const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [env.PUBLIC_WEB_URL],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "laqta-api" }));

// Better Auth owns everything under /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Resolve session for all app routes below.
app.use("*", sessionMiddleware);

app.route("/me", meRoutes);
app.route("/me/api-keys", apiKeyRoutes);
app.route("/me/photos", ownerPhotoRoutes);
app.route("/me/albums", albumRoutes);
app.route("/uploads", uploadRoutes);
app.route("/admin", adminRoutes);
app.route("/ssr", ssrRoutes);
app.route("/", engagementRoutes);
app.route("/api/v1", publicApiRoutes);

const port = Number(new URL(env.PUBLIC_API_URL).port || 3000);

export default {
  port,
  fetch: app.fetch,
};

export { app };

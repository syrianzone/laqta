import { z } from "zod";

/**
 * Central, zod-validated environment for every Laqta service.
 *
 * Import `env` for the fully-parsed object, or one of the scoped helpers
 * (`dbEnv`, `redisEnv`, …) when a package only needs a slice. Parsing happens
 * once, lazily, on first access and throws a readable error listing every
 * missing/invalid key so services fail fast on boot.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PUBLIC_WEB_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_PUBLIC_BASE_URL: z.string().url(),

  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL_MODERATION: z.string().min(1),
  OPENROUTER_MODEL_CAPTION: z.string().min(1),
  OPENROUTER_MODEL_EMBEDDING: z.string().min(1),

  TYPESENSE_HOST: z.string().min(1),
  TYPESENSE_PORT: z.coerce.number().int().positive().default(8108),
  TYPESENSE_PROTOCOL: z.enum(["http", "https"]).default("http"),
  TYPESENSE_API_KEY: z.string().min(1),

  // Turnstile is optional during initial setup / migration.
  // When not configured, original downloads are blocked in production.
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Fully-parsed env, validated on first property access. */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});

export const isProd = () => loadEnv().NODE_ENV === "production";
export const isTest = () => loadEnv().NODE_ENV === "test";

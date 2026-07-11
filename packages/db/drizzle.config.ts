import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as its own CLI; read DATABASE_URL directly rather than
// pulling in the full @laqta/config validation (most vars are irrelevant here).
const url =
  process.env.DATABASE_URL ??
  "postgres://laqta:laqta@localhost:5432/laqta";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});

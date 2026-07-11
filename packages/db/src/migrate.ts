import { env } from "@laqta/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies pending migrations. Enables required Postgres extensions first
 * (`vector` for pgvector embeddings) so migrations that create the HNSW index
 * succeed. `gen_random_uuid()` is built into Postgres 13+.
 */
async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` });
  await client.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});

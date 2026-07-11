import { env } from "@laqta/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Long-lived pooled connection + Drizzle client shared across a service. */
const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export type Database = typeof db;

export { schema };
export * from "./schema.ts";
export { client as sql };

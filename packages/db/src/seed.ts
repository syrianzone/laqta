import { CATEGORY_SEED } from "@laqta/core";
import { db, sql } from "./index.ts";
import { categories } from "./schema.ts";

/** Idempotently seeds standardized categories. Safe to run on every deploy. */
async function main() {
  for (const c of CATEGORY_SEED) {
    await db
      .insert(categories)
      .values({ slug: c.slug, nameAr: c.name_ar, nameEn: c.name_en })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { nameAr: c.name_ar, nameEn: c.name_en },
      });
  }
  console.log(`✓ seeded ${CATEGORY_SEED.length} categories`);
  await sql.end();
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});

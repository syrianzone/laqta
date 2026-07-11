import { env } from "@laqta/config";
import {
  LICENSE_INFO,
  attributionText,
  creditName,
  embed as embedText,
} from "@laqta/core";
import {
  categories,
  db,
  photoRenditions,
  photoTags,
  photos,
  tags,
  user as userTable,
} from "@laqta/db";
import {
  type PhotoDocument,
  hybridSearch,
  searchPhotos,
  similarByDocId,
} from "@laqta/search";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context.ts";
import { apiKeyAuth } from "../middleware/apikey.ts";
import { publicUrl, renditionKey } from "@laqta/storage";

/**
 * Public developer JSON API. Key-authenticated + rate-limited. Exposes ONLY
 * public catalog data — never an email, user id, or auth metadata. Page size is
 * capped and there is no bulk original download (harvest protection).
 */
export const publicApiRoutes = new Hono<AppEnv>();
publicApiRoutes.use("*", apiKeyAuth);

const MAX_PER_PAGE = 50;

function imagesFor(id: string) {
  return {
    thumb: publicUrl(renditionKey(id, "thumb", "webp")),
    medium: publicUrl(renditionKey(id, "medium", "webp")),
    large: publicUrl(renditionKey(id, "large", "webp")),
  };
}

/** Public card from a Typesense hit (search results). */
function cardFromDoc(doc: PhotoDocument) {
  return {
    slug: doc.slug,
    title: { ar: doc.title_ar ?? null, en: doc.title_en ?? null },
    license: doc.license,
    credit: doc.credit ?? null,
    width: doc.width ?? null,
    height: doc.height ?? null,
    blurhash: doc.blurhash ?? null,
    dominant_color: doc.dominant_color ?? null,
    images: imagesFor(doc.id),
  };
}

/** GET /api/v1/photos — list published photos, filterable + paginated. */
publicApiRoutes.get("/photos", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const perPage = Math.min(Number(c.req.query("per_page") ?? 24), MAX_PER_PAGE);
  const license = c.req.query("license");
  const categorySlug = c.req.query("category");
  const tagSlug = c.req.query("tag");

  const conds = [eq(photos.status, "published")];
  if (license) conds.push(eq(photos.license, license as never));
  if (categorySlug) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug));
    conds.push(eq(photos.categoryId, cat?.id ?? "none"));
  }

  const sel = db
    .select({
      id: photos.id,
      slug: photos.slug,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      license: photos.license,
      creditOverride: photos.creditOverride,
      width: photos.width,
      height: photos.height,
      blurhash: photos.blurhash,
      dominantColor: photos.dominantColor,
      viewsCount: photos.viewsCount,
      downloadsCount: photos.downloadsCount,
      likesCount: photos.likesCount,
      displayName: userTable.displayName,
      userName: userTable.name,
      creditFormat: userTable.creditFormat,
    })
    .from(photos)
    .innerJoin(userTable, eq(photos.userId, userTable.id));

  const rows = tagSlug
    ? await sel
        .innerJoin(photoTags, eq(photoTags.photoId, photos.id))
        .innerJoin(tags, and(eq(tags.id, photoTags.tagId), eq(tags.slug, tagSlug)))
        .where(and(...conds))
        .orderBy(desc(photos.publishedAt))
        .limit(perPage)
        .offset((page - 1) * perPage)
    : await sel
        .where(and(...conds))
        .orderBy(desc(photos.publishedAt))
        .limit(perPage)
        .offset((page - 1) * perPage);

  return c.json({
    page,
    per_page: perPage,
    data: rows.map((p) => ({
      slug: p.slug,
      title: { ar: p.titleAr, en: p.titleEn },
      license: p.license,
      credit: creditName({
        license: p.license,
        displayName: p.displayName ?? p.userName,
        creditOverride: p.creditOverride,
        creditFormat: p.creditFormat,
        photoUrl: "",
      }),
      width: p.width,
      height: p.height,
      blurhash: p.blurhash,
      dominant_color: p.dominantColor,
      stats: {
        views: p.viewsCount,
        downloads: p.downloadsCount,
        likes: p.likesCount,
      },
      images: imagesFor(p.id),
    })),
  });
});

/** GET /api/v1/photos/:slug — public detail (no personal data). */
publicApiRoutes.get("/photos/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [p] = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      status: photos.status,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      captionAr: photos.captionAr,
      captionEn: photos.captionEn,
      descAr: photos.descAr,
      descEn: photos.descEn,
      altAr: photos.altAr,
      altEn: photos.altEn,
      license: photos.license,
      creditOverride: photos.creditOverride,
      width: photos.width,
      height: photos.height,
      blurhash: photos.blurhash,
      dominantColor: photos.dominantColor,
      exif: photos.exif,
      lat: photos.lat,
      lng: photos.lng,
      locationName: photos.locationName,
      viewsCount: photos.viewsCount,
      downloadsCount: photos.downloadsCount,
      likesCount: photos.likesCount,
      publishedAt: photos.publishedAt,
      categorySlug: categories.slug,
      displayName: userTable.displayName,
      userName: userTable.name,
      creditFormat: userTable.creditFormat,
    })
    .from(photos)
    .innerJoin(userTable, eq(photos.userId, userTable.id))
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .where(eq(photos.slug, slug));

  if (!p || p.status !== "published") {
    throw new HTTPException(404, { message: "Photo not found" });
  }

  const tagRows = await db
    .select({ slug: tags.slug })
    .from(photoTags)
    .innerJoin(tags, eq(photoTags.tagId, tags.id))
    .where(eq(photoTags.photoId, p.id));

  const displayName = p.displayName ?? p.userName;
  const attribution = {
    license: p.license,
    displayName,
    creditOverride: p.creditOverride,
    creditFormat: p.creditFormat,
    photoTitle: p.titleAr ?? p.titleEn,
    photoUrl: `${env.PUBLIC_WEB_URL}/photos/${p.slug}`,
  };

  return c.json({
    slug: p.slug,
    title: { ar: p.titleAr, en: p.titleEn },
    caption: { ar: p.captionAr, en: p.captionEn },
    description: { ar: p.descAr, en: p.descEn },
    alt: { ar: p.altAr, en: p.altEn },
    license: {
      id: p.license,
      code: LICENSE_INFO[p.license].code,
      url: LICENSE_INFO[p.license].url,
    },
    credit: creditName(attribution),
    attribution: attributionText(attribution),
    creator: { name: displayName },
    category: p.categorySlug,
    tags: tagRows.map((t) => t.slug),
    width: p.width,
    height: p.height,
    blurhash: p.blurhash,
    dominant_color: p.dominantColor,
    exif: p.exif,
    location:
      p.lat != null && p.lng != null
        ? { lat: p.lat, lng: p.lng, name: p.locationName }
        : null,
    stats: {
      views: p.viewsCount,
      downloads: p.downloadsCount,
      likes: p.likesCount,
    },
    published_at: p.publishedAt,
    images: imagesFor(p.id),
  });
});

/** GET /api/v1/photos/:slug/similar */
publicApiRoutes.get("/photos/:slug/similar", async (c) => {
  const slug = c.req.param("slug");
  const [p] = await db
    .select({ id: photos.id, status: photos.status })
    .from(photos)
    .where(eq(photos.slug, slug));
  if (!p || p.status !== "published") {
    throw new HTTPException(404, { message: "Photo not found" });
  }
  try {
    const result = await similarByDocId(p.id);
    return c.json({
      data: (result.hits ?? [])
        .map((h) => cardFromDoc(h.document))
        .filter((card) => card.slug !== slug),
    });
  } catch {
    return c.json({ data: [] });
  }
});

/** GET /api/v1/search?q= — hybrid keyword + semantic (keyword fallback). */
publicApiRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  if (!q.trim()) return c.json({ q, found: 0, data: [] });
  const params = {
    q,
    category: c.req.query("category") || undefined,
    license: c.req.query("license") || undefined,
    page: Math.max(1, Number(c.req.query("page") ?? 1)),
    perPage: Math.min(Number(c.req.query("per_page") ?? 24), MAX_PER_PAGE),
  };
  let result: Awaited<ReturnType<typeof searchPhotos>>;
  try {
    const vec = await embedText(env.OPENROUTER_MODEL_EMBEDDING, q);
    result = await hybridSearch(params, vec);
  } catch {
    result = await searchPhotos(params);
  }
  return c.json({
    q,
    found: result.found ?? 0,
    data: (result.hits ?? []).map((h) => cardFromDoc(h.document)),
  });
});

publicApiRoutes.get("/categories", async (c) => {
  const rows = await db
    .select({ slug: categories.slug, name_ar: categories.nameAr, name_en: categories.nameEn })
    .from(categories)
    .orderBy(categories.nameEn);
  return c.json({ data: rows });
});

publicApiRoutes.get("/tags", async (c) => {
  const rows = await db
    .select({ slug: tags.slug, name_ar: tags.nameAr, name_en: tags.nameEn })
    .from(tags)
    .orderBy(tags.slug)
    .limit(500);
  return c.json({ data: rows });
});

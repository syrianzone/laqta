import { env } from "@laqta/config";
import {
  LICENSE_INFO,
  attributionHtml,
  attributionText,
  creditName,
  embed as embedText,
} from "@laqta/core";
import {
  type PhotoDocument,
  hybridSearch,
  searchPhotos,
  similarByDocId,
} from "@laqta/search";
import {
  albumPhotos,
  albums,
  categories,
  comments,
  db,
  photoLikes,
  photoRenditions,
  photoTags,
  photos,
  tags,
  user as userTable,
} from "@laqta/db";
import { incrementCounter } from "@laqta/queue";
import { presignDownload, publicUrl, renditionKey } from "@laqta/storage";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context.ts";

/**
 * Read-only, cookie-session-aware endpoints the SvelteKit server calls for page
 * data. Public: only `published` photos, never any owner personal data beyond
 * display name + license credit.
 */
export const ssrRoutes = new Hono<AppEnv>();

const PAGE = 24;

function clientId(c: { req: { header: (k: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "anon"
  );
}

/** Browse grid: published photos, optional category/tag filter, paginated. */
ssrRoutes.get("/photos", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const categorySlug = c.req.query("category");
  const tagSlug = c.req.query("tag");

  const conds = [eq(photos.status, "published")];
  if (categorySlug) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug));
    conds.push(eq(photos.categoryId, cat?.id ?? "none"));
  }

  const base = db
    .select({
      id: photos.id,
      slug: photos.slug,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      blurhash: photos.blurhash,
      dominantColor: photos.dominantColor,
      width: photos.width,
      height: photos.height,
      likesCount: photos.likesCount,
    })
    .from(photos);

  const rows = tagSlug
    ? await base
        .innerJoin(photoTags, eq(photoTags.photoId, photos.id))
        .innerJoin(tags, and(eq(tags.id, photoTags.tagId), eq(tags.slug, tagSlug)))
        .where(and(...conds))
        .orderBy(desc(photos.publishedAt))
        .limit(PAGE)
        .offset((page - 1) * PAGE)
    : await base
        .where(and(...conds))
        .orderBy(desc(photos.publishedAt))
        .limit(PAGE)
        .offset((page - 1) * PAGE);

  return c.json({
    page,
    items: rows.map((p) => ({
      slug: p.slug,
      titleAr: p.titleAr,
      titleEn: p.titleEn,
      blurhash: p.blurhash,
      dominantColor: p.dominantColor,
      width: p.width,
      height: p.height,
      likesCount: p.likesCount,
      thumb: publicUrl(renditionKey(p.id, "thumb", "webp")),
      medium: publicUrl(renditionKey(p.id, "medium", "webp")),
    })),
  });
});

/** Public album view: album meta + its published photos as cards. */
ssrRoutes.get("/albums/:id", async (c) => {
  const id = c.req.param("id");
  const [album] = await db
    .select({
      id: albums.id,
      titleAr: albums.titleAr,
      titleEn: albums.titleEn,
      ownerName: userTable.displayName,
    })
    .from(albums)
    .innerJoin(userTable, eq(albums.userId, userTable.id))
    .where(eq(albums.id, id));
  if (!album) throw new HTTPException(404, { message: "Album not found" });

  const rows = await db
    .select({
      id: photos.id,
      slug: photos.slug,
      titleAr: photos.titleAr,
      titleEn: photos.titleEn,
      blurhash: photos.blurhash,
      dominantColor: photos.dominantColor,
      width: photos.width,
      height: photos.height,
      likesCount: photos.likesCount,
    })
    .from(albumPhotos)
    .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
    .where(and(eq(albumPhotos.albumId, id), eq(photos.status, "published")))
    .orderBy(albumPhotos.position);

  return c.json({
    album: { id: album.id, titleAr: album.titleAr, titleEn: album.titleEn, owner: album.ownerName },
    items: rows.map((p) => ({
      slug: p.slug,
      titleAr: p.titleAr,
      titleEn: p.titleEn,
      blurhash: p.blurhash,
      dominantColor: p.dominantColor,
      width: p.width,
      height: p.height,
      likesCount: p.likesCount,
      thumb: publicUrl(renditionKey(p.id, "thumb", "webp")),
      medium: publicUrl(renditionKey(p.id, "medium", "webp")),
    })),
  });
});

/** Sitemap data: published photo slugs + last-modified, and category slugs. */
ssrRoutes.get("/sitemap", async (c) => {
  const photoRows = await db
    .select({ slug: photos.slug, publishedAt: photos.publishedAt })
    .from(photos)
    .where(eq(photos.status, "published"))
    .orderBy(desc(photos.publishedAt))
    .limit(50000);
  const catRows = await db.select({ slug: categories.slug }).from(categories);
  return c.json({
    photos: photoRows.map((p) => ({
      slug: p.slug,
      lastmod: (p.publishedAt ?? new Date()).toISOString(),
    })),
    categories: catRows.map((r) => r.slug),
  });
});

ssrRoutes.get("/categories", async (c) => {
  const rows = await db
    .select({ slug: categories.slug, nameAr: categories.nameAr, nameEn: categories.nameEn })
    .from(categories)
    .orderBy(categories.nameEn);
  return c.json({ items: rows });
});

/** Photo detail. Increments the view counter (deduped per client). */
ssrRoutes.get("/photos/:slug", async (c) => {
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
      dominantColor: photos.dominantColor,
      blurhash: photos.blurhash,
      exif: photos.exif,
      lat: photos.lat,
      lng: photos.lng,
      locationName: photos.locationName,
      viewsCount: photos.viewsCount,
      downloadsCount: photos.downloadsCount,
      likesCount: photos.likesCount,
      publishedAt: photos.publishedAt,
      categorySlug: categories.slug,
      categoryAr: categories.nameAr,
      categoryEn: categories.nameEn,
      ownerId: userTable.id,
      ownerName: userTable.displayName,
      ownerRealName: userTable.name,
      creditFormat: userTable.creditFormat,
      ownerBio: userTable.bio,
    })
    .from(photos)
    .innerJoin(userTable, eq(photos.userId, userTable.id))
    .leftJoin(categories, eq(photos.categoryId, categories.id))
    .where(eq(photos.slug, slug));

  if (!p || p.status !== "published") {
    throw new HTTPException(404, { message: "Photo not found" });
  }

  const [rends, tagRows] = await Promise.all([
    db
      .select({
        variant: photoRenditions.variant,
        width: photoRenditions.width,
        height: photoRenditions.height,
        bytes: photoRenditions.bytes,
      })
      .from(photoRenditions)
      .where(eq(photoRenditions.photoId, p.id)),
    db
      .select({ slug: tags.slug, nameAr: tags.nameAr, nameEn: tags.nameEn })
      .from(photoTags)
      .innerJoin(tags, eq(photoTags.tagId, tags.id))
      .where(eq(photoTags.photoId, p.id)),
  ]);

  // Count a view (deduped) — fire and forget.
  void incrementCounter("views", p.id, clientId(c));

  // Has the current viewer liked this? + recent comments.
  const viewer = c.get("user");
  const [likedRows, commentRows] = await Promise.all([
    viewer
      ? db
          .select({ userId: photoLikes.userId })
          .from(photoLikes)
          .where(and(eq(photoLikes.photoId, p.id), eq(photoLikes.userId, viewer.id)))
      : Promise.resolve([]),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorName: userTable.displayName,
        authorReal: userTable.name,
      })
      .from(comments)
      .innerJoin(userTable, eq(comments.userId, userTable.id))
      .where(and(eq(comments.photoId, p.id), eq(comments.status, "visible")))
      .orderBy(desc(comments.createdAt))
      .limit(100),
  ]);
  const likedByMe = likedRows.length > 0;

  const photoUrl = `${env.PUBLIC_WEB_URL}/photos/${p.slug}`;
  const displayName = p.ownerName ?? p.ownerRealName;
  const attribution = {
    license: p.license,
    displayName,
    creditOverride: p.creditOverride,
    creditFormat: p.creditFormat,
    photoTitle: p.titleAr ?? p.titleEn,
    photoUrl,
  };

  return c.json({
    slug: p.slug,
    titleAr: p.titleAr,
    titleEn: p.titleEn,
    captionAr: p.captionAr,
    captionEn: p.captionEn,
    descAr: p.descAr,
    descEn: p.descEn,
    altAr: p.altAr,
    altEn: p.altEn,
    width: p.width,
    height: p.height,
    dominantColor: p.dominantColor,
    blurhash: p.blurhash,
    exif: p.exif,
    lat: p.lat,
    lng: p.lng,
    locationName: p.locationName,
    views: p.viewsCount,
    downloads: p.downloadsCount,
    likes: p.likesCount,
    likedByMe,
    comments: commentRows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: r.authorName ?? r.authorReal,
    })),
    publishedAt: p.publishedAt,
    category: p.categorySlug
      ? { slug: p.categorySlug, nameAr: p.categoryAr, nameEn: p.categoryEn }
      : null,
    tags: tagRows,
    owner: { name: displayName, bio: p.ownerBio },
    license: {
      id: p.license,
      ...LICENSE_INFO[p.license],
      credit: creditName(attribution),
    },
    attribution: {
      text: attributionText(attribution),
      html: attributionHtml(attribution),
    },
    images: {
      full: publicUrl(renditionKey(p.id, "large", "webp")),
      renditions: rends.map((r) => ({
        variant: r.variant,
        width: r.width,
        height: r.height,
        bytes: r.bytes,
        url: publicUrl(renditionKey(p.id, r.variant, "webp")),
      })),
    },
  });
});

/** Shape a Typesense hit into the browse-card format the grid expects. */
function docToCard(doc: PhotoDocument) {
  return {
    slug: doc.slug,
    titleAr: doc.title_ar ?? null,
    titleEn: doc.title_en ?? null,
    blurhash: doc.blurhash ?? null,
    dominantColor: doc.dominant_color ?? null,
    width: doc.width ?? null,
    height: doc.height ?? null,
    likesCount: 0,
    thumb: publicUrl(renditionKey(doc.id, "thumb", "webp")),
    medium: publicUrl(renditionKey(doc.id, "medium", "webp")),
  };
}

/**
 * Hybrid keyword + semantic search. Tries to embed the query for vector blend;
 * falls back to pure keyword if the embedding provider is unavailable.
 */
ssrRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  // A blank query returns nothing — use /ssr/photos for browsing.
  if (!q.trim()) return c.json({ q, mode: "keyword", found: 0, page: 1, items: [] });

  const params = {
    q,
    category: c.req.query("category") || undefined,
    license: c.req.query("license") || undefined,
    page: Math.max(1, Number(c.req.query("page") ?? 1)),
  };

  let result: Awaited<ReturnType<typeof searchPhotos>>;
  let mode: "hybrid" | "keyword" = "keyword";
  try {
    const vec = await embedText(env.OPENROUTER_MODEL_EMBEDDING, q);
    result = await hybridSearch(params, vec);
    mode = "hybrid";
  } catch {
    result = await searchPhotos(params);
  }

  const items = (result.hits ?? []).map((h) => docToCard(h.document));
  return c.json({ q, mode, found: result.found ?? items.length, page: params.page, items });
});

/** "Similar images" via the photo's stored embedding vector. */
ssrRoutes.get("/photos/:slug/similar", async (c) => {
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
    const items = (result.hits ?? [])
      .map((h) => docToCard(h.document))
      .filter((card) => card.slug !== slug);
    return c.json({ items });
  } catch {
    // No vector indexed yet / vector search unavailable.
    return c.json({ items: [] });
  }
});

/**
 * Download endpoint that counts downloads. Renditions redirect to the CDN;
 * the original is gated behind Cloudflare Turnstile + a short-lived presigned URL.
 */
ssrRoutes.get("/download/:slug/:variant", async (c) => {
  const slug = c.req.param("slug");
  const variant = c.req.param("variant");
  const [p] = await db
    .select({ id: photos.id, status: photos.status, originalKey: photos.originalKey })
    .from(photos)
    .where(eq(photos.slug, slug));
  if (!p || p.status !== "published") {
    throw new HTTPException(404, { message: "Photo not found" });
  }

  if (variant === "original") {
    const token = c.req.query("turnstile") ?? "";
    if (!(await verifyTurnstile(token, clientId(c)))) {
      throw new HTTPException(403, { message: "Turnstile verification failed" });
    }
    void incrementCounter("downloads", p.id, clientId(c));
    return c.redirect(presignDownload(p.originalKey));
  }

  if (variant === "large" || variant === "medium" || variant === "thumb") {
    void incrementCounter("downloads", p.id, clientId(c));
    return c.redirect(publicUrl(renditionKey(p.id, variant, "webp")));
  }

  throw new HTTPException(400, { message: "Invalid variant" });
});

/** Verify a Cloudflare Turnstile token. Bypassed in development. */
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (env.NODE_ENV === "development") return true;
  if (!token) return false;
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    },
  );
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

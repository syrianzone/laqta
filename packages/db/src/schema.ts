import {
  COMMENT_STATUSES,
  EMBEDDING_DIM,
  LICENSES,
  MODERATION_SOURCES,
  PHOTO_STATUSES,
  RENDITION_VARIANTS,
  USER_ROLES,
} from "@laqta/core";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

// ── Enums ───────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const photoStatusEnum = pgEnum("photo_status", PHOTO_STATUSES);
export const licenseEnum = pgEnum("license", LICENSES);
export const renditionVariantEnum = pgEnum("rendition_variant", RENDITION_VARIANTS);
export const commentStatusEnum = pgEnum("comment_status", COMMENT_STATUSES);
export const moderationSourceEnum = pgEnum("moderation_source", MODERATION_SOURCES);

// ── Better Auth tables (managed by Better Auth's Drizzle adapter) ─────────────
// Column names follow Better Auth's default (camelCase) schema. We extend `user`
// with Laqta-specific fields via Better Auth's additionalFields config.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(), // PRIVATE — never exposed publicly
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  // Laqta extensions:
  displayName: text("display_name"),
  bio: text("bio"),
  creditFormat: text("credit_format"),
  role: userRoleEnum("role").notNull().default("registered"),
  blockedAt: timestamp("blocked_at"),
  deletedAt: timestamp("deleted_at"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ── Taxonomy ──────────────────────────────────────────────────────────────
export const categories = pgTable("categories", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

// ── Photos ──────────────────────────────────────────────────────────────────
export const photos = pgTable(
  "photos",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),

    titleAr: text("title_ar"),
    titleEn: text("title_en"),
    captionAr: text("caption_ar"),
    captionEn: text("caption_en"),
    descAr: text("desc_ar"),
    descEn: text("desc_en"),
    altAr: text("alt_ar"),
    altEn: text("alt_en"),

    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    license: licenseEnum("license").notNull().default("cc-by"),
    creditOverride: text("credit_override"),

    status: photoStatusEnum("status").notNull().default("pending"),

    // Image characteristics
    width: integer("width"),
    height: integer("height"),
    dominantColor: text("dominant_color"),
    blurhash: text("blurhash"),
    originalKey: text("original_key").notNull(),

    // Semantic search vector (nullable until the embed job runs)
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),

    // Metadata — full camera EXIF (GPS preserved: geotags are a feature)
    exif: jsonb("exif"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    locationName: text("location_name"),

    // Denormalized engagement counters (source of truth flushed from Redis)
    viewsCount: integer("views_count").notNull().default(0),
    downloadsCount: integer("downloads_count").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("photos_status_published_idx").on(t.status, t.publishedAt),
    index("photos_user_idx").on(t.userId),
    index("photos_category_idx").on(t.categoryId),
    // HNSW index for cosine ANN search on the embedding
    index("photos_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const photoRenditions = pgTable(
  "photo_renditions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    variant: renditionVariantEnum("variant").notNull(),
    key: text("key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    format: text("format").notNull(),
    bytes: integer("bytes").notNull(),
  },
  (t) => [uniqueIndex("renditions_photo_variant_idx").on(t.photoId, t.variant)],
);

export const photoTags = pgTable(
  "photo_tags",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.tagId] })],
);

// ── Engagement ────────────────────────────────────────────────────────────
export const photoLikes = pgTable(
  "photo_likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.photoId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: commentStatusEnum("status").notNull().default("visible"),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("comments_photo_idx").on(t.photoId, t.createdAt)],
);

// ── Albums ──────────────────────────────────────────────────────────────────
export const albums = pgTable(
  "albums",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    titleAr: text("title_ar"),
    titleEn: text("title_en"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("albums_user_slug_idx").on(t.userId, t.slug)],
);

export const albumPhotos = pgTable(
  "album_photos",
  {
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.photoId] })],
);

// ── Moderation ──────────────────────────────────────────────────────────────
export const moderationEvents = pgTable("moderation_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  photoId: text("photo_id")
    .notNull()
    .references(() => photos.id, { onDelete: "cascade" }),
  source: moderationSourceEnum("source").notNull(),
  verdict: text("verdict").notNull(),
  scores: jsonb("scores"),
  reason: text("reason"),
  moderatorId: text("moderator_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Developer API keys ────────────────────────────────────────────────────
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    rateLimit: integer("rate_limit").notNull().default(60),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_prefix_idx").on(t.prefix),
    index("api_keys_user_idx").on(t.userId),
  ],
);

// ── Relations ───────────────────────────────────────────────────────────────
export const userRelations = relations(user, ({ many }) => ({
  photos: many(photos),
  albums: many(albums),
  apiKeys: many(apiKeys),
}));

export const photoRelations = relations(photos, ({ one, many }) => ({
  owner: one(user, { fields: [photos.userId], references: [user.id] }),
  category: one(categories, {
    fields: [photos.categoryId],
    references: [categories.id],
  }),
  renditions: many(photoRenditions),
  tags: many(photoTags),
  comments: many(comments),
}));

export const photoTagRelations = relations(photoTags, ({ one }) => ({
  photo: one(photos, { fields: [photoTags.photoId], references: [photos.id] }),
  tag: one(tags, { fields: [photoTags.tagId], references: [tags.id] }),
}));

export const renditionRelations = relations(photoRenditions, ({ one }) => ({
  photo: one(photos, {
    fields: [photoRenditions.photoId],
    references: [photos.id],
  }),
}));

export const commentRelations = relations(comments, ({ one }) => ({
  photo: one(photos, { fields: [comments.photoId], references: [photos.id] }),
  author: one(user, { fields: [comments.userId], references: [user.id] }),
}));

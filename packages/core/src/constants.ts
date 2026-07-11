/** Shared enum-like constants used across the DB schema, API, and UI. */

export const USER_ROLES = ["registered", "trusted", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Ordered by privilege; index used for `hasAtLeastRole` comparisons. */
export const ROLE_RANK: Record<UserRole, number> = {
  registered: 0,
  trusted: 1,
  moderator: 2,
  admin: 3,
};

export function hasAtLeastRole(role: UserRole, required: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Trusted+ users bypass the manual moderation queue on clean AI verdicts. */
export function bypassesModerationQueue(role: UserRole): boolean {
  return hasAtLeastRole(role, "trusted");
}

export const PHOTO_STATUSES = [
  "pending",
  "published",
  "rejected",
  "flagged",
] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const COMMENT_STATUSES = ["visible", "hidden", "deleted"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const RENDITION_VARIANTS = ["large", "medium", "thumb"] as const;
export type RenditionVariant = (typeof RENDITION_VARIANTS)[number];

/** Longest edge (px) per rendition variant; original is preserved untouched. */
export const RENDITION_MAX_EDGE: Record<RenditionVariant, number> = {
  large: 2048,
  medium: 1024,
  thumb: 400,
};

export const MODERATION_SOURCES = ["ai", "admin"] as const;
export type ModerationSource = (typeof MODERATION_SOURCES)[number];

export const ACCEPTED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type AcceptedUploadMime = (typeof ACCEPTED_UPLOAD_MIME)[number];

/** 50 MB upload ceiling for originals. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Dimensionality of image/text embedding vectors. Must match the OpenRouter
 * embedding model output AND the Typesense vector field. Single source of truth
 * for the pgvector column, so changing models is a one-line + migration change.
 */
export const EMBEDDING_DIM = 768;

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Canonical default locale (Syrian Arabic) — used for lang/hreflang/AI output. */
export const DEFAULT_LOCALE = "ar" as const;
export const LOCALE_TAGS: Record<Locale, string> = {
  ar: "ar-SY",
  en: "en",
};
export const LOCALE_DIR: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

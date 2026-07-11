/** Friendly-URL slug generation supporting Arabic and Latin input. */

/**
 * Build a URL slug from a title. Latin text is lowercased/hyphenated; Arabic
 * (and other non-Latin) text is kept as-is minus punctuation, since Arabic
 * slugs are valid in URLs and preferred for `ar` pages. A short random suffix
 * is appended by the caller to guarantee uniqueness.
 */
export function slugify(input: string): string {
  const cleaned = input
    .normalize("NFKC")
    .trim()
    .replace(/[ً-ٰٟ]/g, "") // strip Arabic diacritics
    .toLowerCase()
    .replace(/['".,!?;:()[\]{}<>@#$%^&*=+|\\/]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "photo";
}

/** Deterministic-length base36 suffix from a numeric/string seed. */
export function shortSuffix(seed: string | number): string {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

export function buildSlug(title: string, seed: string | number): string {
  return `${slugify(title)}-${shortSuffix(seed)}`;
}

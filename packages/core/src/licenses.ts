/** Creative Commons licenses supported by Laqta and attribution helpers. */

export const LICENSES = ["cc0", "cc-by", "cc-by-nc", "cc-by-sa"] as const;
export type License = (typeof LICENSES)[number];

export interface LicenseInfo {
  id: License;
  /** SPDX-ish short code, e.g. "CC0-1.0". */
  code: string;
  name_ar: string;
  name_en: string;
  url: string;
  requiresAttribution: boolean;
  allowsCommercial: boolean;
  shareAlike: boolean;
}

export const LICENSE_INFO: Record<License, LicenseInfo> = {
  cc0: {
    id: "cc0",
    code: "CC0-1.0",
    name_ar: "الملكية العامة (CC0 1.0)",
    name_en: "Public Domain (CC0 1.0)",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    requiresAttribution: false,
    allowsCommercial: true,
    shareAlike: false,
  },
  "cc-by": {
    id: "cc-by",
    code: "CC-BY-4.0",
    name_ar: "نَسب المُصنَّف (CC BY 4.0)",
    name_en: "Attribution (CC BY 4.0)",
    url: "https://creativecommons.org/licenses/by/4.0/",
    requiresAttribution: true,
    allowsCommercial: true,
    shareAlike: false,
  },
  "cc-by-nc": {
    id: "cc-by-nc",
    code: "CC-BY-NC-4.0",
    name_ar: "نَسب المُصنَّف - غير تجاري (CC BY-NC 4.0)",
    name_en: "Attribution-NonCommercial (CC BY-NC 4.0)",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
    requiresAttribution: true,
    allowsCommercial: false,
    shareAlike: false,
  },
  "cc-by-sa": {
    id: "cc-by-sa",
    code: "CC-BY-SA-4.0",
    name_ar: "نَسب المُصنَّف - الترخيص بالمثل (CC BY-SA 4.0)",
    name_en: "Attribution-ShareAlike (CC BY-SA 4.0)",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    requiresAttribution: true,
    allowsCommercial: true,
    shareAlike: true,
  },
};

export interface AttributionInput {
  license: License;
  /** Contributor's display name. */
  displayName: string;
  /** Per-photo override of how they want to be credited (name or portfolio). */
  creditOverride?: string | null;
  /** Account-level preferred credit format. */
  creditFormat?: string | null;
  photoTitle?: string | null;
  photoUrl: string;
}

/** The human-readable credit line (falls back through override → format → name). */
export function creditName(input: AttributionInput): string {
  return (
    input.creditOverride?.trim() ||
    input.creditFormat?.trim() ||
    input.displayName
  );
}

/** Plain-text attribution suitable for captions and credits. */
export function attributionText(input: AttributionInput): string {
  const info = LICENSE_INFO[input.license];
  if (!info.requiresAttribution) {
    return `${input.photoTitle ?? "صورة"} — ${info.code} (لقطة)`;
  }
  const who = creditName(input);
  const title = input.photoTitle ?? "Photo";
  return `"${title}" by ${who} — ${info.code}, via Laqta (${input.photoUrl})`;
}

/** HTML attribution snippet with links, ready to paste into a webpage. */
export function attributionHtml(input: AttributionInput): string {
  const info = LICENSE_INFO[input.license];
  const title = escapeHtml(input.photoTitle ?? "Photo");
  const photoLink = `<a href="${escapeAttr(input.photoUrl)}">${title}</a>`;
  const licenseLink = `<a href="${escapeAttr(info.url)}" rel="license">${info.code}</a>`;
  if (!info.requiresAttribution) {
    return `${photoLink} is marked with ${licenseLink} via Laqta.`;
  }
  const who = escapeHtml(creditName(input));
  return `${photoLink} by ${who} is licensed under ${licenseLink} via Laqta.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

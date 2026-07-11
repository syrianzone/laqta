import { env as pub } from "$env/dynamic/public";
import { API_URL } from "$lib/server/api";
import type { RequestHandler } from "./$types";

interface SitemapData {
  photos: { slug: string; lastmod: string }[];
  categories: string[];
}

/** Dynamic sitemap generated from published photos + categories. */
export const GET: RequestHandler = async ({ fetch }) => {
  const web = (pub.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
  let data: SitemapData = { photos: [], categories: [] };
  try {
    const res = await fetch(`${API_URL}/ssr/sitemap`);
    if (res.ok) data = (await res.json()) as SitemapData;
  } catch {
    // API down — emit a minimal sitemap.
  }

  const urls: string[] = [
    `<url><loc>${web}/</loc><changefreq>daily</changefreq></url>`,
    ...data.categories.map(
      (slug) => `<url><loc>${web}/c/${encodeURIComponent(slug)}</loc></url>`,
    ),
    ...data.photos.map(
      (p) =>
        `<url><loc>${web}/photos/${encodeURIComponent(p.slug)}</loc><lastmod>${p.lastmod}</lastmod></url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml",
      "cache-control": "max-age=3600",
    },
  });
};

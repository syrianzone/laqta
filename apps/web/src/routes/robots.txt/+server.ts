import { env as pub } from "$env/dynamic/public";
import type { RequestHandler } from "./$types";

/** robots.txt — allow crawling of the public catalog, point at the sitemap. */
export const GET: RequestHandler = () => {
  const web = (pub.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const body = `User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /admin

Sitemap: ${web}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain", "cache-control": "max-age=86400" },
  });
};

/**
 * Laqta renditions edge worker.
 *
 * Serves public image renditions from the R2 bucket on the main domain, so a
 * single-domain deploy needs no image subdomain:
 *
 *   https://laqta.syrian.zone/renditions/<photoId>/<variant>.webp
 *     -> R2 object key: renditions/<photoId>/<variant>.webp
 *
 * Object keys mirror the URL path with the leading slash removed (see
 * packages/storage: renditionKey/publicUrl). Only the `renditions/` prefix is
 * exposed here; originals/* stay private and are served via signed URLs by the
 * API. Responses are immutable and cached at the edge.
 */
export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    // Defense in depth: the route only maps /renditions/*, but never let a
    // misconfigured route expose anything outside the public prefix.
    if (!key.startsWith("renditions/")) {
      return new Response("Not Found", { status: 404 });
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const object = await env.RENDITIONS_BUCKET.get(key);
    if (!object || !object.body) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");

    const response = new Response(object.body, { headers });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};

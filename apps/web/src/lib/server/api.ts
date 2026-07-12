import { env as pub } from "$env/dynamic/public";
import { env as priv } from "$env/dynamic/private";

/**
 * Base URL of the Hono backend for SvelteKit server-side data access (BFF
 * pattern).
 *
 * Prefer INTERNAL_API_URL (e.g. http://laqta-api:3000) when set. In
 * single-domain deployments PUBLIC_API_URL equals the web app's own public
 * origin, and SvelteKit's `event.fetch` short-circuits same-origin absolute
 * URLs by re-invoking its own handler instead of making a network request —
 * which re-enters hooks/auth and deadlocks. Pointing server-side calls at the
 * internal API hostname (a different origin) avoids that and skips a needless
 * hairpin through the CDN. The browser still uses PUBLIC_API_URL.
 */
export const API_URL =
  priv.INTERNAL_API_URL ?? pub.PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Server-side fetch to the API that forwards the incoming request's cookies so
 * Better Auth sees the caller's session. Use inside `load`/actions/hooks.
 */
export async function apiFetch(
  event: { request: Request; fetch: typeof fetch },
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = event.request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return event.fetch(`${API_URL}${path}`, { ...init, headers });
}

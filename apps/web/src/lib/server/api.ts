import { env as pub } from "$env/dynamic/public";

/**
 * Base URL of the Hono backend. All SvelteKit server-side data access goes
 * through here (BFF pattern) — the browser never calls the API directly.
 */
export const API_URL = pub.PUBLIC_API_URL ?? "http://localhost:3000";

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

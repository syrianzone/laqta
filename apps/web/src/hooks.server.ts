import type { Handle } from "@sveltejs/kit";
import { apiFetch } from "$lib/server/api";

/**
 * Resolves the Better Auth session (owned by the Hono API) on every request and
 * exposes the user via `event.locals.user`. Hono stays the single auth
 * authority; the web app just forwards the cookie and reads the result.
 */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  try {
    const res = await apiFetch(event, "/api/auth/get-session");
    if (res.ok) {
      const data = (await res.json()) as {
        user?: { id: string; displayName: string | null; role: string };
      } | null;
      if (data?.user) {
        event.locals.user = {
          id: data.user.id,
          displayName: data.user.displayName ?? null,
          role: data.user.role,
        };
      }
    }
  } catch {
    // API unreachable — treat as guest.
  }

  return resolve(event, {
    filterSerializedResponseHeaders: (name) => name === "content-type",
  });
};

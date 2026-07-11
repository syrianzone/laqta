import { env as pub } from "$env/dynamic/public";
import { createAuthClient } from "better-auth/svelte";

/**
 * Browser-side Better Auth client. Sign-in/out run in the browser so OAuth
 * state cookies land on the user's browser (not the SvelteKit server). Points
 * at the Hono API, which is the auth authority.
 */
export const authClient = createAuthClient({
  baseURL: pub.PUBLIC_API_URL ?? "http://localhost:3000",
});

export function signInWithGoogle(callbackURL = "/") {
  return authClient.signIn.social({ provider: "google", callbackURL });
}

export function signOut() {
  return authClient.signOut();
}

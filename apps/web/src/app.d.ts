// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Locals {
      /** Resolved Better Auth session user, or null for guests. */
      user: {
        id: string;
        displayName: string | null;
        role: string;
      } | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface Platform {}
  }
}

export {};

import type { LayoutServerLoad } from "./$types";

/** Expose the resolved session user to every page for header/nav rendering. */
export const load: LayoutServerLoad = async ({ locals }) => {
  return { user: locals.user };
};

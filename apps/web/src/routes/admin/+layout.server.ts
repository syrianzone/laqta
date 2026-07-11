import { hasAtLeastRole, type UserRole } from "@laqta/core";
import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/** Gate the whole /admin area to moderators and admins. */
export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, "يجب تسجيل الدخول");
  if (!hasAtLeastRole(locals.user.role as UserRole, "moderator")) {
    throw error(403, "صلاحيات غير كافية");
  }
  return { user: locals.user };
};

import { apiFetch } from "$lib/server/api";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, "/me");
  const profile = res.ok ? await res.json() : null;
  return { profile };
};

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const res = await apiFetch(event, "/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: String(form.get("displayName") ?? ""),
        bio: String(form.get("bio") ?? ""),
        creditFormat: String(form.get("creditFormat") ?? ""),
      }),
    });
    if (!res.ok) return fail(res.status, { message: "تعذّر الحفظ" });
    return { ok: true };
  },
  deleteAccount: async (event) => {
    const res = await apiFetch(event, "/me/account", { method: "DELETE" });
    if (!res.ok) return fail(res.status, { message: "تعذّر حذف الحساب" });
    return { deleted: true };
  },
};

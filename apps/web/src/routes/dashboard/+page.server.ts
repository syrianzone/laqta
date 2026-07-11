import { apiFetch } from "$lib/server/api";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

interface MyPhoto {
  id: string;
  slug: string;
  titleAr: string | null;
  titleEn: string | null;
  status: string;
  thumb: string;
  viewsCount: number;
  downloadsCount: number;
  likesCount: number;
}

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, "/me/photos");
  const photos = res.ok ? ((await res.json()) as { items: MyPhoto[] }).items : [];
  return { photos };
};

export const actions: Actions = {
  delete: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id"));
    const res = await apiFetch(event, `/me/photos/${id}`, { method: "DELETE" });
    if (!res.ok) return fail(res.status, { message: "تعذّر الحذف" });
    return { ok: true };
  },
};

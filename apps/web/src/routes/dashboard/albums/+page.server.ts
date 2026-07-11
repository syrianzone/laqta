import { apiFetch } from "$lib/server/api";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

interface Album {
  id: string;
  slug: string;
  titleAr: string | null;
  titleEn: string | null;
  count: number;
}

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, "/me/albums");
  const albums = res.ok ? ((await res.json()) as { items: Album[] }).items : [];
  return { albums };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    const titleAr = String(form.get("titleAr") ?? "").trim();
    if (!titleAr) return fail(400, { message: "العنوان مطلوب" });
    const res = await apiFetch(event, "/me/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titleAr }),
    });
    if (!res.ok) return fail(res.status, { message: "تعذّر الإنشاء" });
    return { ok: true };
  },
  delete: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id"));
    const res = await apiFetch(event, `/me/albums/${id}`, { method: "DELETE" });
    if (!res.ok) return fail(res.status, { message: "تعذّر الحذف" });
    return { ok: true };
  },
};

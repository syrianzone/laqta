import { fail } from "@sveltejs/kit";
import { apiFetch } from "$lib/server/api";
import type { Actions, PageServerLoad } from "./$types";

interface QueueItem {
  id: string;
  slug: string;
  titleAr: string | null;
  titleEn: string | null;
  blurhash: string | null;
  thumbUrl: string;
  ownerName: string | null;
  ownerId: string;
  ai: { verdict: string; scores: unknown; reason: string | null } | null;
}

export const load: PageServerLoad = async (event) => {
  const status = event.url.searchParams.get("status") ?? "pending";
  const res = await apiFetch(event, `/admin/queue?status=${status}`);
  const data = res.ok
    ? ((await res.json()) as { status: string; items: QueueItem[] })
    : { status, items: [] };
  return { status: data.status, items: data.items };
};

export const actions: Actions = {
  approve: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id"));
    const res = await apiFetch(event, `/admin/photos/${id}/approve`, {
      method: "POST",
    });
    if (!res.ok) return fail(res.status, { message: "تعذّر الاعتماد" });
    return { ok: true };
  },
  reject: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id"));
    const reason = String(form.get("reason") ?? "");
    const res = await apiFetch(event, `/admin/photos/${id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) return fail(res.status, { message: "تعذّر الرفض" });
    return { ok: true };
  },
};

import { apiFetch } from "$lib/server/api";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, "/me/api-keys");
  const keys = res.ok ? ((await res.json()) as { items: ApiKey[] }).items : [];
  return { keys };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) return fail(400, { message: "الاسم مطلوب" });
    const res = await apiFetch(event, "/me/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return fail(res.status, { message: "تعذّر الإنشاء" });
    const created = (await res.json()) as { key: string };
    // The full secret is shown exactly once.
    return { createdKey: created.key };
  },
  revoke: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id"));
    const res = await apiFetch(event, `/me/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) return fail(res.status, { message: "تعذّر الإلغاء" });
    return { ok: true };
  },
};

import { env as pub } from "$env/dynamic/public";
import { apiFetch } from "$lib/server/api";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, `/ssr/photos/${event.params.slug}`);
  if (res.status === 404) throw error(404, "الصورة غير موجودة");
  if (!res.ok) throw error(500, "تعذّر تحميل الصورة");
  const photo = await res.json();

  const simRes = await apiFetch(event, `/ssr/photos/${event.params.slug}/similar`);
  const similar = simRes.ok
    ? ((await simRes.json()) as { items: unknown[] }).items
    : [];

  return {
    photo,
    similar,
    apiUrl: pub.PUBLIC_API_URL ?? "http://localhost:3000",
    webUrl: pub.PUBLIC_WEB_URL ?? "http://localhost:5173",
  };
};

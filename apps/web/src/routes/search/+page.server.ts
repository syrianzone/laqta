import { apiFetch } from "$lib/server/api";
import type { PhotoCardData } from "$lib/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const q = event.url.searchParams.get("q") ?? "";
  if (!q.trim()) return { q, items: [] as PhotoCardData[], found: 0, mode: "keyword" };
  const res = await apiFetch(event, `/ssr/search?q=${encodeURIComponent(q)}`);
  const data = res.ok
    ? ((await res.json()) as { items: PhotoCardData[]; found: number; mode: string })
    : { items: [], found: 0, mode: "keyword" };
  return { q, ...data };
};

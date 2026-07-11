import { apiFetch } from "$lib/server/api";
import type { PhotoCardData } from "$lib/types";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

interface AlbumMeta {
  id: string;
  titleAr: string | null;
  titleEn: string | null;
  owner: string | null;
}

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, `/ssr/albums/${event.params.id}`);
  if (res.status === 404) throw error(404, "الألبوم غير موجود");
  if (!res.ok) throw error(500, "تعذّر التحميل");
  const data = (await res.json()) as { album: AlbumMeta; items: PhotoCardData[] };
  return data;
};

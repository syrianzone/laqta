import { apiFetch } from "$lib/server/api";
import type { Category, PhotoCardData } from "$lib/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { slug } = event.params;
  const [photosRes, catsRes] = await Promise.all([
    apiFetch(event, `/ssr/photos?category=${encodeURIComponent(slug)}`),
    apiFetch(event, "/ssr/categories"),
  ]);
  const photos = photosRes.ok
    ? ((await photosRes.json()) as { items: PhotoCardData[] }).items
    : [];
  const categories = catsRes.ok
    ? ((await catsRes.json()) as { items: Category[] }).items
    : [];
  const category = categories.find((c) => c.slug === slug) ?? null;
  return { photos, category, slug };
};

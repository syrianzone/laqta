import { env as pub } from "$env/dynamic/public";
import { apiFetch } from "$lib/server/api";
import { LICENSE_INFO, LICENSES } from "@laqta/core";
import type { Category } from "$lib/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const res = await apiFetch(event, "/ssr/categories");
  const categories = res.ok
    ? ((await res.json()) as { items: Category[] }).items
    : [];
  return {
    categories,
    licenses: LICENSES.map((id) => ({ id, name: LICENSE_INFO[id].name_ar })),
    apiUrl: pub.PUBLIC_API_URL ?? "http://localhost:3000",
  };
};

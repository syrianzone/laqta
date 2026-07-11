import { env } from "@laqta/config";
import { EMBEDDING_DIM } from "@laqta/core";
import Typesense from "typesense";
import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections";

export const PHOTOS_COLLECTION = "photos";

export const client = new Typesense.Client({
  nodes: [
    {
      host: env.TYPESENSE_HOST,
      port: env.TYPESENSE_PORT,
      protocol: env.TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5,
});

/**
 * Collection schema. Text fields cover both Arabic and English; the semantic
 * layer is the `embedding` vector (cosine). Typesense lacks Arabic stemming, so
 * typo tolerance + the vector field carry semantic recall (see plan §5).
 */
export const photosCollectionSchema: CollectionCreateSchema = {
  name: PHOTOS_COLLECTION,
  fields: [
    { name: "title_ar", type: "string", optional: true },
    { name: "title_en", type: "string", optional: true },
    { name: "caption_ar", type: "string", optional: true },
    { name: "caption_en", type: "string", optional: true },
    { name: "desc_ar", type: "string", optional: true },
    { name: "desc_en", type: "string", optional: true },
    { name: "tags", type: "string[]", facet: true, optional: true },
    { name: "category", type: "string", facet: true, optional: true },
    { name: "license", type: "string", facet: true },
    { name: "credit", type: "string", optional: true },
    { name: "slug", type: "string" },
    { name: "width", type: "int32", optional: true },
    { name: "height", type: "int32", optional: true },
    { name: "dominant_color", type: "string", optional: true },
    { name: "blurhash", type: "string", optional: true },
    { name: "lat", type: "float", optional: true },
    { name: "lng", type: "float", optional: true },
    { name: "published_at", type: "int64" },
    { name: "popularity", type: "int32" },
    {
      name: "embedding",
      type: "float[]",
      num_dim: EMBEDDING_DIM,
      optional: true,
    },
  ],
  default_sorting_field: "popularity",
};

export interface PhotoDocument {
  id: string;
  title_ar?: string;
  title_en?: string;
  caption_ar?: string;
  caption_en?: string;
  desc_ar?: string;
  desc_en?: string;
  tags?: string[];
  category?: string;
  license: string;
  credit?: string;
  slug: string;
  width?: number;
  height?: number;
  dominant_color?: string;
  blurhash?: string;
  lat?: number;
  lng?: number;
  published_at: number;
  popularity: number;
  embedding?: number[];
}

/** Creates the collection if missing. Idempotent — safe on every boot. */
export async function ensureCollection(): Promise<void> {
  try {
    await client.collections(PHOTOS_COLLECTION).retrieve();
  } catch {
    await client.collections().create(photosCollectionSchema);
  }
}

export async function indexPhoto(doc: PhotoDocument): Promise<void> {
  await client.collections(PHOTOS_COLLECTION).documents().upsert(doc);
}

export async function deindexPhoto(id: string): Promise<void> {
  try {
    await client.collections(PHOTOS_COLLECTION).documents(id).delete();
  } catch {
    // already gone — ignore
  }
}

export interface SearchParams {
  q: string;
  locale?: "ar" | "en";
  category?: string;
  license?: string;
  page?: number;
  perPage?: number;
}

/** Keyword search across bilingual fields, biased to the active locale. */
export async function searchPhotos(params: SearchParams) {
  const filters: string[] = [];
  if (params.category) filters.push(`category:=${params.category}`);
  if (params.license) filters.push(`license:=${params.license}`);
  return client
    .collections<PhotoDocument>(PHOTOS_COLLECTION)
    .documents()
    .search({
      q: params.q || "*",
      query_by:
        "title_ar,title_en,caption_ar,caption_en,desc_ar,desc_en,tags,credit",
      filter_by: filters.join(" && ") || undefined,
      sort_by: "_text_match:desc,popularity:desc",
      page: params.page ?? 1,
      per_page: Math.min(params.perPage ?? 24, 100),
    });
}

/** Nearest-neighbor semantic search / "similar images" via a raw vector. */
export async function similarByVector(
  embedding: number[],
  excludeId?: string,
  perPage = 12,
) {
  const filter = excludeId ? `id:!=${excludeId}` : undefined;
  return client
    .collections<PhotoDocument>(PHOTOS_COLLECTION)
    .documents()
    .search({
      q: "*",
      query_by: "title_ar",
      filter_by: filter,
      vector_query: `embedding:([${embedding.join(",")}], k:${perPage})`,
      per_page: perPage,
    });
}

/**
 * "Similar images" for an existing indexed photo — references its stored vector
 * by document id, so no embedding round-trip is needed. The reference doc is
 * excluded from results by Typesense.
 */
export async function similarByDocId(id: string, perPage = 12) {
  return client
    .collections<PhotoDocument>(PHOTOS_COLLECTION)
    .documents()
    .search({
      q: "*",
      query_by: "title_ar",
      vector_query: `embedding:([], id: ${id}, k:${perPage})`,
      per_page: perPage,
    });
}

/**
 * Hybrid semantic + keyword search: pass a pre-computed query embedding to blend
 * vector similarity with the keyword match. When no embedding is available
 * (e.g. embedding provider offline), falls back to pure keyword via searchPhotos.
 */
export async function hybridSearch(params: SearchParams, queryEmbedding: number[]) {
  const filters: string[] = [];
  if (params.category) filters.push(`category:=${params.category}`);
  if (params.license) filters.push(`license:=${params.license}`);
  return client
    .collections<PhotoDocument>(PHOTOS_COLLECTION)
    .documents()
    .search({
      q: params.q || "*",
      query_by:
        "title_ar,title_en,caption_ar,caption_en,desc_ar,desc_en,tags,credit",
      filter_by: filters.join(" && ") || undefined,
      vector_query: `embedding:([${queryEmbedding.join(",")}], k:${params.perPage ?? 24})`,
      page: params.page ?? 1,
      per_page: Math.min(params.perPage ?? 24, 100),
    });
}

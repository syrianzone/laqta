import { env } from "@laqta/config";
import { parseJsonFromModel, visionChat } from "@laqta/core";
import { db, photoRenditions, photos } from "@laqta/db";
import { type GenerateAltJob, enqueue } from "@laqta/queue";
import { publicUrl } from "@laqta/storage";
import { and, eq } from "drizzle-orm";

interface AltResult {
  alt_ar: string;
  alt_en: string;
}

const SYSTEM = `You write concise, descriptive alt text for a Syrian photo archive.
Describe what is visibly in the image for accessibility (screen readers). Keep each under
125 characters. Respond ONLY with minified JSON: {"alt_ar":"...","alt_en":"..."}.
The Arabic alt text must be in Syrian Arabic (ar-SY) and is the primary output.`;

/**
 * Generates accessibility alt text when the contributor left it blank — Arabic
 * (ar-SY) primary plus an English translation — then re-indexes search.
 */
export async function generateAlt({ photoId }: GenerateAltJob): Promise<void> {
  const [p] = await db
    .select({ altAr: photos.altAr, altEn: photos.altEn })
    .from(photos)
    .where(eq(photos.id, photoId));
  if (!p) throw new Error(`generate_alt: photo ${photoId} not found`);
  // Respect contributor-provided alt text.
  if (p.altAr && p.altEn) return;

  const [medium] = await db
    .select({ key: photoRenditions.key })
    .from(photoRenditions)
    .where(
      and(
        eq(photoRenditions.photoId, photoId),
        eq(photoRenditions.variant, "medium"),
      ),
    );
  if (!medium) throw new Error(`generate_alt: no medium rendition for ${photoId}`);

  const raw = await visionChat(env.OPENROUTER_MODEL_CAPTION, {
    system: SYSTEM,
    prompt: "Write alt text for this image.",
    imageUrl: publicUrl(medium.key),
  });
  const alt = parseJsonFromModel<AltResult>(raw);

  await db
    .update(photos)
    .set({
      altAr: p.altAr || alt.alt_ar,
      altEn: p.altEn || alt.alt_en,
    })
    .where(eq(photos.id, photoId));

  // Re-embed (alt enriches semantics) and re-index.
  await enqueue("embed", { photoId });
}

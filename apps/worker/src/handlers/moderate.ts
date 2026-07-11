import { env } from "@laqta/config";
import {
  type UserRole,
  bypassesModerationQueue,
  parseJsonFromModel,
  visionChat,
} from "@laqta/core";
import { db, moderationEvents, photoRenditions, photos, user } from "@laqta/db";
import { type ModerateJob, enqueue } from "@laqta/queue";
import { publicUrl } from "@laqta/storage";
import { and, eq } from "drizzle-orm";

/** Structured verdict returned by the vision model. */
interface Verdict {
  nsfw: boolean;
  violence: boolean;
  hate: boolean;
  on_topic: boolean;
  confidence: number;
  reason: string;
}

const SYSTEM = `You are a strict content moderator for Laqta, a Syrian stock-photo archive.
Assess the image for: adult/sexual content (nsfw), graphic violence, hate symbols, and
whether it is on-topic for a Syrian photography archive (architecture, nature, daily life,
food, historical landmarks, people, cities). Respond ONLY with minified JSON matching:
{"nsfw":bool,"violence":bool,"hate":bool,"on_topic":bool,"confidence":0..1,"reason":"short"}`;

const PROMPT =
  "Moderate this image and return the JSON verdict. Be conservative: if unsure about safety, flag it.";

/**
 * MANDATORY AI moderation gate — every upload passes through here before it can
 * be published. Clean + trusted user → auto-publish; clean + untrusted →
 * pending admin queue; unsafe/off-topic → flagged for admin review.
 */
export async function moderate({ photoId }: ModerateJob): Promise<void> {
  const [row] = await db
    .select({
      id: photos.id,
      status: photos.status,
      ownerRole: user.role,
      altAr: photos.altAr,
    })
    .from(photos)
    .innerJoin(user, eq(photos.userId, user.id))
    .where(eq(photos.id, photoId));
  if (!row) throw new Error(`moderate: photo ${photoId} not found`);

  // Moderate on the medium rendition (public URL the vision model can fetch).
  const [medium] = await db
    .select({ key: photoRenditions.key })
    .from(photoRenditions)
    .where(
      and(
        eq(photoRenditions.photoId, photoId),
        eq(photoRenditions.variant, "medium"),
      ),
    );
  if (!medium) throw new Error(`moderate: no medium rendition for ${photoId}`);

  const raw = await visionChat(env.OPENROUTER_MODEL_MODERATION, {
    system: SYSTEM,
    prompt: PROMPT,
    imageUrl: publicUrl(medium.key),
  });
  const verdict = parseJsonFromModel<Verdict>(raw);
  const flagged =
    verdict.nsfw || verdict.violence || verdict.hate || !verdict.on_topic;

  await db.insert(moderationEvents).values({
    photoId,
    source: "ai",
    verdict: flagged ? "flagged" : "clean",
    scores: verdict as unknown as Record<string, unknown>,
    reason: verdict.reason,
  });

  if (flagged) {
    await db
      .update(photos)
      .set({ status: "flagged" })
      .where(eq(photos.id, photoId));
    return;
  }

  if (bypassesModerationQueue(row.ownerRole as UserRole)) {
    await publishPhoto(photoId, !row.altAr);
  } else {
    await db
      .update(photos)
      .set({ status: "pending" })
      .where(eq(photos.id, photoId));
  }
}

/**
 * Transition a photo to published and fan out the post-publish jobs. Shared by
 * trusted auto-publish (here) and admin approval (the API enqueues the same).
 */
export async function publishPhoto(
  photoId: string,
  needsAlt: boolean,
): Promise<void> {
  await db
    .update(photos)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(photos.id, photoId));
  await enqueue("embed", { photoId });
  if (needsAlt) await enqueue("generate_alt", { photoId });
  await enqueue("index_search", { photoId });
}

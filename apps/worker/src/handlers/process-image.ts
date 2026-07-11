import {
  RENDITION_MAX_EDGE,
  RENDITION_VARIANTS,
  type RenditionVariant,
} from "@laqta/core";
import { db, photoRenditions, photos } from "@laqta/db";
import { type ProcessImageJob, enqueue } from "@laqta/queue";
import { getObjectBytes, putObject, renditionKey } from "@laqta/storage";
import { encode as blurhashEncode } from "blurhash";
import { eq } from "drizzle-orm";
import exifr from "exifr";
import sharp from "sharp";

/** Curated, non-sensitive-but-valuable camera fields surfaced on the photo page. */
interface CameraExif {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: number;
  fNumber?: number;
  exposureTime?: number;
  iso?: number;
  takenAt?: string;
}

/**
 * Generates web renditions (WebP), a BlurHash LQIP, extracts dimensions +
 * dominant color, and preserves full EXIF — GPS included, parsed into lat/lng,
 * because geotags of cultural/public sites are a feature. Then hands off to the
 * (mandatory) AI moderation step.
 */
export async function processImage({ photoId }: ProcessImageJob): Promise<void> {
  const [photo] = await db
    .select({ id: photos.id, originalKey: photos.originalKey })
    .from(photos)
    .where(eq(photos.id, photoId));
  if (!photo) throw new Error(`process_image: photo ${photoId} not found`);

  const bytes = await getObjectBytes(photo.originalKey);
  const buf = Buffer.from(bytes);

  const base = sharp(buf, { failOn: "none" });
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // Renditions (WebP), longest-edge capped, never upscaled.
  for (const variant of RENDITION_VARIANTS) {
    const rendition = await sharp(buf, { failOn: "none" })
      .rotate() // honor EXIF orientation, then bake it in
      .resize({
        width: RENDITION_MAX_EDGE[variant],
        height: RENDITION_MAX_EDGE[variant],
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: variant === "thumb" ? 70 : 82 })
      .toBuffer({ resolveWithObject: true });

    const key = renditionKey(photoId, variant, "webp");
    await putObject(key, rendition.data, "image/webp");
    await db
      .insert(photoRenditions)
      .values({
        photoId,
        variant: variant as RenditionVariant,
        key,
        width: rendition.info.width,
        height: rendition.info.height,
        format: "webp",
        bytes: rendition.info.size,
      })
      .onConflictDoUpdate({
        target: [photoRenditions.photoId, photoRenditions.variant],
        set: {
          key,
          width: rendition.info.width,
          height: rendition.info.height,
          bytes: rendition.info.size,
        },
      });
  }

  const [blurhash, dominantColor] = await Promise.all([
    computeBlurhash(buf),
    computeDominantColor(buf),
  ]);
  const { exif, lat, lng } = await extractExif(buf);

  await db
    .update(photos)
    .set({ width, height, blurhash, dominantColor, exif, lat, lng })
    .where(eq(photos.id, photoId));

  await enqueue("moderate", { photoId });
}

async function computeBlurhash(buf: Buffer): Promise<string> {
  const { data, info } = await sharp(buf, { failOn: "none" })
    .rotate()
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  return blurhashEncode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4,
    3,
  );
}

async function computeDominantColor(buf: Buffer): Promise<string> {
  const { dominant } = await sharp(buf, { failOn: "none" }).stats();
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
}

async function extractExif(
  buf: Buffer,
): Promise<{ exif: CameraExif; lat: number | null; lng: number | null }> {
  let lat: number | null = null;
  let lng: number | null = null;
  const exif: CameraExif = {};
  try {
    const tags = (await exifr.parse(buf, {
      gps: true,
      pick: [
        "Make",
        "Model",
        "LensModel",
        "FocalLength",
        "FNumber",
        "ExposureTime",
        "ISO",
        "DateTimeOriginal",
        "latitude",
        "longitude",
      ],
    })) as Record<string, unknown> | undefined;
    if (tags) {
      exif.make = str(tags.Make);
      exif.model = str(tags.Model);
      exif.lens = str(tags.LensModel);
      exif.focalLength = num(tags.FocalLength);
      exif.fNumber = num(tags.FNumber);
      exif.exposureTime = num(tags.ExposureTime);
      exif.iso = num(tags.ISO);
      exif.takenAt =
        tags.DateTimeOriginal instanceof Date
          ? tags.DateTimeOriginal.toISOString()
          : undefined;
      lat = num(tags.latitude) ?? null;
      lng = num(tags.longitude) ?? null;
    }
  } catch {
    // No/invalid EXIF — fine.
  }
  return { exif, lat, lng };
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

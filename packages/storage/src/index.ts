import { env } from "@laqta/config";
import { S3Client } from "bun";

/**
 * Cloudflare R2 access via Bun's native S3 client (no external AWS SDK — we run
 * on Bun everywhere). Locally this points at MinIO; in production at R2.
 * Originals live under `originals/`, renditions under `renditions/`. The bucket
 * and public-read policy for renditions are provisioned by infra (the MinIO
 * `mc` init container locally; Cloudflare config on real R2), not by the app.
 */
const s3 = new S3Client({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucket: env.R2_BUCKET,
  endpoint: env.R2_ENDPOINT,
  region: "auto",
});

export const BUCKET = env.R2_BUCKET;

export function originalKey(photoId: string, ext: string): string {
  return `originals/${photoId}.${ext}`;
}

export function renditionKey(
  photoId: string,
  variant: string,
  ext: string,
): string {
  return `renditions/${photoId}/${variant}.${ext}`;
}

/** Presigned PUT URL for direct browser→R2 upload of an original. */
export function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 600,
): string {
  return s3.presign(key, { method: "PUT", expiresIn, type: contentType });
}

/** Presigned GET URL for the download-gated original. */
export function presignDownload(key: string, expiresIn = 120): string {
  return s3.presign(key, { method: "GET", expiresIn });
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  return s3.file(key).bytes();
}

export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await s3.write(key, body, { type: contentType });
}

/** Delete many objects (right-to-be-forgotten / photo deletion). */
export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => s3.delete(key)));
}

export async function objectExists(key: string): Promise<boolean> {
  return s3.exists(key);
}

/**
 * Public URL for a rendition object (thumb / medium / large WebP).
 *
 * R2_PUBLIC_BASE_URL can point to a dedicated CDN subdomain **or** directly
 * to your main site (e.g. https://laqta.syrian.zone). In the latter case you
 * are responsible for making /renditions/* resolve to the R2 bucket
 * (Cloudflare Worker is the usual lightweight way).
 */
export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

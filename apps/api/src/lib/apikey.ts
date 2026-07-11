/**
 * Developer API key generation and verification. Keys look like
 * `laqta_<prefix>_<secret>`. Only the SHA-256 hash is stored; the `prefix` is
 * kept in plaintext for O(1) lookup. The full key is shown to the user once.
 */
const PREFIX_LEN = 8;
const SECRET_LEN = 32;

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function sha256Hex(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

export interface GeneratedKey {
  fullKey: string;
  prefix: string;
  keyHash: string;
}

export function generateApiKey(): GeneratedKey {
  const prefix = randomString(PREFIX_LEN);
  const secret = randomString(SECRET_LEN);
  const fullKey = `laqta_${prefix}_${secret}`;
  return { fullKey, prefix, keyHash: sha256Hex(fullKey) };
}

/** Extract the lookup prefix from a presented key, or null if malformed. */
export function keyPrefix(fullKey: string): string | null {
  const m = fullKey.match(/^laqta_([A-Za-z0-9]{8})_[A-Za-z0-9]+$/);
  return m ? m[1]! : null;
}

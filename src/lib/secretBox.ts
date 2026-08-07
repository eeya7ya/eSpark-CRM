import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated symmetric encryption for secrets the app must be able to read
 * back — mailbox passwords, workspace database connection strings — as opposed
 * to secrets it only ever needs to compare, which are hashed instead (see
 * `hashPassword` in auth.ts).
 *
 *   • AES-256-GCM with a fresh random 96-bit IV per value.
 *   • GCM gives confidentiality AND integrity: the 128-bit auth tag is verified
 *     on decrypt, so a tampered ciphertext fails loudly rather than returning
 *     garbage.
 *   • Stored form is the colon-joined base64 triplet `iv:authTag:ciphertext`.
 *
 * Each caller names its own env var to key from, so unrelated classes of secret
 * do not share a key. Compromising the mailbox key must not also hand over
 * every workspace's database credentials.
 *
 * Keys live only in the environment — never in the database or the codebase.
 */

function getKey(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(
      `${envVar} is not set — generate one with \`openssl rand -base64 32\` and add it to the environment.`,
    );
  }
  // Accept hex (64 chars) or base64 (typically 44 chars). Either must decode
  // to exactly 32 bytes for AES-256.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `${envVar} must decode to 32 bytes (use \`openssl rand -base64 32\`).`,
    );
  }
  return key;
}

export function encryptWithKey(envVar: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(envVar), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptWithKey(envVar: string, stored: string): string {
  const [ivB64, tagB64, ctB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Stored secret is malformed.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(envVar),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the named key is configured — lets the UI warn operators early. */
export function keyReady(envVar: string): boolean {
  try {
    getKey(envVar);
    return true;
  } catch {
    return false;
  }
}

import { encryptWithKey, decryptWithKey, keyReady } from "./secretBox";

/**
 * Reversible secret encryption for mailbox passwords.
 *
 * Mailbox passwords CANNOT be hashed — we need the plaintext to authenticate to
 * the customer's IMAP/SMTP server — so they are encrypted with authenticated
 * symmetric encryption instead. The primitive lives in `secretBox.ts`; this
 * module just binds it to the mailbox key.
 *
 * Decryption only ever happens server-side, in-memory, at the moment a
 * connection is opened — the plaintext is never returned to the client.
 */

const KEY_ENV = "EMAIL_ENCRYPTION_KEY";

export function encryptSecret(plaintext: string): string {
  return encryptWithKey(KEY_ENV, plaintext);
}

export function decryptSecret(stored: string): string {
  return decryptWithKey(KEY_ENV, stored);
}

/** True when the encryption key is configured — lets the UI warn admins early. */
export function emailEncryptionReady(): boolean {
  return keyReady(KEY_ENV);
}

import { InvalidRandomBytesError, type RandomBytes } from "../../access/domain/invitation-token.ts";

/** A full API key `<prefix>_<publicId>_<secret>` split into its parts (decision 0008 §1). */
export type ApiKeyParts = { readonly prefix: string; readonly publicId: string; readonly secret: string };

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PUBLIC_ID_LENGTH = 12;
const PUBLIC_ID_BYTES = 8; // 64 bits → 13 base32 chars, the first 12 are kept (60 bits).
/** 256 bits. */
export const API_KEY_SECRET_BYTES = 32;

const takeBytes = (randomBytes: RandomBytes, size: number): Uint8Array => {
  const bytes = randomBytes(size);
  if (bytes.length < size) throw new InvalidRandomBytesError();
  return bytes.subarray(0, size);
};

/** RFC 4648 base32 without padding. */
const toBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? output + BASE32_ALPHABET[(value << (5 - bits)) & 31] : output;
};

/**
 * A new publicId (12 base32 chars) and secret (32 random bytes, base64url, 43 chars).
 * @throws {InvalidRandomBytesError} when `randomBytes` returns fewer bytes than asked.
 */
export const generateApiKeyParts = (randomBytes: RandomBytes): { publicId: string; secret: string } => ({
  publicId: toBase32(takeBytes(randomBytes, PUBLIC_ID_BYTES)).slice(0, PUBLIC_ID_LENGTH),
  secret: Buffer.from(takeBytes(randomBytes, API_KEY_SECRET_BYTES)).toString("base64url"),
});

export const formatApiKey = (parts: ApiKeyParts): string => `${parts.prefix}_${parts.publicId}_${parts.secret}`;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a credential of this deployment's prefix; the secret may contain `_` (base64url),
 * so the shape is matched as a whole.
 * @returns null for another prefix or a malformed key.
 */
export const parseApiKey = (credential: string, prefix: string): ApiKeyParts | null => {
  const match = new RegExp(`^${escapeRegExp(prefix)}_([A-Z2-7]{${PUBLIC_ID_LENGTH}})_([A-Za-z0-9_-]{43})$`).exec(
    credential,
  );
  return match?.[1] === undefined || match[2] === undefined ? null : { prefix, publicId: match[1], secret: match[2] };
};

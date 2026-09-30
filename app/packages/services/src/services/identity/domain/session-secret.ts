import { timingSafeEqual } from "node:crypto";
import { InvalidRandomBytesError, type RandomBytes } from "../../access/domain/invitation-token.ts";
import { sha256Hex } from "../../shared/crypto/sha256.ts";

/** 256 bits (decision 0007 §5). */
export const SESSION_SECRET_BYTES = 32;

const HEX_DIGEST = /^[a-f0-9]{64}$/;

/**
 * A new desktop session secret: 32 random bytes, base64url without padding (43 chars).
 * @throws {InvalidRandomBytesError} when `randomBytes` returns fewer than 32 bytes.
 */
export const generateSessionSecret = (randomBytes: RandomBytes): string => {
  const bytes = randomBytes(SESSION_SECRET_BYTES);
  if (bytes.length < SESSION_SECRET_BYTES) throw new InvalidRandomBytesError();
  return Buffer.from(bytes.subarray(0, SESSION_SECRET_BYTES)).toString("base64url");
};

/** What `sessions.secretHash` / `cookieHash` store: the sha256 hex of the value, never the value. */
export const hashSessionSecret = (value: string): string => sha256Hex(value);

/**
 * Constant-time comparison of two sha256 hex digests (rules/security.md: `timingSafeEqual`).
 * Malformed digests never match.
 */
export const secretHashesMatch = (left: string, right: string): boolean => {
  if (!HEX_DIGEST.test(left) || !HEX_DIGEST.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

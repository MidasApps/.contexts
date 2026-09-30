import type { SupportedLocale } from "@core/i18n/locales";
import { sha256Hex } from "../../shared/crypto/sha256.ts";

/** Injected source of randomness (`crypto.randomBytes` in production, fixed bytes in tests). */
export type RandomBytes = (size: number) => Uint8Array;

/** 256 bits (SP1 spec §6.2). */
export const INVITATION_TOKEN_BYTES = 32;

/** Bug: the injected generator returned fewer bytes than asked for. */
export class InvalidRandomBytesError extends Error {
  readonly code = "INVALID_RANDOM_BYTES";

  constructor() {
    super("INVALID_RANDOM_BYTES: the random generator returned fewer bytes than requested");
    this.name = "InvalidRandomBytesError";
  }
}

/**
 * A new invitation token: 32 random bytes, base64url without padding (43 chars).
 * @throws {InvalidRandomBytesError} when `randomBytes` returns fewer than 32 bytes.
 */
export const generateInvitationToken = (randomBytes: RandomBytes): string => {
  const bytes = randomBytes(INVITATION_TOKEN_BYTES);
  if (bytes.length < INVITATION_TOKEN_BYTES) throw new InvalidRandomBytesError();
  return Buffer.from(bytes.subarray(0, INVITATION_TOKEN_BYTES)).toString("base64url");
};

/** What `invitations.tokenHash` stores: the sha256 of the token, never the token. */
export const hashInvitationToken = (token: string): string => sha256Hex(token);

/**
 * One-time accept link `${appUrl}/{locale}/invite#token=<token>`: the web renders every page
 * under a supported locale (decision 0012), and the fragment never reaches the server, so the
 * token stays out of access logs.
 */
export const buildAcceptUrl = (args: { appUrl: string; token: string; locale: SupportedLocale }): string =>
  `${args.appUrl.replace(/\/+$/, "")}/${args.locale}/invite#token=${args.token}`;

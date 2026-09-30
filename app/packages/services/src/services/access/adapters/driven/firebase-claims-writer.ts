import type { Auth } from "firebase-admin/auth";
import { CORE_CLAIM_KEYS, type ClaimsWriter } from "../../application/ports/driven/claims-writer.ts";

/** Firebase caps the serialized custom claims at 1000 bytes. */
export const MAX_CLAIMS_BYTES = 1000;

/** Bug guard: the merged claims would exceed Firebase's limit; nothing is written. */
export class ClaimsTooLargeError extends Error {
  readonly code = "CLAIMS_TOO_LARGE";
  readonly bytes: number;

  constructor(bytes: number) {
    super(`custom claims would take ${bytes} bytes (limit ${MAX_CLAIMS_BYTES})`);
    this.name = "ClaimsTooLargeError";
    this.bytes = bytes;
  }
}

const OWNED: ReadonlySet<string> = new Set(CORE_CLAIM_KEYS);

/**
 * Firebase `ClaimsWriter`: read-modify-write, because `setCustomUserClaims` replaces the
 * whole object. Claims the core does not own (`principalType`, `imp`, …) are kept; the
 * core keys are replaced, and an absent optional key is removed.
 * @throws {ClaimsTooLargeError} when the result would reach 1000 bytes.
 */
export const createFirebaseClaimsWriter = (deps: { auth: Pick<Auth, "getUser" | "setCustomUserClaims"> }): ClaimsWriter => ({
  writeClaims: async (uid, claims) => {
    const current = (await deps.auth.getUser(uid)).customClaims ?? {};
    const kept = Object.fromEntries(Object.entries(current).filter(([key]) => !OWNED.has(key)));
    const next = { ...kept, ...claims };
    const bytes = Buffer.byteLength(JSON.stringify(next), "utf8");
    if (bytes >= MAX_CLAIMS_BYTES) throw new ClaimsTooLargeError(bytes);
    await deps.auth.setCustomUserClaims(uid, next);
  },
});

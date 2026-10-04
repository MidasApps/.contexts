import type { Auth } from "firebase-admin/auth";
import type { TokenVerifier } from "../../application/ports/driven/token-verifier.ts";

// firebase-admin reports token problems (malformed, expired, revoked, user disabled…) as
// `auth/*` codes; anything else (network, key fetch) is an infrastructure failure.
const isTokenRejection = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  typeof err.code === "string" &&
  err.code.startsWith("auth/");

/** Firebase Admin `TokenVerifier`: rejected tokens resolve to null (401), other errors rethrow (500). */
export const createFirebaseTokenVerifier = (deps: { auth: Pick<Auth, "verifyIdToken"> }): TokenVerifier => ({
  verifyIdToken: async (token, { checkRevoked }) => {
    try {
      const decoded = await deps.auth.verifyIdToken(token, checkRevoked);
      return {
        uid: decoded.uid,
        claims: decoded,
        signInProvider: decoded.firebase.sign_in_provider,
        secondFactor: decoded.firebase.sign_in_second_factor ?? null,
      };
    } catch (err: unknown) {
      if (isTokenRejection(err)) return null;
      throw err;
    }
  },
});

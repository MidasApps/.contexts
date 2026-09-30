import { UserIdSchema } from "@core/contracts";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { SessionCookieIssuer } from "../../application/ports/driven/session-cookie-issuer.ts";
import { provesMfa } from "../../application/use-cases/resolve-principal.ts";
import { isAuthRejection } from "./firebase-auth-errors.ts";

// Token problems resolve to null (401 / sign in again); infrastructure failures rethrow.
const orNull = async <T>(work: () => Promise<T>): Promise<T | null> => {
  try {
    return await work();
  } catch (err: unknown) {
    if (isAuthRejection(err)) return null;
    throw err;
  }
};

const mfaOf = (decoded: DecodedIdToken): boolean =>
  provesMfa({ claims: decoded, signInProvider: decoded.firebase.sign_in_provider, secondFactor: decoded.firebase.sign_in_second_factor ?? null });

/** Firebase Admin `SessionCookieIssuer`; every verification checks revocation (decision 0007). */
export const createFirebaseSessionCookieIssuer = (deps: { auth: Pick<Auth, "verifyIdToken" | "createSessionCookie" | "verifySessionCookie"> }): SessionCookieIssuer => ({
  verifyIdToken: (idToken) =>
    orNull(async () => {
      const decoded = await deps.auth.verifyIdToken(idToken, true);
      return { uid: UserIdSchema.parse(decoded.uid), authTimeSeconds: decoded.auth_time, mfa: mfaOf(decoded) };
    }),
  createSessionCookie: (idToken, { expiresInMs }) => deps.auth.createSessionCookie(idToken, { expiresIn: expiresInMs }),
  verifySessionCookie: (cookie) =>
    orNull(async () => {
      const decoded = await deps.auth.verifySessionCookie(cookie, true);
      return { uid: UserIdSchema.parse(decoded.uid) };
    }),
});

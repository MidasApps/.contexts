import type { Auth } from "firebase-admin/auth";
import type { CustomTokenIssuer } from "../../application/ports/driven/custom-token-issuer.ts";

/** Firebase Admin `createCustomToken` (the claims become developer claims of the ID token). */
export const createFirebaseCustomTokenIssuer = (deps: { auth: Pick<Auth, "createCustomToken"> }): CustomTokenIssuer => ({
  createCustomToken: (uid, claims) => deps.auth.createCustomToken(uid, { ...claims }),
});

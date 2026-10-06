import type { Auth } from "firebase-admin/auth";
import type { AuthUserAdmin } from "../../application/ports/driven/auth-user-admin.ts";
import { isUserNotFound } from "./firebase-auth-errors.ts";

/** Firebase Admin `AuthUserAdmin` (getUser, revokeRefreshTokens, createUser, updateUser). */
export const createFirebaseAuthUserAdmin = (deps: {
  auth: Pick<Auth, "getUser" | "revokeRefreshTokens" | "createUser" | "updateUser">;
}): AuthUserAdmin => ({
  getState: async (uid) => {
    try {
      const user = await deps.auth.getUser(uid);
      const validAfter = user.tokensValidAfterTime;
      return {
        disabled: user.disabled,
        tokensValidAfter: validAfter === undefined ? null : new Date(validAfter).toISOString(),
      };
    } catch (err: unknown) {
      if (isUserNotFound(err)) return null;
      throw err;
    }
  },
  revokeRefreshTokens: async (uid) => {
    try {
      await deps.auth.revokeRefreshTokens(uid);
    } catch (err: unknown) {
      // No account means no tokens to revoke.
      if (!isUserNotFound(err)) throw err;
    }
  },
  createAccount: async (uid, { displayName }) => {
    await deps.auth.createUser({ uid, displayName });
  },
  disable: async (uid) => {
    try {
      await deps.auth.updateUser(uid, { disabled: true });
    } catch (err: unknown) {
      if (!isUserNotFound(err)) throw err;
    }
  },
});

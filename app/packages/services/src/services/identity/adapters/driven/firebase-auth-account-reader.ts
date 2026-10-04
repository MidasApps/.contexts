import type { Auth } from "firebase-admin/auth";
import type { AuthAccountReader } from "../../application/ports/driven/auth-account-reader.ts";

const isUserNotFound = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === "auth/user-not-found";

/** Firebase Auth `AuthAccountReader`: profile and MFA enrollment of the account. */
export const createFirebaseAuthAccountReader = (deps: { auth: Pick<Auth, "getUser"> }): AuthAccountReader => ({
  getAccount: async (uid) => {
    try {
      const record = await deps.auth.getUser(uid);
      if (record.email === undefined) return null;
      return {
        profile: {
          email: record.email,
          displayName: record.displayName ?? "",
          ...(record.photoURL === undefined ? {} : { photoUrl: record.photoURL }),
        },
        mfaEnrolled: (record.multiFactor?.enrolledFactors.length ?? 0) > 0,
      };
    } catch (e: unknown) {
      if (isUserNotFound(e)) return null;
      throw e;
    }
  },
});

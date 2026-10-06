import type { Auth } from "firebase-admin/auth";
import type { UserAccountReader } from "../../application/ports/driven/user-account-reader.ts";

const isUserNotFound = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && e.code === "auth/user-not-found";

/** Firebase Auth `UserAccountReader`: email, display name and photo of the account. */
export const createFirebaseUserAccountReader = (deps: { auth: Pick<Auth, "getUser"> }): UserAccountReader => ({
  getProfile: async (uid) => {
    try {
      const record = await deps.auth.getUser(uid);
      if (record.email === undefined) return null;
      return {
        email: record.email,
        displayName: record.displayName ?? "",
        ...(record.photoURL === undefined ? {} : { photoUrl: record.photoURL }),
      };
    } catch (e: unknown) {
      if (isUserNotFound(e)) return null;
      throw e;
    }
  },
});

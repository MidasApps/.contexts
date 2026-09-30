import { UserIdSchema, type UserId } from "@core/contracts";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { DirectoryEntry, UserDirectory } from "../../application/ports/driven/user-directory.ts";

// Only the profile fields; a users doc created by access (status/version only) has no email yet.
const converter = createContractConverter({ schema: z.object({ email: z.email().optional(), displayName: z.string().optional() }) });
// Only the preferred locale, leniently: a missing or unreadable one is no preference.
const localeFields = createContractConverter({ schema: z.object({ preferences: z.object({ locale: z.string().min(1).optional() }).optional().catch(undefined) }) });

// `auth.getUsers` accepts at most 100 identifiers per call.
const AUTH_BATCH = 100;

const isUserNotFound = (e: unknown): boolean => typeof e === "object" && e !== null && "code" in e && e.code === "auth/user-not-found";

const entryOfRecord = (record: UserRecord): DirectoryEntry | null =>
  record.email === undefined ? null : { email: record.email, displayName: record.displayName ?? "" };

/**
 * `UserDirectory` over the app profile (`users/{uid}`: the name a user set with
 * `PATCH /v1/me`) with the Firebase Auth account as fallback, and Auth for the
 * verified email.
 */
export const createFirebaseUserDirectory = (deps: { firestore: Firestore; auth: Pick<Auth, "getUser" | "getUsers"> }): UserDirectory => {
  const fromAuth = async (uids: readonly UserId[]): Promise<Map<UserId, DirectoryEntry>> => {
    const found = new Map<UserId, DirectoryEntry>();
    for (let start = 0; start < uids.length; start += AUTH_BATCH) {
      const result = await deps.auth.getUsers(uids.slice(start, start + AUTH_BATCH).map((uid) => ({ uid })));
      for (const record of result.users) {
        const entry = entryOfRecord(record);
        if (entry !== null) found.set(UserIdSchema.parse(record.uid), entry);
      }
    }
    return found;
  };
  return {
    getMany: async (uids) => {
      if (uids.length === 0) return new Map();
      const refs = uids.map((uid) => deps.firestore.collection(CORE_COLLECTIONS.users).withConverter(converter).doc(uid));
      // One typed read per uid (a page holds at most 100 members); getAll drops the converter type.
      const snapshots = await Promise.all(refs.map((ref) => ref.get()));
      const found = new Map<UserId, DirectoryEntry>();
      snapshots.forEach((snapshot, index) => {
        const fields = snapshot.data();
        const uid = uids[index];
        if (uid !== undefined && fields?.email !== undefined) found.set(uid, { email: fields.email, displayName: fields.displayName ?? "" });
      });
      const missing = uids.filter((uid) => !found.has(uid));
      return missing.length === 0 ? found : new Map([...found, ...(await fromAuth(missing))]);
    },
    getPreferredLocale: async (uid) => (await deps.firestore.collection(CORE_COLLECTIONS.users).withConverter(localeFields).doc(uid).get()).data()?.preferences?.locale,
    getAccount: async (uid) => {
      try {
        const record = await deps.auth.getUser(uid);
        const entry = entryOfRecord(record);
        if (entry === null) return null;
        return { ...entry, emailVerified: record.emailVerified, ...(record.photoURL === undefined ? {} : { photoUrl: record.photoURL }) };
      } catch (e: unknown) {
        if (isUserNotFound(e)) return null;
        throw e;
      }
    },
  };
};

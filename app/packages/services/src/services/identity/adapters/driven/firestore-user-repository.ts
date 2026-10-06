import { DEFAULT_USER_PREFERENCES, type User, UserContract, type UserId, UserPreferencesSchema } from "@core/contracts";
import { type DocumentData, FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { NewUserProfile } from "#/services/access/application/ports/driven/user-access-version.ts";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "#/services/shared/firestore/contract-converter.ts";
import { CorruptDocumentError } from "#/services/shared/firestore/corrupt-document-error.ts";
import { runInTransaction } from "#/services/shared/firestore/transaction-runner.ts";
import { userSearchFields } from "#/services/shared/firestore/user-search-fields.ts";
import type { UserRepository } from "../../application/ports/driven/user-repository.ts";

const converter = createContractConverter(UserContract);

// Only the regional preferences; missing or unreadable ones fall back to the node's settings.
const RegionalPreferencesFieldsSchema = z.object({
  preferences: UserPreferencesSchema.pick({ locale: true, timeZone: true, currency: true }).optional().catch(undefined),
});
const regionalFields = createContractConverter({ schema: RegionalPreferencesFieldsSchema });

const newUser = (uid: UserId, profile: NewUserProfile, now: string): User => ({
  id: uid,
  ...profile,
  preferences: DEFAULT_USER_PREFERENCES,
  lastContext: {},
  accessVersion: 0,
  status: "active",
  createdAt: now,
  updatedAt: now,
});

// Top-level fields of a new doc the stored one lacks; stored values always win.
const missingFields = (stored: DocumentData, defaults: DocumentData): DocumentData =>
  Object.fromEntries(Object.entries(defaults).filter(([key]) => !(key in stored)));

/**
 * Firestore `UserRepository` over `users/{uid}`. Reads parse the `identity.User` contract;
 * `ensure` heals a doc that other writers left partial (it never overwrites a field).
 */
export const createFirestoreUserRepository = (deps: { firestore: Firestore }): UserRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.users);
  const typed = () => raw().withConverter(converter);
  const readValid = async (uid: UserId): Promise<User | null> => {
    try {
      return (await typed().doc(uid).get()).data() ?? null;
    } catch (e: unknown) {
      // A partial doc (created by an older writer) is healed by `ensure`.
      if (e instanceof CorruptDocumentError) return null;
      throw e;
    }
  };
  const fillMissing = (args: { uid: UserId; profile: NewUserProfile; now: string }) =>
    runInTransaction(deps.firestore, async (tx) => {
      const snapshot = await tx.get(raw().doc(args.uid));
      const stored = snapshot.data() ?? {};
      // The searchable name follows the name the doc keeps (decision 0044), not the Auth profile's.
      const displayName = typeof stored["displayName"] === "string" ? stored["displayName"] : args.profile.displayName;
      const missing = missingFields(stored, {
        ...converter.toFirestore(newUser(args.uid, args.profile, args.now)),
        ...userSearchFields(displayName),
      });
      if (Object.keys(missing).length === 0) return;
      const created = snapshot.exists ? {} : { createdBy: args.uid, schemaVersion: CORE_SCHEMA_VERSION };
      tx.set(raw().doc(args.uid), { ...missing, ...created, updatedBy: args.uid }, { merge: true });
    });
  return {
    get: async (tx, uid) => {
      const ref = typed().doc(uid);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    getRegionalPreferences: async (uid) =>
      (await raw().withConverter(regionalFields).doc(uid).get()).data()?.preferences,
    ensure: async (args) => {
      const current = await readValid(args.uid);
      if (current !== null) return current;
      await fillMissing(args);
      const healed = (await typed().doc(args.uid).get()).data();
      // Still invalid after healing: a stored field is corrupt (bug), never a guess.
      if (healed === undefined)
        throw new CorruptDocumentError({
          documentPath: `${CORE_COLLECTIONS.users}/${args.uid}`,
          issuePaths: ["(missing)"],
        });
      return healed;
    },
    updateProfile: (tx, { uid, patch, updatedAt, actorId }) => {
      const { photoUrl, ...rest } = patch;
      const photo = photoUrl === undefined ? {} : { photoUrl: photoUrl ?? FieldValue.delete() };
      const search = rest.displayName === undefined ? {} : userSearchFields(rest.displayName);
      tx.update(
        raw().doc(uid),
        toFirestoreUpdate(UserContract, { ...rest, ...search, ...photo, updatedAt, updatedBy: actorId }),
      );
    },
    setActiveOrganization: (tx, { uid, organizationId, updatedAt, actorId }) =>
      void tx.update(
        raw().doc(uid),
        toFirestoreUpdate(UserContract, { lastContext: { organizationId }, updatedAt, updatedBy: actorId }),
      ),
  };
};

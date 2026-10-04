import { DEFAULT_USER_PREFERENCES, OrganizationIdSchema, type User, UserContract } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "#/services/shared/firestore/contract-converter.ts";
import { userSearchFields } from "#/services/shared/firestore/user-search-fields.ts";
import type { UserAccessVersionStore } from "../../application/ports/driven/user-access-version.ts";

// Only the access fields are read, so a users doc written by another context stays readable.
const UserAccessFieldsSchema = z.object({
  accessVersion: z.int().min(0),
  lastContext: z.object({ organizationId: OrganizationIdSchema.optional() }).optional(),
});

const accessFields = createContractConverter({ schema: UserAccessFieldsSchema });
const userConverter = createContractConverter(UserContract);

/**
 * Firestore `UserAccessVersionStore` over `users/{uid}`. A new doc is written with the
 * `identity.User` contract shape (default preferences, `status: active`), the one the
 * identity context reads (SP1 Task 12).
 */
export const createFirestoreUserAccessVersionStore = (deps: { firestore: Firestore }): UserAccessVersionStore => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.users);
  return {
    read: async (tx, uid) => {
      const ref = raw().withConverter(accessFields).doc(uid);
      const fields = (tx === undefined ? await ref.get() : await tx.get(ref)).data();
      return fields === undefined
        ? null
        : { accessVersion: fields.accessVersion, activeOrganizationId: fields.lastContext?.organizationId ?? null };
    },
    bump: (tx, { uid, current, activeOrganizationId, updatedAt, actorId }) =>
      void tx.update(
        raw().doc(uid),
        toFirestoreUpdate(UserContract, {
          accessVersion: current.accessVersion + 1,
          ...(activeOrganizationId === undefined ? {} : { "lastContext.organizationId": activeOrganizationId }),
          updatedAt,
          updatedBy: actorId,
        }),
      ),
    create: (tx, { uid, profile, accessVersion, activeOrganizationId, createdAt }) => {
      const user: User = {
        id: uid,
        ...profile,
        preferences: DEFAULT_USER_PREFERENCES,
        lastContext: { organizationId: activeOrganizationId },
        accessVersion,
        status: "active",
        createdAt,
        updatedAt: createdAt,
      };
      tx.create(raw().doc(uid), {
        ...userConverter.toFirestore(user),
        ...userSearchFields(profile.displayName),
        createdBy: uid,
        updatedBy: uid,
        schemaVersion: CORE_SCHEMA_VERSION,
      });
    },
  };
};

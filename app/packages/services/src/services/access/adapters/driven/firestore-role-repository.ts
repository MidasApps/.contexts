import { IsoDateTimeSchema, type Role, RoleIdSchema, RoleSchema } from "@core/contracts";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "#/services/shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type { RoleRepository } from "../../application/ports/driven/role-repository.ts";

/** Stored custom role: the contract plus `deletedAt` (audit fields and `schemaVersion` stripped on read). */
export const StoredRoleSchema = RoleSchema.extend({ deletedAt: IsoDateTimeSchema.nullable() });

const stored = { schema: StoredRoleSchema };
export const storedRoleConverter = createContractConverter(stored);
const converter = storedRoleConverter;

export type StoredRole = Role & { deletedAt: string | null };

const liveOnly = (value: StoredRole | undefined): Role | null => {
  if (value === undefined) return null;
  const { deletedAt, ...role } = value;
  return deletedAt === null ? role : null;
};

export const roleCollectionOf = (firestore: Firestore) => firestore.collection(CORE_COLLECTIONS.roles);

/** Firestore `RoleRepository` over the top-level `roles` collection. */
export const createFirestoreRoleRepository = (deps: { firestore: Firestore }): RoleRepository => {
  const raw = () => roleCollectionOf(deps.firestore);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => RoleIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return liveOnly((tx === undefined ? await ref.get() : await tx.get(ref)).data());
    },
    list: async ({ tenantId, page }) => {
      let query = typed()
        .where("tenantId", "==", tenantId)
        .where("deletedAt", "==", null)
        .orderBy("name")
        .orderBy(FieldPath.documentId());
      if (page.after !== undefined) query = query.startAfter(...page.after);
      const snapshot = await query.limit(page.limit + 1).get();
      const fetched = snapshot.docs.flatMap((doc) => liveOnly(doc.data()) ?? []);
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (role) => [role.name, role.id] });
    },
    create: (tx, { role, actorId }) =>
      void tx.create(raw().doc(role.id), {
        ...converter.toFirestore({ ...role, deletedAt: null }),
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    update: (tx, { role, actorId }) =>
      void tx.update(
        raw().doc(role.id),
        toFirestoreUpdate(stored, {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          updatedAt: role.updatedAt,
          updatedBy: actorId,
        }),
      ),
    softDelete: (tx, { id, deletedAt, actorId }) =>
      void tx.update(
        raw().doc(id),
        toFirestoreUpdate(stored, { deletedAt, deletedBy: actorId, updatedAt: deletedAt, updatedBy: actorId }),
      ),
  };
};

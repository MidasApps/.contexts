import { IsoDateTimeSchema, type Organization, OrganizationIdSchema, OrganizationSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "#/services/shared/firestore/contract-converter.ts";
import type { OrganizationRepository } from "../../application/ports/driven/organization-repository.ts";

/** Stored organization: the contract plus `deletedAt` (audit fields and `schemaVersion` are stripped on read). */
export const StoredOrganizationSchema = OrganizationSchema.extend({ deletedAt: IsoDateTimeSchema.nullable() });

const stored = { schema: StoredOrganizationSchema };
const converter = createContractConverter(stored);

const liveOnly = (value: (Organization & { deletedAt: string | null }) | undefined): Organization | null => {
  if (value === undefined) return null;
  const { deletedAt, ...organization } = value;
  return deletedAt === null ? organization : null;
};

/** Firestore `OrganizationRepository` over the top-level `organizations` collection (`tenantId == id`). */
export const createFirestoreOrganizationRepository = (deps: { firestore: Firestore }): OrganizationRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.organizations);
  return {
    newId: () => OrganizationIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = raw().withConverter(converter).doc(id);
      return liveOnly((tx === undefined ? await ref.get() : await tx.get(ref)).data());
    },
    create: (tx, { organization, actorId }) =>
      void tx.create(raw().doc(organization.id), {
        ...converter.toFirestore({ ...organization, deletedAt: null }),
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    update: (tx, { organization, actorId }) =>
      void tx.update(
        raw().doc(organization.id),
        toFirestoreUpdate(stored, {
          name: organization.name,
          status: organization.status,
          defaults: organization.defaults,
          updatedAt: organization.updatedAt,
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

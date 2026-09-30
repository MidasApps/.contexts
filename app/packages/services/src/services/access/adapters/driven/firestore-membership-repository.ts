import { IsoDateTimeSchema, MembershipIdSchema, MembershipSchema, type Membership, type RoleRef } from "@core/contracts";
import type { DocumentData, Firestore, Query, Transaction } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import type { MembershipRepository } from "../../application/ports/driven/membership-repository.ts";
import { nodeIdOf } from "../../domain/access-projection.ts";
import { customRoleIdsOf, holdsOwner } from "../../domain/role-permissions.ts";

/**
 * Stored membership: the contract plus `deletedAt`. The document also holds fields for
 * queries (`nodeType`, `nodeId`, `projectId`, `customRoleIds`), audit fields and
 * `schemaVersion`; the converter strips them on read.
 */
export const StoredMembershipSchema = MembershipSchema.extend({ deletedAt: IsoDateTimeSchema.nullable() });

const stored = { schema: StoredMembershipSchema };
const converter = createContractConverter(stored);

type StoredMembership = Membership & { deletedAt: string | null };

const liveOnly = (value: StoredMembership | undefined): Membership | null => {
  if (value === undefined) return null;
  const { deletedAt, ...membership } = value;
  return deletedAt === null ? membership : null;
};

const queryFields = (membership: Membership): DocumentData => ({
  nodeType: membership.node.level,
  nodeId: nodeIdOf(membership.node),
  projectId: membership.node.level === "organization" ? null : membership.node.projectId,
  customRoleIds: customRoleIdsOf(membership.roles),
});

/** Document written on create (converter output + query and audit fields). */
export const membershipDocument = (membership: Membership, actorId: string): DocumentData => ({
  ...converter.toFirestore({ ...membership, deletedAt: null }),
  ...queryFields(membership),
  createdBy: actorId,
  updatedBy: actorId,
  deletedBy: null,
  schemaVersion: CORE_SCHEMA_VERSION,
});

const readAll = async (tx: Transaction, query: Query<StoredMembership>): Promise<Membership[]> =>
  (await tx.get(query)).docs.flatMap((doc) => liveOnly(doc.data()) ?? []);

const rolesUpdate = (roles: readonly RoleRef[]) => ({ roles: [...roles], customRoleIds: customRoleIdsOf(roles) });

/** Firestore `MembershipRepository` over the top-level `memberships` collection. */
export const createFirestoreMembershipRepository = (deps: { firestore: Firestore }): MembershipRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.memberships);
  const typed = () => raw().withConverter(converter);
  const live = () => typed().where("deletedAt", "==", null);
  return {
    newId: () => MembershipIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      const snapshot = tx === undefined ? await ref.get() : await tx.get(ref);
      return liveOnly(snapshot.data());
    },
    listOfPrincipal: (tx, { tenantId, principalId }) =>
      readAll(tx, live().where("tenantId", "==", tenantId).where("principalId", "==", principalId)),
    listOrganizationOwners: async (tx, tenantId) => {
      const query = live().where("tenantId", "==", tenantId).where("nodeId", "==", tenantId).where("principalType", "==", "user");
      return (await readAll(tx, query)).filter((membership) => holdsOwner(membership.roles));
    },
    isRoleInUse: async (tx, { tenantId, roleId }) =>
      !(await tx.get(live().where("tenantId", "==", tenantId).where("customRoleIds", "array-contains", roleId).limit(1))).empty,
    create: (tx, { membership, actorId }) => void tx.create(raw().doc(membership.id), membershipDocument(membership, actorId)),
    updateRoles: (tx, { id, roles, updatedAt, actorId }) =>
      void tx.update(raw().doc(id), toFirestoreUpdate(stored, { ...rolesUpdate(roles), updatedAt, updatedBy: actorId })),
    softDelete: (tx, { id, deletedAt, actorId }) =>
      void tx.update(raw().doc(id), toFirestoreUpdate(stored, { deletedAt, deletedBy: actorId, updatedAt: deletedAt, updatedBy: actorId })),
  };
};

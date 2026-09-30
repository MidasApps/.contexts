import type { Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createContractConverter } from "../../../shared/firestore/contract-converter.ts";
import type { GrantReader } from "../../application/ports/driven/grant-reader.ts";
import { nodeIdOf } from "../../domain/access-projection.ts";
import { StoredMembershipSchema } from "./firestore-membership-repository.ts";

const converter = createContractConverter({ schema: StoredMembershipSchema });

/**
 * Firestore `GrantReader` for `authorize()`: the principal's memberships on the node
 * chain (at most 9 node ids, within the `in` limit of 30), soft-deleted ones included
 * so the decision can ignore them explicitly.
 */
export const createFirestoreGrantReader = (deps: { firestore: Firestore }): GrantReader => ({
  listGrants: async ({ tenantId, principalId, nodeIds }) => {
    if (nodeIds.length === 0) return [];
    const snapshot = await deps.firestore
      .collection(CORE_COLLECTIONS.memberships)
      .withConverter(converter)
      .where("tenantId", "==", tenantId)
      .where("principalId", "==", principalId)
      .where("nodeId", "in", [...nodeIds])
      .get();
    return snapshot.docs.map((doc) => {
      const membership = doc.data();
      return {
        membershipId: membership.id,
        tenantId: membership.tenantId,
        principalId: membership.principalId,
        nodeId: nodeIdOf(membership.node),
        roles: membership.roles,
        isDeleted: membership.deletedAt !== null,
      };
    });
  },
});

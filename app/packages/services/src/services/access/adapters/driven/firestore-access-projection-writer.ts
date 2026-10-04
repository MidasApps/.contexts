import { type AccessProjection, AccessProjectionSchema, accessProjectionId } from "@core/contracts";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { AccessProjectionStore } from "../../application/ports/driven/access-projection-writer.ts";

const stored = { schema: AccessProjectionSchema };
const converter = createContractConverter(stored);

const revokedPatch = (projection: AccessProjection, updatedAt: string, actorId: string) =>
  toFirestoreUpdate(stored, { isRevoked: true, version: projection.version + 1, updatedAt, updatedBy: actorId });

/**
 * Firestore `AccessProjectionStore` over `access/{tenantId}_{principalId}` (SP1 spec §5.4).
 * Every grant transaction reads and writes the principal's doc, so concurrent grant
 * changes of one principal serialize on it and the projection always matches the grants.
 */
export const createFirestoreAccessProjectionStore = (deps: { firestore: Firestore }): AccessProjectionStore => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.access);
  const typed = () => raw().withConverter(converter);
  return {
    get: async (tx, { tenantId, principalId }) => {
      const ref = typed().doc(accessProjectionId({ tenantId, principalId }));
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    write: (tx, { projection, actorId }) =>
      void tx.set(raw().doc(projection.id), {
        ...converter.toFirestore(projection),
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    listMembers: async ({ tenantId, page }) => {
      let query = typed()
        .where("tenantId", "==", tenantId)
        .where("principalType", "==", "user")
        .where("isRevoked", "==", false)
        .orderBy("principalId")
        .orderBy(FieldPath.documentId());
      if (page.after !== undefined) query = query.startAfter(...page.after);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({
        fetched,
        limit: page.limit,
        positionOf: (projection) => [projection.principalId, projection.id],
      });
    },
    listOfPrincipal: async ({ principalId, page }) => {
      let query = typed()
        .where("principalId", "==", principalId)
        .where("isRevoked", "==", false)
        .orderBy("tenantId")
        .orderBy(FieldPath.documentId());
      if (page.after !== undefined) query = query.startAfter(...page.after);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({
        fetched,
        limit: page.limit,
        positionOf: (projection) => [projection.tenantId, projection.id],
      });
    },
    listUnrevoked: async (tx, { tenantId, limit }) => {
      const query = typed().where("tenantId", "==", tenantId).where("isRevoked", "==", false).limit(limit);
      return (tx === undefined ? await query.get() : await tx.get(query)).docs.map((doc) => doc.data());
    },
    markRevoked: async (tx, { projections, updatedAt, actorId }) => {
      if (tx !== undefined) {
        for (const projection of projections)
          tx.update(raw().doc(projection.id), revokedPatch(projection, updatedAt, actorId));
        return;
      }
      const batch = deps.firestore.batch();
      for (const projection of projections)
        batch.update(raw().doc(projection.id), revokedPatch(projection, updatedAt, actorId));
      await batch.commit();
    },
  };
};

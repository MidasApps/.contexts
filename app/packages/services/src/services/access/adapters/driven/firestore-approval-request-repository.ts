import { ApprovalRequestIdSchema, ApprovalRequestSchema, type ApprovalRequest } from "@core/contracts";
import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ApprovalRequestRepository } from "../../application/ports/driven/approval-request-repository.ts";

const contract = { schema: ApprovalRequestSchema };
const converter = createContractConverter(contract);

/**
 * Firestore `ApprovalRequestRepository` over `approval-requests` (tenant data; Security Rules
 * deny clients, SP2 and SP5 read through `/v1`). Lists use `tenantId (+ status) + createdAt desc`.
 */
export const createFirestoreApprovalRequestRepository = (deps: { firestore: Firestore }): ApprovalRequestRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.approvalRequests);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => ApprovalRequestIdSchema.parse(raw().doc().id),
    create: (tx, { request, actorId }) =>
      void tx.create(raw().doc(request.id), { ...converter.toFirestore(request), createdBy: actorId, updatedBy: actorId, schemaVersion: CORE_SCHEMA_VERSION }),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    list: async ({ tenantId, statuses, page }) => {
      let query = typed().where("tenantId", "==", tenantId);
      if (statuses !== undefined) query = query.where("status", "in", [...statuses]);
      query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (request: ApprovalRequest) => [request.createdAt, request.id] });
    },
    setStatus: (tx, { id, status, decidedBy, reason, updatedAt, actorId }) =>
      void tx.update(
        raw().doc(id),
        toFirestoreUpdate(contract, {
          status,
          ...(decidedBy === undefined ? {} : { decidedBy }),
          ...(reason === undefined ? {} : { reason }),
          updatedAt,
          updatedBy: actorId,
        }),
      ),
  };
};

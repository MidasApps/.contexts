import { type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import type { ApprovalStats } from "../../application/ports/console-ports.ts";

// Every request an approver let through: still `approved`, or executed / failed after approval.
const APPROVED_STATUSES = ["approved", "executed", "failed"] as const;

/**
 * Approval decisions across tenants from `approval-requests` (staff overview, server only): two
 * count aggregations on the `status + updatedAt` index. `updatedAt` also moves when an approved
 * request executes or fails, so a request approved just before the window and executed inside it
 * counts in the window.
 */
export const createFirestoreApprovalStats = (deps: { readonly firestore: Firestore }): ApprovalStats => {
  const requests = () => deps.firestore.collection(CORE_COLLECTIONS.approvalRequests);
  return {
    countDecidedSince: async (since) => {
      const from = Timestamp.fromDate(since);
      const [approved, rejected] = await Promise.all([
        requests().where("status", "in", [...APPROVED_STATUSES]).where("updatedAt", ">=", from).count().get(),
        requests().where("status", "==", "rejected").where("updatedAt", ">=", from).count().get(),
      ]);
      return { approved: approved.data().count, rejected: rejected.data().count };
    },
  };
};

import type { ApprovalRequest, ApprovalRequestId, ApprovalStatus, TenantId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** A status change: the decision fields are set once, when the request leaves `pending`. */
export type ApprovalStatusChange = {
  readonly id: ApprovalRequestId;
  readonly status: ApprovalStatus;
  readonly decidedBy?: UserId;
  readonly reason?: string | null;
  readonly updatedAt: string;
  readonly actorId: string;
};

/** `approval-requests` (SP1 spec §4, §6.5): tenant data, written only by the approval use cases. */
export type ApprovalRequestRepository = {
  readonly newId: () => ApprovalRequestId;
  readonly create: (tx: Transaction, args: { request: ApprovalRequest; actorId: string }) => void;
  readonly get: (tx: Transaction | undefined, id: ApprovalRequestId) => Promise<ApprovalRequest | null>;
  /** Newest first (`createdAt desc`, id desc); `statuses` filters the stored status. */
  readonly list: (args: { tenantId: TenantId; statuses?: readonly ApprovalStatus[] | undefined; page: PageRequest }) => Promise<Page<ApprovalRequest>>;
  readonly setStatus: (tx: Transaction, change: ApprovalStatusChange) => void;
};

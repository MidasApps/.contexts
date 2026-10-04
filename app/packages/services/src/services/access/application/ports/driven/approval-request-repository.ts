import type {
  ApprovalFailure,
  ApprovalRequest,
  ApprovalRequestId,
  ApprovalStatus,
  TenantId,
  UserId,
} from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** A status change: the decision fields are set once, when the request leaves `pending`. */
export type ApprovalStatusChange = {
  readonly id: ApprovalRequestId;
  readonly status: ApprovalStatus;
  readonly decidedBy?: UserId;
  readonly reason?: string | null;
  /** Set only with `failed` (decision 0067). */
  readonly failure?: ApprovalFailure;
  readonly updatedAt: string;
  readonly actorId: string;
};

/** `approval-requests` (SP1 spec §4, §6.5): tenant data, written only by the approval use cases. */
export type ApprovalRequestRepository = {
  readonly newId: () => ApprovalRequestId;
  readonly create: (tx: Transaction, args: { request: ApprovalRequest; actorId: string }) => void;
  readonly get: (tx: Transaction | undefined, id: ApprovalRequestId) => Promise<ApprovalRequest | null>;
  /** Newest first (`createdAt desc`, id desc); `statuses` filters the stored status. */
  readonly list: (args: {
    tenantId: TenantId;
    statuses?: readonly ApprovalStatus[] | undefined;
    page: PageRequest;
  }) => Promise<Page<ApprovalRequest>>;
  readonly setStatus: (tx: Transaction, change: ApprovalStatusChange) => void;
  /**
   * Platform sweeps (decision 0036): requests of every tenant in `status` whose `field` is at or
   * before `before`, oldest first, at most `limit`. Firestore index `status + <field>`.
   */
  readonly listByStatusBefore: (args: {
    status: ApprovalStatus;
    field: "expiresAt" | "updatedAt";
    before: string;
    limit: number;
  }) => Promise<readonly ApprovalRequest[]>;
};

import type { ApprovalRequest, ApprovalRequestId, Principal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { approvalView } from "../../domain/approval-state.ts";
import { ApprovalNotFoundError } from "../../domain/errors/approval-errors.ts";
import type { ApprovalDeps } from "../approval-deps.ts";
import { requirePermission } from "../grant-checks.ts";

export type ReadApprovalRequestCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly approvalRequestId: ApprovalRequestId;
};

export type ReadApprovalRequest = (command: ReadApprovalRequestCommand) => Promise<Result<ApprovalRequest, ApprovalNotFoundError>>;

/**
 * `GET /v1/approval-requests/{approvalRequestId}` (SP5 Task 14, the inbox detail page): one
 * request with its effective status for a caller who holds `core.approval.read` at the request's
 * organization, the same rule as the list. A missing request and a caller who may not see it get
 * the same `NOT_FOUND`, so an id never reveals that a request exists in another organization.
 */
export const makeReadApprovalRequest =
  (deps: Pick<ApprovalDeps, "approvals" | "clock">): ReadApprovalRequest =>
  async ({ actor, access, approvalRequestId }) => {
    const request = await deps.approvals.get(undefined, approvalRequestId);
    if (request === null) return err(new ApprovalNotFoundError());
    const allowed = await requirePermission({ actor, access, permission: "core.approval.read", node: { level: "organization", tenantId: request.tenantId } });
    return allowed.ok ? ok(approvalView(request, deps.clock.now())) : err(new ApprovalNotFoundError());
  };

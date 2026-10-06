import type { ApprovalRequest, ApprovalStatus, Principal, TenantId } from "@core/contracts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import { ok, type Result } from "#/services/shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { approvalView } from "../../domain/approval-state.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { ApprovalDeps } from "../approval-deps.ts";
import { requirePermission } from "../grant-checks.ts";

export type ListApprovalRequestsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly status?: ApprovalStatus | undefined;
  readonly page: PageRequest;
};

export type ListApprovalRequests = (
  command: ListApprovalRequestsCommand,
) => Promise<Result<Page<ApprovalRequest>, AccessDeniedError>>;

// `expired` is derived from a stored `pending` past its expiry, so both filters read both
// stored states and the page is filtered on the effective status (it may hold fewer items).
const storedStatusesFor = (status: ApprovalStatus | undefined): readonly ApprovalStatus[] | undefined => {
  if (status === undefined) return undefined;
  return status === "pending" || status === "expired" ? ["pending", "expired"] : [status];
};

/**
 * `GET /v1/organizations/{organizationId}/approval-requests?status=` (`core.approval.read` at
 * the organization), newest first, with the effective status (the SP5 approval inbox).
 */
export const makeListApprovalRequests =
  (deps: Pick<ApprovalDeps, "approvals" | "clock">): ListApprovalRequests =>
  async (command) => {
    const { tenantId, status, page } = command;
    const allowed = await requirePermission({
      ...command,
      permission: "core.approval.read",
      node: { level: "organization", tenantId },
    });
    if (!allowed.ok) return allowed;
    const stored = await deps.approvals.list({ tenantId, statuses: storedStatusesFor(status), page });
    const now = deps.clock.now();
    const items = stored.items
      .map((request) => approvalView(request, now))
      .filter((request) => status === undefined || request.status === status);
    return ok({ items, nextCursor: stored.nextCursor });
  };

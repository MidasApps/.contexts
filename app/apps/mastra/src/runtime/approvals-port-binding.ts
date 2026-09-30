import type { ApprovalPort } from "@core/agents";
import { CreateApprovalRequestInputSchema, PrincipalSchema } from "@core/contracts";
import type { ApprovalServices } from "@core/services";

/** SP1 refused the approval request (`result.ok === false`); `code` is SP1's error code. */
export class ApprovalRefusedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`APPROVAL_REFUSED: ${code}`);
    this.name = "ApprovalRefusedError";
    this.code = code;
  }
}

/** Agent approvals only name nodes of a tenant; the platform node has no approvers. */
class ApprovalNodeError extends Error {
  readonly code = "APPROVAL_NODE_INVALID";

  constructor() {
    super("APPROVAL_NODE_INVALID: agent approvals need a tenant node");
    this.name = "ApprovalNodeError";
  }
}

/**
 * Binds `ApprovalPort` to SP1's in-process `requestApproval` (SP1 Task 17, decision 0025,
 * follow-up #26). The agent action is the `input` of an SP1 action of kind `agent-command`;
 * SP1 checks the caller's own right, that the permission requires approval and that the
 * handler knows the input. SP1 answers a `Result`: a refusal rejects with its code, so the
 * tool pipeline answers `APPROVAL_UNAVAILABLE` (fail-closed); `approvalId` is the stored
 * request's id.
 */
export const bindApprovalsPort = (approvals: Pick<ApprovalServices, "requestApproval">): ApprovalPort => ({
  requestApproval: async ({ principal, node, permission, action, requestId }) => {
    if (node.level === "platform") throw new ApprovalNodeError();
    const input = CreateApprovalRequestInputSchema.parse({ node, permission, action: { kind: action.kind, input: action, summary: action.summary } });
    const result = await approvals.requestApproval({ principal: PrincipalSchema.parse(principal), input, requestId });
    if (!result.ok) throw new ApprovalRefusedError(result.error.code);
    return { approvalId: result.data.id };
  },
});

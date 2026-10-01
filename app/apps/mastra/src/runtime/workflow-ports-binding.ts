import type { NodeRef, WorkflowApprovalPort, WorkflowApprovalRecord, WorkflowCommandPort } from "@core/agents";
import {
  ApprovalRequestIdSchema,
  CreateApprovalRequestInputSchema,
  PrincipalSchema,
  TenantIdSchema,
  TenantNodeRefSchema,
  WORKFLOW_RESUME_ACTION_KIND,
} from "@core/contracts";
import { type AccessCore, AgentCommandError, type AgentCommandExecutors, type ApprovalServices, type CommandIdempotency, type WorkflowApprovalSettler } from "@core/services";
import { ApprovalRefusedError } from "./approvals-port-binding.ts";

/** Workflow approvals only name nodes of a tenant; the platform node has no approvers. */
class WorkflowApprovalNodeError extends Error {
  readonly code = "APPROVAL_NODE_INVALID";

  constructor() {
    super("APPROVAL_NODE_INVALID: workflow approvals need a tenant node");
    this.name = "WorkflowApprovalNodeError";
  }
}

/**
 * Binds `WorkflowApprovalPort` to SP1 (decision 0036): `requestApproval` with an action of kind
 * `workflow-resume` (SP1 checks the caller's own right, `requiresApproval` and the handler's
 * input schema; a refusal rejects with SP1's code) and the system read `getApprovalRequest`.
 */
export const bindWorkflowApprovalsPort = (approvals: Pick<ApprovalServices, "requestApproval" | "getApprovalRequest">): WorkflowApprovalPort => ({
  requestWorkflowApproval: async ({ principal, node, permission, action, summary, requestId }) => {
    if (node.level === "platform") throw new WorkflowApprovalNodeError();
    const input = CreateApprovalRequestInputSchema.parse({ node, permission, action: { kind: WORKFLOW_RESUME_ACTION_KIND, input: action, summary } });
    const result = await approvals.requestApproval({ principal: PrincipalSchema.parse(principal), input, requestId });
    if (!result.ok) throw new ApprovalRefusedError(result.error.code);
    return { approvalId: result.data.id };
  },
  getApprovalRequest: async ({ approvalRequestId }) => {
    const id = ApprovalRequestIdSchema.safeParse(approvalRequestId);
    if (!id.success) return null;
    const request = await approvals.getApprovalRequest(id.data);
    if (request === null) return null;
    const record: WorkflowApprovalRecord = {
      id: request.id,
      tenantId: request.tenantId,
      status: request.status,
      kind: request.action.kind,
      input: request.action.input,
      requestedBy: request.requestedBy,
      decidedBy: request.decidedBy,
      reason: request.reason,
    };
    return record;
  },
});

type Refusal = { readonly ok: false; readonly code: string };
const refuse = (code: string): Refusal => ({ ok: false, code });

/**
 * Binds `WorkflowCommandPort` to SP3's command executors and idempotency records: the command
 * runs as the given principal after SP1 re-authorizes it at the node, at most once per
 * `workflow:<idempotencyKey>` (decisions 0025 and 0036). Expected refusals answer the
 * `AgentCommandError` code; infrastructure errors reject.
 */
export const bindWorkflowCommandsPort = (deps: {
  readonly executors: AgentCommandExecutors;
  readonly access: Pick<AccessCore, "forRequest">;
  readonly commands: CommandIdempotency;
}): WorkflowCommandPort => ({
  run: async ({ principal, tenantId, node, commandId, input, idempotencyKey, requestId }) => {
    const executor = deps.executors.get(commandId);
    if (executor === undefined) return refuse("UNKNOWN_COMMAND");
    const tenantNode = TenantNodeRefSchema.safeParse(node satisfies NodeRef);
    if (!tenantNode.success || tenantNode.data.tenantId !== tenantId) return refuse("TENANT_MISMATCH");
    const actor = PrincipalSchema.parse(principal);
    const decision = await deps.access.forRequest().authorize({ principal: actor, permission: executor.permission, node: tenantNode.data });
    if (!decision.allowed) return refuse("REQUESTER_FORBIDDEN");
    const run = executor.prepare(input);
    if (run === null) return refuse("COMMAND_INPUT_INVALID");
    const tenant = TenantIdSchema.parse(tenantId);
    try {
      const result = await deps.commands.runOnce({
        tenantId,
        commandId,
        idempotencyKey: `workflow:${idempotencyKey}`,
        input,
        run: () => run({ principal: actor, tenantId: tenant, node: tenantNode.data, requestId }),
      });
      return { ok: true, output: result.output, replayed: result.replayed };
    } catch (error: unknown) {
      if (error instanceof AgentCommandError) return refuse(error.code);
      throw error;
    }
  },
});

/**
 * The agent runtime registers the `workflow-resume` kind so SP1 accepts requests of it, but
 * approvals are decided in `/v1`: an execution here is a bug and fails the approval.
 */
export const RUNTIME_SIDE_SETTLER: WorkflowApprovalSettler = {
  settle: () => Promise.resolve({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } }),
};

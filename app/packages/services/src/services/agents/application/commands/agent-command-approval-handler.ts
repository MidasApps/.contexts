import { AGENT_COMMAND_ACTION_KIND, type AgentApprovalRequest, AgentApprovalRequestSchema, type Principal } from "@core/contracts";
import type { AccessCore } from "../../../access/composition.ts";
import type { ApprovalActionContext, ApprovalActionHandler } from "../../../access/application/ports/driven/approval-action-handler.ts";
import { AgentCommandError } from "./agent-command-error.ts";
import type { AgentCommandExecutor, AgentCommandExecutors } from "./agent-command-executor.ts";
import type { CommandIdempotency } from "./run-command-once.ts";

export const AGENT_COMMAND_HANDLER_KIND = AGENT_COMMAND_ACTION_KIND;

export type AgentCommandApprovalDeps = {
  readonly executors: AgentCommandExecutors;
  readonly access: Pick<AccessCore, "forRequest">;
  readonly commands: CommandIdempotency;
};

/** The uid an agent context names for a principal (`requestedBy`): the key owner for API keys. */
const uidOf = (principal: Principal): string => {
  if (principal.type === "user") return principal.uid;
  if (principal.type === "service") return principal.ownerUid;
  return principal.deviceId;
};

// The stored action must describe the request SP1 approved: same tenant, same permission, same requester.
const checkAction = (action: AgentApprovalRequest, context: ApprovalActionContext): Principal => {
  const { request, requester } = context;
  if (requester === null) throw new AgentCommandError("REQUESTER_UNAVAILABLE", action.commandId);
  if (uidOf(requester) !== action.requestedBy) throw new AgentCommandError("REQUESTER_MISMATCH", action.commandId);
  if (action.tenantId !== request.tenantId) throw new AgentCommandError("TENANT_MISMATCH", action.commandId);
  if (action.permission !== request.permission) throw new AgentCommandError("PERMISSION_MISMATCH", action.commandId);
  return requester;
};

const executorOf = (deps: AgentCommandApprovalDeps, action: AgentApprovalRequest): AgentCommandExecutor => {
  const executor = deps.executors.get(action.commandId);
  if (executor === undefined) throw new AgentCommandError("UNKNOWN_COMMAND", action.commandId);
  if (executor.permission !== action.permission) throw new AgentCommandError("PERMISSION_MISMATCH", action.commandId);
  return executor;
};

/**
 * SP1 `ApprovalActionHandler` of kind `agent-command` (decision 0025, follow-up #26). It runs
 * in the process that decides approvals (`/v1` in `apps/web`), and the agent runtime registers
 * it too, so `requestApproval` finds the kind. On execution it checks the stored action
 * against the approved request, re-authorizes the requester at the request's node, validates
 * the input with the command's schema and runs the command at most once per
 * `runId:toolCallId`. Every refusal throws a SCREAMING_SNAKE `code`, which SP1 audits on
 * `APPROVAL_FAILED`; nothing runs after a failed check.
 */
export const createAgentCommandApprovalHandler = (deps: AgentCommandApprovalDeps): ApprovalActionHandler<AgentApprovalRequest> => ({
  kind: AGENT_COMMAND_HANDLER_KIND,
  inputSchema: AgentApprovalRequestSchema,
  execute: async (action, context) => {
    const requester = checkAction(action, context);
    const executor = executorOf(deps, action);
    const decision = await deps.access.forRequest().authorize({ principal: requester, permission: action.permission, node: context.request.node });
    if (!decision.allowed) throw new AgentCommandError("REQUESTER_FORBIDDEN", action.commandId);
    const run = executor.prepare(action.input);
    if (run === null) throw new AgentCommandError("COMMAND_INPUT_INVALID", action.commandId);
    await deps.commands.runOnce({
      tenantId: action.tenantId,
      commandId: action.commandId,
      idempotencyKey: action.idempotencyKey,
      input: action.input,
      run: () => run({ principal: requester, tenantId: context.request.tenantId, node: context.request.node, requestId: context.requestId }),
    });
  },
});

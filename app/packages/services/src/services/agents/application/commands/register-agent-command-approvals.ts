import type { ApprovalServices } from "../../../access/approval-composition.ts";
import type { AccessCore } from "../../../access/composition.ts";
import type { IdempotencyStore } from "../../../shared/idempotency/idempotency-store.ts";
import { AGENT_COMMAND_HANDLER_KIND, createAgentCommandApprovalHandler } from "./agent-command-approval-handler.ts";
import { type AgentCommandExecutor, agentCommandExecutors } from "./agent-command-executor.ts";
import { type CommandIdempotency, createCommandIdempotency } from "./run-command-once.ts";

/**
 * Registers the `agent-command` approval handler on a core server's open registry (decision
 * 0025) and returns the command idempotency it uses, so the agent tool pipeline shares the
 * same records. `apps/web` (where approvals are decided) and `apps/mastra` (where they are
 * requested) both call it; a second call on the same registry keeps the first handler.
 */
export const registerAgentCommandApprovals = (deps: {
  readonly approvals: Pick<ApprovalServices, "handlers">;
  readonly executors: readonly AgentCommandExecutor[];
  readonly access: Pick<AccessCore, "forRequest">;
  readonly idempotency: IdempotencyStore;
}): CommandIdempotency => {
  const commands = createCommandIdempotency({ store: deps.idempotency });
  if (deps.approvals.handlers.get(AGENT_COMMAND_HANDLER_KIND) === undefined) {
    deps.approvals.handlers.register(createAgentCommandApprovalHandler({ executors: agentCommandExecutors(deps.executors), access: deps.access, commands }));
  }
  return commands;
};

import type { Principal, TenantId, TenantNodeRef } from "@core/contracts";
import type { z } from "zod";

/** What an executor receives: the requester (re-authorized), the tenant and the validated input. */
export type AgentCommandExecution<Input> = {
  readonly principal: Principal;
  readonly tenantId: TenantId;
  readonly node: TenantNodeRef;
  readonly input: Input;
  readonly requestId: string;
};

/** The typed declaration of an executor (`defineAgentCommandExecutor`). */
export type AgentCommandExecutorSpec<Input> = {
  /** Command contract id, e.g. `tenancy.CreateProjectInput`. */
  readonly commandId: string;
  /** Must equal the permission the approval request was created for. */
  readonly permission: string;
  readonly inputSchema: z.ZodType<Input>;
  /** @throws {AgentCommandError} `COMMAND_REFUSED` when the use case refuses; infrastructure errors propagate. */
  execute(execution: AgentCommandExecution<Input>): Promise<unknown>;
};

/**
 * Runs one agent command outside the agent runtime (decision 0025): the SP1 `agent-command`
 * approval handler calls it once a second member approved. It calls the same use case as
 * `/v1`, which authorizes again and audits the change. The input type is erased behind the
 * command's own schema.
 */
export type AgentCommandExecutor = {
  readonly commandId: string;
  readonly permission: string;
  /** Parses a stored input; `null` when it no longer matches the command schema. */
  readonly prepare: (input: unknown) => ((execution: Omit<AgentCommandExecution<unknown>, "input">) => Promise<unknown>) | null;
};

export const defineAgentCommandExecutor = <Input>(spec: AgentCommandExecutorSpec<Input>): AgentCommandExecutor => ({
  commandId: spec.commandId,
  permission: spec.permission,
  prepare: (input) => {
    const parsed = spec.inputSchema.safeParse(input);
    if (!parsed.success) return null;
    return (execution) => spec.execute({ ...execution, input: parsed.data });
  },
});

/** Executors by command id. */
export type AgentCommandExecutors = ReadonlyMap<string, AgentCommandExecutor>;

export const agentCommandExecutors = (executors: readonly AgentCommandExecutor[]): AgentCommandExecutors =>
  new Map(executors.map((executor) => [executor.commandId, executor]));

import { CreateProjectInputSchema } from "@core/contracts";
import type { AccessCore } from "../../../access/composition.ts";
import type { TenancyServices } from "../../../tenancy/composition.ts";
import { AgentCommandError } from "./agent-command-error.ts";
import { type AgentCommandExecutor, defineAgentCommandExecutor } from "./agent-command-executor.ts";

/** The core command of the action agent (`@core/agents` `create-project-command.tool.ts`). */
export const CREATE_PROJECT_COMMAND_ID = "tenancy.CreateProjectInput";

/**
 * Executors of the core agent commands for the `agent-command` approval handler. They mirror
 * the agent tools of `@core/agents` (the web cannot import the agent runtime): today only
 * `tenancy.CreateProjectInput`, which calls SP1 `createProject` as the requester (it
 * authorizes `core.project.create` again and audits `PROJECT_CREATED`). Module commands add
 * their executors here when Task 19 lands.
 */
export const createCoreAgentCommandExecutors = (deps: {
  readonly tenancy: Pick<TenancyServices, "createProject">;
  readonly access: Pick<AccessCore, "forRequest">;
}): AgentCommandExecutor[] => [
  defineAgentCommandExecutor({
    commandId: CREATE_PROJECT_COMMAND_ID,
    permission: "core.project.create",
    inputSchema: CreateProjectInputSchema,
    execute: async ({ principal, tenantId, input, requestId }) => {
      const result = await deps.tenancy.createProject({ actor: principal, access: deps.access.forRequest(), requestId, tenantId, input });
      if (!result.ok) throw new AgentCommandError("COMMAND_REFUSED", CREATE_PROJECT_COMMAND_ID, { cause: result.error });
      return { projectId: result.data.id, name: result.data.name };
    },
  }),
];

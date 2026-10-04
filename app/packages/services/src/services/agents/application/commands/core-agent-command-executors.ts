import { CreateProjectInputContract } from "@core/contracts";
import { z } from "zod";
import type { AccessCore } from "#/services/access/composition.ts";
import type { TenancyServices } from "#/services/tenancy/composition.ts";
import { AgentCommandError } from "./agent-command-error.ts";
import { type ContractCommand, defineContractCommand } from "./contract-command.ts";

/** The core command of the action agent (tool `command.tenancy.CreateProjectInput`). */
export const CREATE_PROJECT_COMMAND_ID = CreateProjectInputContract.id;

/**
 * The core entries of the command registry (decision 0025): today only
 * `tenancy.CreateProjectInput`, which calls SP1 `createProject` as the requester (it
 * authorizes `core.project.create` again and audits `PROJECT_CREATED`). The agent tool, the
 * `agent-command` approval handler and the workflow command port all run this one
 * definition; installed modules add theirs in the apps' composition files.
 */
export const createCoreAgentCommandExecutors = (deps: {
  readonly tenancy: Pick<TenancyServices, "createProject">;
  readonly access: Pick<AccessCore, "forRequest">;
}): ContractCommand[] => [
  defineContractCommand({
    contract: CreateProjectInputContract,
    targetContractId: "tenancy.Project",
    outputSchema: z.strictObject({ projectId: z.string().min(1), name: z.string().min(1) }),
    summarize: (input) => `Create the project "${input.name}"`,
    preview: (input) => ({ before: null, after: { name: input.name, description: input.description ?? null } }),
    execute: async ({ principal, tenantId, input, requestId }) => {
      const result = await deps.tenancy.createProject({
        actor: principal,
        access: deps.access.forRequest(),
        requestId,
        tenantId,
        input,
      });
      if (!result.ok)
        throw new AgentCommandError("COMMAND_REFUSED", CREATE_PROJECT_COMMAND_ID, { cause: result.error });
      return { projectId: result.data.id, name: result.data.name };
    },
  }),
];

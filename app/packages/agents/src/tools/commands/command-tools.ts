import { PrincipalSchema, TenantIdSchema, TenantNodeRefSchema } from "@core/contracts";
import { AgentCommandError, type ContractCommand } from "@core/services";
import { type CoreToolContext, defineCoreTool } from "../define-core-tool.ts";
import { toolFailure } from "../tool-errors.ts";
import type { AgentCommand } from "./agent-command.ts";

/** Tool id of a command contract: `command.<contractId>` (spec §8.4). */
export const commandToolIdOf = (commandId: string): string => `command.${commandId}`;

const CONFIRM_HINT = "Run it only after the user confirmed every value.";

// The server context is the only source of the principal, the tenant and the node (never the model).
const executionOf = (toolId: string, ctx: CoreToolContext) => {
  const principal = PrincipalSchema.safeParse(ctx.principal);
  const tenantId = TenantIdSchema.safeParse(ctx.agent.tenantId);
  const node = TenantNodeRefSchema.safeParse(ctx.node);
  if (!principal.success || !tenantId.success || !node.success)
    throw toolFailure(toolId, "CONTEXT_MISSING", "The request context is incomplete; the command did not run.");
  return {
    principal: principal.data,
    tenantId: tenantId.data,
    node: node.data,
    requestId: ctx.agent.requestId,
    idempotencyKey: ctx.idempotencyKey,
  };
};

/**
 * The agent tool of a registry command (spec §8.4, decision 0025): `command.<contractId>`
 * with the command contract's schema as input, its description and its permission. It is a
 * mutation, so the pipeline asks the user to confirm, turns a `requiresApproval` permission
 * into an SP1 approval request, runs it at most once per `runId:toolCallId` and audits it.
 * `execute` calls the same use case as `/v1`, the approval handler and workflows.
 * @throws {InvalidToolDefinitionError} when the contract schema is not strict or a field lacks a description (boot error).
 */
export const commandToolOf = (command: ContractCommand): AgentCommand => {
  const id = commandToolIdOf(command.commandId);
  const { summarize, preview } = command;
  return {
    targetContractId: command.targetContractId,
    tool: defineCoreTool({
      id,
      description: `${command.description} ${CONFIRM_HINT}`,
      kind: "mutation",
      permission: command.permission,
      inputSchema: command.inputSchema,
      outputSchema: command.outputSchema,
      commandId: command.commandId,
      ...(summarize === undefined ? {} : { summarize: (input) => summarize(input) }),
      ...(preview === undefined ? {} : { preview: (input) => Promise.resolve(preview(input)) }),
      execute: async (input, ctx) => {
        const run = command.prepare(input);
        if (run === null)
          throw toolFailure(
            id,
            "COMMAND_INPUT_INVALID",
            "The command input does not match its contract; nothing was changed.",
          );
        try {
          return await run(executionOf(id, ctx));
        } catch (error: unknown) {
          if (error instanceof AgentCommandError)
            throw toolFailure(id, error.code, "The command was refused; nothing was changed.");
          throw error;
        }
      },
    }),
  };
};

/** The tools of the whole registry, in registry order (core commands first). */
export const commandToolsOf = (registry: readonly ContractCommand[]): AgentCommand[] => registry.map(commandToolOf);

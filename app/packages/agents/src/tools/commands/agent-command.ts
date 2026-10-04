import type { FormCommand } from "../catalog/render-form.tool.ts";
import type { CoreToolDefinition } from "../define-core-tool.ts";

/**
 * A command the action agent may run (spec §8.4): a mutation tool `command.<contractId>`
 * plus the contract it creates or updates, so `catalog.renderForm` can show its form.
 * Core commands are built in `@core/agents`; module commands come from
 * `AgentModule.commands` (Task 19 derives them from command contracts).
 */
export type AgentCommand = {
  readonly tool: CoreToolDefinition;
  /** Contract id the command creates or updates (e.g. `tenancy.Project`). */
  readonly targetContractId: string;
};

/** Contract id of the command: the tool's `commandId`, or the tool id after `command.`. */
export const commandIdOf = (tool: CoreToolDefinition): string => tool.commandId ?? tool.id.replace(/^command\./, "");

/** The commands as `catalog.renderForm` sees them. */
export const formCommandsOf = (commands: readonly AgentCommand[]): ReadonlyMap<string, FormCommand> =>
  new Map(
    commands.map(({ tool, targetContractId }) => [
      commandIdOf(tool),
      { commandId: commandIdOf(tool), targetContractId, permission: tool.permission, inputSchema: tool.inputSchema },
    ]),
  );

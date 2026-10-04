import type { SettingsPort } from "../../runtime/runtime-ports.ts";
import { isModuleEnabled } from "../../skills/resolve-skills.ts";
import type { CoreToolContext } from "../define-core-tool.ts";

/**
 * Module commands follow module enablement (decision 0064): a command tool
 * `command.<module>.*` of an installed module reaches a tenant only when the tenant enabled
 * the module (same rule as module skills); every other command is a core command.
 */

/** The installed module that owns a command tool id, if any. */
export const moduleOfCommand = (toolId: string, moduleIds: readonly string[]): string | undefined =>
  moduleIds.find((moduleId) => toolId.startsWith(`command.${moduleId}.`));

/** True for a core command, or for a module command whose module the tenant enabled. */
export const isCommandOffered = (
  toolId: string,
  moduleIds: readonly string[],
  enabledAgents: ReadonlySet<string>,
): boolean => {
  const owner = moduleOfCommand(toolId, moduleIds);
  return owner === undefined || isModuleEnabled(owner, enabledAgents);
};

/** Keeps the items whose tool id the tenant is offered. */
export const offeredToolsOf = <T extends { readonly id: string }>(
  tools: readonly T[],
  moduleIds: readonly string[],
  enabledAgents: ReadonlySet<string>,
): T[] => tools.filter((tool) => isCommandOffered(tool.id, moduleIds, enabledAgents));

/**
 * The `catalog.renderForm` check: a tool call's context carries the tenant but not the run's
 * request context, so the tenant's settings are read by id. An unreadable store offers no module
 * command (as the settings reader's defaults name no module).
 */
export const createCommandOfferedCheck =
  (settings: SettingsPort, moduleIds: readonly string[]) =>
  async (toolId: string, ctx: Pick<CoreToolContext, "agent">): Promise<boolean> => {
    if (moduleOfCommand(toolId, moduleIds) === undefined) return true;
    const enabledAgents = await settings.getAgentSettings({ tenantId: ctx.agent.tenantId }).then(
      (read) => new Set(read.enabledAgents),
      () => new Set<string>(),
    );
    return isCommandOffered(toolId, moduleIds, enabledAgents);
  };

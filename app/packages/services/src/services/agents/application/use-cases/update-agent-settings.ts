import type { AgentSettings, TenantId, UpdateAgentSettingsInput, UserPrincipal } from "@core/contracts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import type { ConsoleDeps } from "#/services/platform/application/console-deps.ts";
import { type AgentSettingsFields, agentSettingsOf } from "#/services/platform/application/ports/console-ports.ts";
import {
  baseCapsOf,
  changeTenantBudget,
  storedSettingsOf,
} from "#/services/platform/application/use-cases/sync-tenant-budget.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { resolveTenantCaps, selfCapWithin } from "#/services/usage/domain/budget-policy.ts";

/** The organization's own cap is above the plan (or staff override): it may only lower it. */
export type AgentSettingsError = { readonly code: "ABOVE_PLAN" };

export type UpdateAgentSettingsCommand = {
  readonly actor: UserPrincipal;
  /** `tenant` (`/v1/agent-settings`) or `staff` (`/v1/admin/organizations/{id}/agent-settings`); both already authorized. */
  readonly by: "tenant" | "staff";
  readonly tenantId: TenantId;
  readonly requestId: string;
  readonly input: UpdateAgentSettingsInput;
};

export type UpdateAgentSettings = (
  command: UpdateAgentSettingsCommand,
) => Promise<Result<AgentSettings, AgentSettingsError>>;

const audit = (deps: Pick<ConsoleDeps, "audit">, command: UpdateAgentSettingsCommand, changes: string[]) => {
  const common = {
    action: "AGENT_SETTINGS_UPDATED" as const,
    actor: auditActorOf(command.actor),
    target: { type: "agent-settings", id: command.tenantId },
    outcome: "success" as const,
    requestId: command.requestId,
    changes,
  };
  return command.by === "staff"
    ? deps.audit.record({ log: "platform", ...common, targetTenantId: command.tenantId })
    : deps.audit.record({
        log: "tenant",
        ...common,
        tenantId: command.tenantId,
        node: { level: "organization", tenantId: command.tenantId },
      });
};

/**
 * Partial update of an organization's agent settings (decision 0039): enabled agents, web opt-ins,
 * PII mode, and the organization's own lower cap, which may never exceed the plan or staff override
 * (400). The caps in force are then re-materialized for the budget guard, tightened first so a
 * failed write never leaves them looser than intended (`changeTenantBudget`).
 */
export const makeUpdateAgentSettings =
  (deps: ConsoleDeps): UpdateAgentSettings =>
  async (command) => {
    const { input, tenantId } = command;
    const base = await baseCapsOf(deps, tenantId);
    const baseCaps = resolveTenantCaps({ plan: base.plan, override: base.override, selfCap: null }).caps;
    if (input.budget !== undefined && input.budget !== null && !selfCapWithin(input.budget, baseCaps))
      return err({ code: "ABOVE_PLAN" });
    const stored = await storedSettingsOf(deps, tenantId, baseCaps);
    const selfCap = input.budget === undefined ? stored.selfCap : input.budget;
    const settings: AgentSettingsFields = {
      ...stored.settings,
      ...(input.enabledAgents === undefined ? {} : { enabledAgents: [...input.enabledAgents] }),
      ...(input.webTools === undefined ? {} : { webTools: { ...input.webTools } }),
      ...(input.guardrails === undefined ? {} : { guardrails: { ...input.guardrails } }),
      updatedBy: command.actor.uid,
      updatedAt: deps.clock.now().toISOString(),
    };
    const resolved = await changeTenantBudget(deps, {
      tenantId,
      next: (inputs) => ({ ...inputs, selfCap }),
      write: () => deps.agentSettings.save({ settings, selfCap }),
    });
    await audit(
      deps,
      command,
      Object.keys(input).filter((key) => input[key as keyof UpdateAgentSettingsInput] !== undefined),
    );
    return ok(agentSettingsOf({ settings: { ...settings, budget: { ...resolved.caps } }, selfCap }));
  };

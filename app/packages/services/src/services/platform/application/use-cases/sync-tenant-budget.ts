import { type AgentSettings, type BudgetCaps, TenantIdSchema } from "@core/contracts";
import { resolveTenantCaps, type TenantCaps } from "../../../usage/domain/budget-policy.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { StoredAgentSettings } from "../ports/console-ports.ts";

/** Subagents of an organization without stored settings: core ones, never `web` (an opt-in). */
export const DEFAULT_SETTINGS_AGENTS: readonly string[] = ["knowledge", "data", "action"];

/**
 * Settings of an organization that never saved any: core subagents, web off, PII `redact` (the
 * conservative mode while `compliance.md` is a template) and the given caps.
 */
export const defaultAgentSettingsOf = (tenantId: string, caps: BudgetCaps, at: string): AgentSettings => ({
  tenantId: TenantIdSchema.parse(tenantId),
  enabledAgents: [...DEFAULT_SETTINGS_AGENTS],
  webTools: { firecrawl: false, browser: false },
  guardrails: { pii: "redact" },
  budget: { ...caps },
  updatedBy: null,
  createdAt: at,
  updatedAt: at,
});

/** Plan limits and staff override of a tenant: the caps above its own lower cap. */
export const baseCapsOf = async (deps: Pick<ConsoleDeps, "organizations" | "plans">, tenantId: string): Promise<{ readonly planId: string | null; readonly override: BudgetCaps | null; readonly plan: BudgetCaps | null }> => {
  const assignment = await deps.organizations.getPlan(tenantId);
  const plan = assignment.planId === null ? null : await deps.plans.get(assignment.planId);
  const limits = plan === null ? null : { monthlyMicroUsd: plan.limits.monthlyMicroUsd, monthlyTokens: plan.limits.monthlyTokens };
  return { planId: assignment.planId, override: assignment.budgetOverride, plan: limits };
};

/** Stored settings of a tenant, or the defaults with the given caps. */
export const storedSettingsOf = async (deps: Pick<ConsoleDeps, "agentSettings" | "clock">, tenantId: string, caps: BudgetCaps): Promise<StoredAgentSettings> =>
  (await deps.agentSettings.get(tenantId)) ?? { settings: defaultAgentSettingsOf(tenantId, caps, deps.clock.now().toISOString()), selfCap: null };

/**
 * Materializes a tenant's caps (decision 0039 amendment): plan / override / self-cap resolved by
 * `resolveTenantCaps`, written to `usage.tenant_budgets` (what `checkTenantBudget` enforces in the
 * runtime) and mirrored in `agent-settings.budget`. Called after every write that changes one input.
 */
export const syncTenantBudget = async (
  deps: Pick<ConsoleDeps, "organizations" | "plans" | "agentSettings" | "usage" | "clock">,
  tenantId: string,
  selfCapOverride?: BudgetCaps | null,
): Promise<TenantCaps> => {
  const base = await baseCapsOf(deps, tenantId);
  const stored = await deps.agentSettings.get(tenantId);
  const selfCap = selfCapOverride !== undefined ? selfCapOverride : (stored?.selfCap ?? null);
  const resolved = resolveTenantCaps({ plan: base.plan, override: base.override, selfCap });
  await deps.usage.setTenantBudget({ tenantId, budget: resolved.caps });
  if (stored !== null) await deps.agentSettings.save({ settings: { ...stored.settings, budget: { ...resolved.caps } }, selfCap });
  return resolved;
};

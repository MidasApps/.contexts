import { type BudgetCaps, TenantIdSchema } from "@core/contracts";
import { resolveTenantCaps, type TenantCaps } from "../../../usage/domain/budget-policy.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { AgentSettingsFields, StoredAgentSettings } from "../ports/console-ports.ts";

/** Subagents of an organization without stored settings: core ones, never `web` (an opt-in). */
export const DEFAULT_SETTINGS_AGENTS: readonly string[] = ["knowledge", "data", "action"];

/**
 * Settings of an organization that never saved any: core subagents, web off, PII `redact` (the
 * conservative mode while `compliance.md` is a template) and the given caps.
 */
export const defaultAgentSettingsOf = (tenantId: string, caps: BudgetCaps, at: string): AgentSettingsFields => ({
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
export const baseCapsOf = async (
  deps: Pick<ConsoleDeps, "organizations" | "plans">,
  tenantId: string,
): Promise<{
  readonly planId: string | null;
  readonly override: BudgetCaps | null;
  readonly plan: BudgetCaps | null;
}> => {
  const assignment = await deps.organizations.getPlan(tenantId);
  const plan = assignment.planId === null ? null : await deps.plans.get(assignment.planId);
  const limits =
    plan === null ? null : { monthlyMicroUsd: plan.limits.monthlyMicroUsd, monthlyTokens: plan.limits.monthlyTokens };
  return { planId: assignment.planId, override: assignment.budgetOverride, plan: limits };
};

/** Stored settings of a tenant, or the defaults with the given caps. */
export const storedSettingsOf = async (
  deps: Pick<ConsoleDeps, "agentSettings" | "clock">,
  tenantId: string,
  caps: BudgetCaps,
): Promise<StoredAgentSettings> =>
  (await deps.agentSettings.get(tenantId)) ?? {
    settings: defaultAgentSettingsOf(tenantId, caps, deps.clock.now().toISOString()),
    selfCap: null,
  };

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
  if (stored !== null)
    await deps.agentSettings.save({ settings: { ...stored.settings, budget: { ...resolved.caps } }, selfCap });
  return resolved;
};

/** The three inputs of a tenant's caps (`resolveTenantCaps`): plan limits, staff override, own lower cap. */
export type CapsInputs = {
  readonly plan: BudgetCaps | null;
  readonly override: BudgetCaps | null;
  readonly selfCap: BudgetCaps | null;
};

type BudgetDeps = Pick<ConsoleDeps, "organizations" | "plans" | "agentSettings" | "usage" | "clock">;

const capsInputsOf = async (deps: BudgetDeps, tenantId: string): Promise<CapsInputs> => {
  const base = await baseCapsOf(deps, tenantId);
  const stored = await deps.agentSettings.get(tenantId);
  return { plan: base.plan, override: base.override, selfCap: stored?.selfCap ?? null };
};

const tighterOf = (a: BudgetCaps, b: BudgetCaps): BudgetCaps => ({
  monthlyMicroUsd: Math.min(a.monthlyMicroUsd, b.monthlyMicroUsd),
  monthlyTokens: Math.min(a.monthlyTokens, b.monthlyTokens),
});

/**
 * Step 1 of a budget change: writes to `usage.tenant_budgets` the lower of the caps in force now and
 * the caps the pending change resolves to, so the guard is never looser than either while the
 * inputs (Firestore) and the final caps (Postgres) are written one after the other.
 */
export const tightenTenantBudget = async (
  deps: BudgetDeps,
  tenantId: string,
  next: (current: CapsInputs) => CapsInputs,
): Promise<void> => {
  const current = await capsInputsOf(deps, tenantId);
  const before = resolveTenantCaps(current).caps;
  const after = resolveTenantCaps(next(current)).caps;
  await deps.usage.setTenantBudget({ tenantId, budget: tighterOf(before, after) });
};

/**
 * One budget input change (decision 0039 amendment, backend fixes): 1. Postgres gets the tighter of
 * the old and new caps (`tightenTenantBudget`); 2. `write` stores the input in Firestore; 3. the caps
 * are materialized again from the stored inputs (`syncTenantBudget`). Firestore and Postgres share no
 * transaction: a failure at 2 or 3 throws and leaves caps tighter than, never looser than, both the
 * old and the new intent until the next write of that tenant.
 */
export const changeTenantBudget = async (
  deps: BudgetDeps,
  args: {
    readonly tenantId: string;
    readonly next: (current: CapsInputs) => CapsInputs;
    readonly write: () => Promise<void>;
  },
): Promise<TenantCaps> => {
  await tightenTenantBudget(deps, args.tenantId, args.next);
  await args.write();
  return syncTenantBudget(deps, args.tenantId);
};

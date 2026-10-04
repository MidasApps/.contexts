import type { AgentSettings, BudgetCaps, OrganizationStatus, Plan, PlanLimits } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";

/** Plans (Firestore `plans`, automatic ids; decision 0039). */
export type PlanRepository = {
  readonly list: () => Promise<readonly Plan[]>;
  readonly get: (planId: string) => Promise<Plan | null>;
  readonly create: (input: { readonly name: string; readonly limits: PlanLimits; readonly at: string; readonly actorId: string }) => Promise<Plan>;
  /** @returns null when the plan does not exist. */
  readonly replace: (input: { readonly id: string; readonly name: string; readonly limits: PlanLimits; readonly at: string; readonly actorId: string }) => Promise<Plan | null>;
};

/** An organization's commercial assignment (Firestore `organization-plans/{tenantId}`). */
export type OrganizationPlan = { readonly tenantId: string; readonly planId: string | null; readonly budgetOverride: BudgetCaps | null };

export type OrganizationListItem = { readonly id: string; readonly name: string; readonly status: OrganizationStatus };

/** Staff reads and narrow writes over SP1 organizations plus the plan assignment. */
export type OrganizationAdminStore = {
  /** Live (not deleted) organizations by id. */
  readonly listLive: (page: PageRequest) => Promise<Page<OrganizationListItem>>;
  readonly getLive: (tenantId: string) => Promise<OrganizationListItem | null>;
  /** Sets `status` on a live organization; false when it does not exist or is deleted. */
  readonly setStatus: (input: { readonly tenantId: string; readonly status: OrganizationStatus; readonly at: string; readonly actorId: string }) => Promise<boolean>;
  readonly getPlan: (tenantId: string) => Promise<OrganizationPlan>;
  readonly setPlan: (input: OrganizationPlan & { readonly at: string; readonly actorId: string }) => Promise<void>;
  /**
   * Distinct users holding a live grant at any node of the organization (decision 0044): the same
   * people the organization's members list shows; devices are not counted.
   */
  readonly countMembers: (tenantId: string) => Promise<number>;
  /** Organizations assigned to a plan (budgets follow a plan change). */
  readonly tenantsOnPlan: (planId: string) => Promise<readonly string[]>;
};

/** The stored fields of agent settings; the read model adds `ownBudget` from `selfCap` (decision 0060). */
export type AgentSettingsFields = Omit<AgentSettings, "ownBudget">;

/** Stored agent settings plus the tenant's own lower cap (decision 0039 amendment). */
export type StoredAgentSettings = { readonly settings: AgentSettingsFields; readonly selfCap: BudgetCaps | null };

/** The read model of stored settings: the own cap is read back as `ownBudget` (decision 0060). */
export const agentSettingsOf = (stored: StoredAgentSettings): AgentSettings => ({ ...stored.settings, ownBudget: stored.selfCap === null ? null : { ...stored.selfCap } });

/** Firestore `agent-settings/{tenantId}` (the contract names the tenant id as the document id). */
export type AgentSettingsRepository = {
  readonly get: (tenantId: string) => Promise<StoredAgentSettings | null>;
  readonly save: (stored: StoredAgentSettings) => Promise<void>;
};

/** Calls of one tenant on one UTC day with one model (`usage.llm_calls` grouped; decision 0044). */
export type UsageBucket = {
  readonly day: string;
  readonly provider: string;
  readonly model: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Priced calls only. */
  readonly costMicroUsd: number;
  readonly unpricedCalls: number;
};

/** What the console writes to the usage ledger's budget table, and reads for the cost columns. */
export type ConsoleUsage = {
  readonly setTenantBudget: (input: { readonly tenantId: string; readonly budget: BudgetCaps }) => Promise<void>;
  readonly monthCostMicroUsd: (input: { readonly tenantId: string; readonly monthStart: Date }) => Promise<number>;
  /** Distinct users of the tenant's ledger rows since an instant (the overview's active users). */
  readonly activeUserIds: (input: { readonly tenantId: string; readonly since: Date }) => Promise<readonly string[]>;
  /** The tenant's agent runs since an instant and how many a guardrail stopped (the overview's tripwire rate, decision 0066). */
  readonly agentRunCounts: (input: { readonly tenantId: string; readonly since: Date }) => Promise<{ readonly runs: number; readonly stopped: number }>;
  /** The tenant's calls in `[from, to)` grouped by UTC day, provider and model (`/v1/admin/usage`). */
  readonly usageBuckets: (input: { readonly tenantId: string; readonly from: Date; readonly to: Date }) => Promise<readonly UsageBucket[]>;
};

/** Settled approval requests since an instant, across tenants (the overview's approval rate). */
export type ApprovalDecisionCounts = { readonly approved: number; readonly rejected: number };

export type ApprovalStats = {
  /** `approved` counts requests approved since then, executed or failed afterwards included. */
  readonly countDecidedSince: (since: Date) => Promise<ApprovalDecisionCounts>;
};

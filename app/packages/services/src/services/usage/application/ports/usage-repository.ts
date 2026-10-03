import type { LlmCall } from "@core/contracts";

/**
 * Driven port of the usage ledger (SP3 spec §12, decision 0026). Every call
 * names the tenant it runs as; the Postgres adapter turns it into
 * `app.tenant_id` for row level security, so a tenant never reads or writes
 * another tenant's rows.
 */

/** Totals of a set of calls; `costMicroUsd` sums priced calls only. */
export type UsageTotals = {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
  readonly unpricedCalls: number;
};

export type StoredBudget = { readonly monthlyMicroUsd: number; readonly monthlyTokens: number };

export type ModelTotals = { readonly provider: string; readonly model: string; readonly totals: UsageTotals };

/** A month split by UTC day (oldest first), by agent and by user (largest cost first); `userId` null = platform jobs. */
export type UsageBreakdowns = {
  readonly byDay: readonly { readonly day: string; readonly totals: UsageTotals }[];
  readonly byAgent: readonly { readonly agentId: string; readonly totals: UsageTotals }[];
  readonly byUser: readonly { readonly userId: string | null; readonly totals: UsageTotals }[];
};

export type UsageRepository = {
  /**
   * Appends calls (any mix of tenants); a row whose id is already stored is skipped,
   * so a retried batch never double counts.
   * @returns how many rows were new.
   */
  readonly insertCalls: (calls: readonly LlmCall[]) => Promise<number>;
  /** Totals of the tenant's calls in the UTC month that starts at `monthStart` (view `usage.tenant_month_spend`). */
  readonly getMonthSpend: (input: { readonly tenantId: string; readonly monthStart: Date }) => Promise<UsageTotals>;
  /** The same month split by provider and model, largest cost first. */
  readonly getMonthByModel: (input: { readonly tenantId: string; readonly monthStart: Date }) => Promise<readonly ModelTotals[]>;
  /** The same month split by UTC day, agent and user (SP5 spec §7, decision 0060). */
  readonly getMonthBreakdowns: (input: { readonly tenantId: string; readonly monthStart: Date }) => Promise<UsageBreakdowns>;
  /** Stored caps of the tenant (`usage.tenant_budgets`); `null` = plan default. */
  readonly getTenantBudget: (input: { readonly tenantId: string }) => Promise<StoredBudget | null>;
  /** Stores the caps in force (SP5: plan, staff override and self-cap resolved by `resolveTenantCaps`). */
  readonly setTenantBudget: (input: { readonly tenantId: string; readonly budget: StoredBudget }) => Promise<void>;
};

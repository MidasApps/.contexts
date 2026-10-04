import { TenantIdSchema } from "@core/contracts";
import type { AuditWriter } from "../../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { resolveBudget } from "../../domain/budget-policy.ts";
import type { UsageReportRepository } from "../ports/usage-report-repository.ts";
import type { UsageRepository } from "../ports/usage-repository.ts";
import type { UsageSink } from "../ports/usage-sink.ts";
import { utcMonthStart } from "./usage-month.ts";

/** Ledger rows younger than this wait for the next run: exporter batches land a few seconds late. */
export const EXPORT_LAG_MS = 10 * 60_000;
const EXPORT_PAGE = 1_000;
const DAY_MS = 86_400_000;
/** Thresholds of decision 0039; 80 % is the governance alert, below the 100 % hard cap. */
export const BUDGET_ALERT_THRESHOLDS = [80, 100] as const;
export type BudgetAlertThreshold = (typeof BUDGET_ALERT_THRESHOLDS)[number];

export type TenantUsageReport = {
  readonly tenantId: string;
  readonly rollups: number;
  readonly exportedCalls: number;
  /** Thresholds reached for the first time this month: the caller notifies only these. */
  readonly newAlerts: readonly BudgetAlertThreshold[];
  readonly usedPercent: number;
};

export type ReportTenantUsage = (input: {
  readonly tenantId: string;
  readonly requestId: string;
}) => Promise<TenantUsageReport>;

export type ReportTenantUsageDeps = {
  readonly repository: Pick<UsageRepository, "getMonthSpend" | "getTenantBudget">;
  readonly reports: UsageReportRepository;
  readonly sink: UsageSink;
  readonly audit: AuditWriter;
  readonly clock: Clock;
};

const dayOf = (at: Date): string => at.toISOString().slice(0, 10);

// Pages through `(cursor, until]` and moves the cursor only after every page was exported.
const exportCalls = async (deps: ReportTenantUsageDeps, tenantId: string, until: Date): Promise<number> => {
  const after = await deps.reports.getExportCursor({ tenantId });
  if (after !== null && after >= until) return 0;
  let exported = 0;
  let afterKey: { occurredAt: string; id: string } | null = null;
  for (;;) {
    const page = await deps.reports.listCallsForExport({
      tenantId,
      after,
      until,
      page: { afterKey, limit: EXPORT_PAGE },
    });
    if (page.length > 0) await deps.sink.exportCalls(page);
    exported += page.length;
    const last = page.at(-1);
    if (last === undefined || page.length < EXPORT_PAGE) break;
    afterKey = { occurredAt: last.occurredAt, id: last.id };
  }
  await deps.reports.setExportCursor({ tenantId, exportedUntil: until });
  return exported;
};

const usedPercentOf = (
  spend: { costMicroUsd: number; tokens: number },
  budget: { monthlyMicroUsd: number; monthlyTokens: number },
): number => Math.max((spend.costMicroUsd * 100) / budget.monthlyMicroUsd, (spend.tokens * 100) / budget.monthlyTokens);

/**
 * One tenant of the `usage-report` workflow (SP5 spec §3.2, decision 0039): rebuilds yesterday's and
 * today's rollups (UTC), exports them and the new ledger rows through the `UsageSink`, and records
 * the budget thresholds reached this month. A threshold is stored before anyone is told, once per
 * month (`usage.budget_alerts`), and audited `BUDGET_THRESHOLD_REACHED`. Every step is idempotent,
 * so a rerun or a missed fire only catches up.
 */
export const makeReportTenantUsage =
  (deps: ReportTenantUsageDeps): ReportTenantUsage =>
  async ({ tenantId, requestId }) => {
    const now = deps.clock.now();
    const rollups = await deps.reports.upsertDailyRollups({
      tenantId,
      days: [dayOf(new Date(now.getTime() - DAY_MS)), dayOf(now)],
    });
    if (rollups.length > 0) await deps.sink.exportRollups(rollups);
    const exportedCalls = await exportCalls(deps, tenantId, new Date(now.getTime() - EXPORT_LAG_MS));
    const monthStart = utcMonthStart(now);
    const [stored, spend] = await Promise.all([
      deps.repository.getTenantBudget({ tenantId }),
      deps.repository.getMonthSpend({ tenantId, monthStart }),
    ]);
    const budget = resolveBudget(stored);
    const usedPercent = usedPercentOf(
      { costMicroUsd: spend.costMicroUsd, tokens: spend.inputTokens + spend.outputTokens },
      budget,
    );
    const newAlerts: BudgetAlertThreshold[] = [];
    for (const threshold of BUDGET_ALERT_THRESHOLDS) {
      if (usedPercent < threshold) continue;
      if (!(await deps.reports.recordBudgetAlert({ tenantId, month: dayOf(monthStart), thresholdPercent: threshold })))
        continue;
      newAlerts.push(threshold);
      const tenant = TenantIdSchema.parse(tenantId);
      await deps.audit.record({
        log: "tenant",
        tenantId: tenant,
        action: "BUDGET_THRESHOLD_REACHED",
        actor: { type: "system", id: "system" },
        target: { type: "organization", id: tenantId },
        node: { level: "organization", tenantId: tenant },
        outcome: "success",
        requestId,
        metadata: { thresholdPercent: threshold },
      });
    }
    return { tenantId, rollups: rollups.length, exportedCalls, newAlerts, usedPercent: Math.floor(usedPercent) };
  };

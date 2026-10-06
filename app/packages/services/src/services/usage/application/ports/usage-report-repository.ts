import type { LlmCall, UsageDailyRollup } from "@core/contracts";

/**
 * Driven port of the `usage-report` workflow (SP5 spec §3.2, decision 0039). Like the ledger,
 * every call names one tenant and runs under its row level security.
 */
export type UsageReportRepository = {
  /** Rebuilds the tenant's rollups of these UTC days (`YYYY-MM-DD`) from the ledger; an idempotent upsert. */
  readonly upsertDailyRollups: (input: {
    readonly tenantId: string;
    readonly days: readonly string[];
  }) => Promise<UsageDailyRollup[]>;
  /** Ledger rows with `after < occurredAt <= until`, oldest first, keyset-paged by `(occurredAt, id)`. */
  readonly listCallsForExport: (input: {
    readonly tenantId: string;
    readonly after: Date | null;
    readonly until: Date;
    readonly page: {
      readonly afterKey: { readonly occurredAt: string; readonly id: string } | null;
      readonly limit: number;
    };
  }) => Promise<LlmCall[]>;
  readonly getExportCursor: (input: { readonly tenantId: string }) => Promise<Date | null>;
  readonly setExportCursor: (input: { readonly tenantId: string; readonly exportedUntil: Date }) => Promise<void>;
  /**
   * Stores that the tenant reached `thresholdPercent` in the UTC month (`YYYY-MM-01`).
   * @returns `true` only the first time, so the alert goes out once per month and threshold.
   */
  readonly recordBudgetAlert: (input: {
    readonly tenantId: string;
    readonly month: string;
    readonly thresholdPercent: 80 | 100;
  }) => Promise<boolean>;
};

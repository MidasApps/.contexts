import { type UsageSummary, UsageSummarySchema } from "@core/contracts";
import { z } from "zod";
import type { Clock } from "../../../shared/clock/clock.ts";
import { resolveBudget } from "../../domain/budget-policy.ts";
import type { UsageRepository } from "../ports/usage-repository.ts";
import type { UsageValidationError } from "./record-llm-calls.ts";
import { monthKeyOf, monthStartOfKey, utcMonthStart, validationDetailsOf } from "./usage-month.ts";

export const GetUsageSummaryInputSchema = z.strictObject({
  tenantId: z.string().min(1).max(128),
  /** `YYYY-MM` (UTC); defaults to the current month. */
  month: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
    .optional(),
});
export type GetUsageSummaryInput = z.input<typeof GetUsageSummaryInputSchema>;

export type GetUsageSummary = (
  input: GetUsageSummaryInput,
) => Promise<{ readonly ok: true; readonly data: UsageSummary } | { readonly ok: false; readonly error: UsageValidationError }>;

/**
 * Month-to-date usage of a tenant against its caps, per model, day, agent and user (contract
 * `usage.UsageSummary`, SP3 spec §12, decision 0060); `/v1` and `/admin` (SP5) authorize `core.usage.read` before calling it.
 */
export const makeGetUsageSummary =
  (deps: { readonly repository: UsageRepository; readonly clock: Clock }): GetUsageSummary =>
  async (input) => {
    const parsed = GetUsageSummaryInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: { code: "VALIDATION_FAILED", details: validationDetailsOf(parsed.error.issues) } };
    const { tenantId } = parsed.data;
    const monthStart = parsed.data.month === undefined ? utcMonthStart(deps.clock.now()) : monthStartOfKey(parsed.data.month);
    const [totals, byModel, breakdowns, stored] = await Promise.all([
      deps.repository.getMonthSpend({ tenantId, monthStart }),
      deps.repository.getMonthByModel({ tenantId, monthStart }),
      deps.repository.getMonthBreakdowns({ tenantId, monthStart }),
      deps.repository.getTenantBudget({ tenantId }),
    ]);
    return { ok: true, data: UsageSummarySchema.parse({ tenantId, month: monthKeyOf(monthStart), totals, budget: resolveBudget(stored), byModel, ...breakdowns }) };
  };

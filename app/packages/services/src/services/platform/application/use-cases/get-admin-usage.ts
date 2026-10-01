import { ADMIN_USAGE_MAX_DAYS, type AdminUsage, AdminUsageSchema, type AdminUsageTotals } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { utcMonthStart } from "../../../usage/application/use-cases/usage-month.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { UsageBucket } from "../ports/console-ports.ts";

export type AdminUsageQuery = { readonly from?: string | undefined; readonly to?: string | undefined; readonly tenantId: string | null };
export type AdminUsageError = { readonly code: "INVALID_RANGE"; readonly field: "from" | "to"; readonly issue: "AFTER_TO" | "RANGE_TOO_LONG" } | { readonly code: "NOT_FOUND" };
export type GetAdminUsage = (query: AdminUsageQuery) => Promise<Result<AdminUsage, AdminUsageError>>;

type UsageDeps = Pick<ConsoleDeps, "organizations" | "usage" | "clock">;

const DAY_MS = 86_400_000;
const PAGE = 100;
/** Most organizations one answer reads (one ledger read each, under its row level security). */
export const ADMIN_USAGE_MAX_ORGANIZATIONS = 2000;
/** Ledger reads in flight at once: each one holds a connection for its transaction. */
const CONCURRENCY = 8;

const dayOf = (instant: Date): string => instant.toISOString().slice(0, 10);
const startOf = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const ZERO: AdminUsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 };

const add = (left: AdminUsageTotals, right: AdminUsageTotals): AdminUsageTotals => ({
  calls: left.calls + right.calls,
  inputTokens: left.inputTokens + right.inputTokens,
  outputTokens: left.outputTokens + right.outputTokens,
  costMicroUsd: left.costMicroUsd + right.costMicroUsd,
  unpricedCalls: left.unpricedCalls + right.unpricedCalls,
});

const totalsOf = ({ calls, inputTokens, outputTokens, costMicroUsd, unpricedCalls }: UsageBucket): AdminUsageTotals => ({ calls, inputTokens, outputTokens, costMicroUsd, unpricedCalls });

// Default: the UTC month to date. A range is at most ADMIN_USAGE_MAX_DAYS days, `from` not after `to`.
const rangeOf = (query: AdminUsageQuery, now: Date): Result<{ from: string; to: string }, AdminUsageError> => {
  const to = query.to ?? dayOf(now);
  const from = query.from ?? (query.to === undefined ? dayOf(utcMonthStart(now)) : dayOf(utcMonthStart(startOf(to))));
  const days = (startOf(to).getTime() - startOf(from).getTime()) / DAY_MS + 1;
  if (days < 1) return err({ code: "INVALID_RANGE", field: "from", issue: "AFTER_TO" });
  if (days > ADMIN_USAGE_MAX_DAYS) return err({ code: "INVALID_RANGE", field: "to", issue: "RANGE_TOO_LONG" });
  return ok({ from, to });
};

const liveTenantIds = async (deps: UsageDeps): Promise<{ ids: string[]; truncated: boolean }> => {
  const ids: string[] = [];
  let after: [string, string] | undefined;
  for (;;) {
    const page = await deps.organizations.listLive({ after, limit: PAGE });
    ids.push(...page.items.map((org) => org.id));
    const last = page.items.at(-1);
    if (page.nextCursor === null || last === undefined) return { ids, truncated: false };
    if (ids.length >= ADMIN_USAGE_MAX_ORGANIZATIONS) return { ids, truncated: true };
    after = [last.id, last.id];
  }
};

const readBuckets = async (deps: UsageDeps, tenantIds: readonly string[], range: { from: Date; to: Date }): Promise<UsageBucket[]> => {
  const buckets: UsageBucket[] = [];
  for (let index = 0; index < tenantIds.length; index += CONCURRENCY) {
    const chunk = tenantIds.slice(index, index + CONCURRENCY);
    const read = await Promise.all(chunk.map((tenantId) => deps.usage.usageBuckets({ tenantId, ...range })));
    buckets.push(...read.flat());
  }
  return buckets;
};

const groupBy = <K>(buckets: readonly UsageBucket[], keyOf: (bucket: UsageBucket) => string, labelOf: (bucket: UsageBucket) => K): { label: K; totals: AdminUsageTotals }[] => {
  const groups = new Map<string, { label: K; totals: AdminUsageTotals }>();
  for (const bucket of buckets) {
    const key = keyOf(bucket);
    groups.set(key, { label: groups.get(key)?.label ?? labelOf(bucket), totals: add(groups.get(key)?.totals ?? ZERO, totalsOf(bucket)) });
  }
  return [...groups.values()];
};

const daysOf = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let at = startOf(from).getTime(); at <= startOf(to).getTime(); at += DAY_MS) days.push(dayOf(new Date(at)));
  return days;
};

/**
 * `GET /v1/admin/usage` (decision 0044): usage and cost by UTC day and by model, of one live
 * organization or of every live one, straight from the usage ledger (the daily rollups lag a
 * day). The ledger is read per organization, under each tenant's row level security, a few at a
 * time; above `ADMIN_USAGE_MAX_ORGANIZATIONS` the answer says it is `truncated`.
 */
export const makeGetAdminUsage =
  (deps: UsageDeps): GetAdminUsage =>
  async (query) => {
    const now = deps.clock.now();
    const range = rangeOf(query, now);
    if (!range.ok) return range;
    const { from, to } = range.data;
    if (query.tenantId !== null && (await deps.organizations.getLive(query.tenantId)) === null) return err({ code: "NOT_FOUND" });
    const tenants = query.tenantId === null ? await liveTenantIds(deps) : { ids: [query.tenantId], truncated: false };
    const buckets = await readBuckets(deps, tenants.ids, { from: startOf(from), to: new Date(startOf(to).getTime() + DAY_MS) });
    const perDay = new Map(groupBy(buckets, (bucket) => bucket.day, (bucket) => bucket.day).map((group) => [group.label, group.totals]));
    const byModel = groupBy(buckets, (bucket) => `${bucket.provider}\u0000${bucket.model}`, (bucket) => ({ provider: bucket.provider, model: bucket.model }))
      .map((group) => ({ ...group.label, ...group.totals }))
      .sort((left, right) => right.costMicroUsd - left.costMicroUsd || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
    return ok(
      AdminUsageSchema.parse({
        from,
        to,
        organizationId: query.tenantId,
        totals: buckets.reduce((sum, bucket) => add(sum, totalsOf(bucket)), ZERO),
        byDay: daysOf(from, to).map((day) => ({ day, ...(perDay.get(day) ?? ZERO) })),
        byModel,
        organizations: tenants.ids.length,
        truncated: tenants.truncated,
        generatedAt: now.toISOString(),
      }),
    );
  };

import { type AdminOverview, AdminOverviewSchema } from "@core/contracts";
import { utcMonthStart } from "../../../usage/application/use-cases/usage-month.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { OrganizationListItem } from "../ports/console-ports.ts";

export type GetAdminOverview = () => Promise<AdminOverview>;

const PAGE = 100;
const WINDOW_MS = 7 * 86_400_000;
const EXPERIMENTS_READ = 50;

type OverviewDeps = Pick<ConsoleDeps, "organizations" | "usage" | "clock" | "approvals" | "evals">;

const allLiveOrganizations = async (deps: Pick<ConsoleDeps, "organizations">): Promise<OrganizationListItem[]> => {
  const all: OrganizationListItem[] = [];
  let after: [string, string] | undefined;
  for (;;) {
    const page = await deps.organizations.listLive({ after, limit: PAGE });
    all.push(...page.items);
    const last = page.items.at(-1);
    if (page.nextCursor === null || last === undefined) return all;
    after = [last.id, last.id];
  }
};

// One read per organization under its row level security; a user active in two organizations counts once.
const activeUsersOf = async (deps: OverviewDeps, organizations: readonly OrganizationListItem[], since: Date): Promise<number> => {
  const perTenant = await Promise.all(organizations.map((org) => deps.usage.activeUserIds({ tenantId: org.id, since })));
  return new Set(perTenant.flat()).size;
};

const approvalRateOf = async (deps: OverviewDeps, since: Date): Promise<number> => {
  if (deps.approvals === undefined) return 0;
  const { approved, rejected } = await deps.approvals.countDecidedSince(since);
  return approved + rejected === 0 ? 0 : approved / (approved + rejected);
};

// The latest finished experiment of any source (CI gate, prompt eval, tenant run) across tenants;
// the runtime being unreachable is `unknown`, never a failed overview.
const evalStatusOf = async (deps: OverviewDeps): Promise<AdminOverview["evalStatus"]> => {
  if (deps.evals === undefined) return "unknown";
  const listed = await deps.evals.listExperiments({ tenantId: null, page: 0, perPage: EXPERIMENTS_READ }).catch(() => null);
  if (listed === null || !listed.ok) return "unknown";
  const finished = listed.data.experiments.filter((experiment) => experiment.verdict !== "pending");
  const endOf = (experiment: (typeof finished)[number]) => experiment.finishedAt ?? experiment.startedAt;
  const latest = finished.sort((a, b) => endOf(b).localeCompare(endOf(a)))[0];
  return latest === undefined || latest.verdict === "pending" ? "unknown" : latest.verdict;
};

/**
 * `GET /v1/admin/overview` (SP5 spec §6), over active organizations:
 * - cost month to date and distinct active users of the last 7 days from the usage ledger (one read
 *   per organization, under each tenant's row level security);
 * - approval rate of the last 7 days: approved (executed and failed included) over approved plus
 *   rejected, 0 without decisions;
 * - eval status: verdict of the latest finished experiment (`unknown` when none or unreachable).
 * The tripwire rate stays 0: a guardrail stop aborts the run but is recorded neither in the audit
 * log nor in the ledger (follow-up: persist tripwires, then compute it here).
 */
export const makeGetAdminOverview =
  (deps: OverviewDeps): GetAdminOverview =>
  async () => {
    const now = deps.clock.now();
    const since = new Date(now.getTime() - WINDOW_MS);
    const organizations = (await allLiveOrganizations(deps)).filter((org) => org.status === "active");
    const [costs, activeUsers7d, approvalRate, evalStatus] = await Promise.all([
      Promise.all(organizations.map((org) => deps.usage.monthCostMicroUsd({ tenantId: org.id, monthStart: utcMonthStart(now) }))),
      activeUsersOf(deps, organizations, since),
      approvalRateOf(deps, since),
      evalStatusOf(deps),
    ]);
    return AdminOverviewSchema.parse({
      organizations: organizations.length,
      activeUsers7d,
      costMtdMicroUsd: costs.reduce((sum, cost) => sum + cost, 0),
      tripwireRate: 0,
      approvalRate,
      evalStatus,
      generatedAt: now.toISOString(),
    });
  };

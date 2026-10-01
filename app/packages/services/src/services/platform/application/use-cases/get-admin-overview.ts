import { type AdminOverview, AdminOverviewSchema } from "@core/contracts";
import { utcMonthStart } from "../../../usage/application/use-cases/usage-month.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { OrganizationListItem } from "../ports/console-ports.ts";

export type GetAdminOverview = () => Promise<AdminOverview>;

const PAGE = 100;

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

/**
 * `GET /v1/admin/overview` (SP5 spec §6). v1 computes the active organizations and the cost month
 * to date (one ledger read per organization, under each tenant's row level security). Active users,
 * tripwire and approval rates and the eval status need sources that do not exist yet (span
 * aggregates, an approvals read model, the eval run history): they answer 0 / `unknown` until then.
 */
export const makeGetAdminOverview =
  (deps: Pick<ConsoleDeps, "organizations" | "usage" | "clock">): GetAdminOverview =>
  async () => {
    const now = deps.clock.now();
    const organizations = (await allLiveOrganizations(deps)).filter((org) => org.status === "active");
    const costs = await Promise.all(organizations.map((org) => deps.usage.monthCostMicroUsd({ tenantId: org.id, monthStart: utcMonthStart(now) })));
    return AdminOverviewSchema.parse({
      organizations: organizations.length,
      activeUsers7d: 0,
      costMtdMicroUsd: costs.reduce((sum, cost) => sum + cost, 0),
      tripwireRate: 0,
      approvalRate: 0,
      evalStatus: "unknown",
      generatedAt: now.toISOString(),
    });
  };

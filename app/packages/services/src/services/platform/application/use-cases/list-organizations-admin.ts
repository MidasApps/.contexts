import { type OrganizationAdminSummary, OrganizationAdminSummarySchema } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { resolveTenantCaps } from "../../../usage/domain/budget-policy.ts";
import { utcMonthStart } from "../../../usage/application/use-cases/usage-month.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { OrganizationListItem } from "../ports/console-ports.ts";
import { baseCapsOf } from "./sync-tenant-budget.ts";

export type ListOrganizationsAdmin = (page: PageRequest) => Promise<Page<OrganizationAdminSummary>>;

/** One organization as staff see it: plan, caps in force and their source, cost month to date. */
export const summarizeOrganization = async (deps: Omit<ConsoleDeps, "audit">, org: OrganizationListItem): Promise<OrganizationAdminSummary> => {
  const base = await baseCapsOf(deps, org.id);
  const selfCap = (await deps.agentSettings.get(org.id))?.selfCap ?? null;
  const resolved = resolveTenantCaps({ plan: base.plan, override: base.override, selfCap });
  const costMtdMicroUsd = await deps.usage.monthCostMicroUsd({ tenantId: org.id, monthStart: utcMonthStart(deps.clock.now()) });
  // Parsed, not cast: the branded ids and caps are checked once here (a mismatch is a bug).
  return OrganizationAdminSummarySchema.parse({
    id: org.id,
    name: org.name,
    status: org.status,
    planId: base.planId,
    budget: { caps: { ...resolved.caps }, source: resolved.source, override: base.override },
    costMtdMicroUsd,
  });
};

/** `GET /v1/admin/organizations`: live organizations by id, one page at a time. */
export const makeListOrganizationsAdmin =
  (deps: Omit<ConsoleDeps, "audit">): ListOrganizationsAdmin =>
  async (page) => {
    const listed = await deps.organizations.listLive(page);
    return { items: await Promise.all(listed.items.map((org) => summarizeOrganization(deps, org))), nextCursor: listed.nextCursor };
  };

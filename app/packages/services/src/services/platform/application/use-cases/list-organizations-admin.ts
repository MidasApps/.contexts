import {
  type OrganizationAdminDetail,
  type OrganizationAdminSummary,
  OrganizationAdminSummarySchema,
  type OrganizationStatus,
} from "@core/contracts";
import { encodeCursor } from "../../../shared/pagination/cursor.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { normalizeSearchText } from "../../../shared/text/search-text.ts";
import { utcMonthStart } from "../../../usage/application/use-cases/usage-month.ts";
import { resolveTenantCaps } from "../../../usage/domain/budget-policy.ts";
import type { ConsoleDeps } from "../console-deps.ts";
import type { OrganizationListItem } from "../ports/console-ports.ts";
import { baseCapsOf } from "./sync-tenant-budget.ts";

/** Text and status the list is narrowed by; both absent lists every live organization. */
export type OrganizationFilter = {
  readonly query?: string | undefined;
  readonly status?: OrganizationStatus | undefined;
};

export type ListOrganizationsAdmin = (args: {
  readonly page: PageRequest;
  readonly filter?: OrganizationFilter;
}) => Promise<Page<OrganizationAdminSummary>>;
export type GetOrganizationAdmin = (tenantId: string) => Promise<OrganizationAdminDetail | null>;

/** Organizations read per store call while filtering, and the most read for one page (decision 0044). */
export const ORGANIZATION_SCAN_BATCH = 200;
export const ORGANIZATION_SCAN_BUDGET = 2_000;

// Sorts before every organization id (ids are alphanumeric): "continue the scan from the start".
const SCAN_START = "!";

/** One organization as staff see it: plan, caps in force and their source, cost month to date. */
export const summarizeOrganization = async (
  deps: Omit<ConsoleDeps, "audit">,
  org: OrganizationListItem,
): Promise<OrganizationAdminSummary> => {
  const base = await baseCapsOf(deps, org.id);
  const selfCap = (await deps.agentSettings.get(org.id))?.selfCap ?? null;
  const resolved = resolveTenantCaps({ plan: base.plan, override: base.override, selfCap });
  const costMtdMicroUsd = await deps.usage.monthCostMicroUsd({
    tenantId: org.id,
    monthStart: utcMonthStart(deps.clock.now()),
  });
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

type Matcher = (org: OrganizationListItem) => boolean;

// Every word of the text is somewhere in the name or the id; case and accents ignored.
const matcherOf = (filter: OrganizationFilter): Matcher => {
  const terms =
    filter.query === undefined
      ? []
      : normalizeSearchText(filter.query)
          .split(" ")
          .filter((term) => term !== "");
  return (org) => {
    if (filter.status !== undefined && org.status !== filter.status) return false;
    const haystack = normalizeSearchText(`${org.name} ${org.id}`);
    return terms.every((term) => haystack.includes(term));
  };
};

type Scan = {
  readonly matches: OrganizationListItem[];
  readonly exhausted: boolean;
  readonly lastScannedId: string | undefined;
};

// Reads live organizations by id from `afterId` until `wanted` matches, the end, or the budget.
const scanMatches = async (
  deps: Pick<ConsoleDeps, "organizations">,
  args: { afterId: string | undefined; wanted: number; matches: Matcher },
): Promise<Scan> => {
  const found: OrganizationListItem[] = [];
  let afterId = args.afterId;
  for (let scanned = 0; scanned < ORGANIZATION_SCAN_BUDGET; ) {
    const batch = await deps.organizations.listLive({
      after: afterId === undefined ? undefined : [afterId, afterId],
      limit: ORGANIZATION_SCAN_BATCH,
    });
    for (const org of batch.items) {
      if (args.matches(org)) found.push(org);
      if (found.length === args.wanted) return { matches: found, exhausted: false, lastScannedId: org.id };
    }
    scanned += batch.items.length;
    afterId = batch.items.at(-1)?.id ?? afterId;
    if (batch.nextCursor === null) return { matches: found, exhausted: true, lastScannedId: afterId };
  }
  return { matches: found, exhausted: false, lastScannedId: afterId };
};

// The organization whose id is the text, on the first page only (it always comes first).
const exactHit = async (
  deps: Pick<ConsoleDeps, "organizations">,
  args: { page: PageRequest; filter: OrganizationFilter },
): Promise<OrganizationListItem[]> => {
  const id = args.filter.query?.trim() ?? "";
  if (args.page.after !== undefined || !/^[A-Za-z0-9]{1,128}$/.test(id)) return [];
  const org = await deps.organizations.getLive(id);
  return org === null || (args.filter.status !== undefined && org.status !== args.filter.status) ? [] : [org];
};

/**
 * A filtered page (decision 0044). Firestore has no substring search, so live organizations are
 * read in id order and matched here; summaries (plan, budget, cost) are built for the page only.
 * One more match than the page holds is looked for, to know whether another page exists. When the
 * read budget ends first, the page is short (maybe empty) and its cursor continues the scan.
 */
const filteredPage = async (
  deps: Pick<ConsoleDeps, "organizations">,
  args: { page: PageRequest; filter: OrganizationFilter },
): Promise<Page<OrganizationListItem>> => {
  const exact = await exactHit(deps, args);
  const exactId = args.filter.query?.trim();
  const base = matcherOf(args.filter);
  const afterId = args.page.after === undefined || args.page.after[1] === SCAN_START ? undefined : args.page.after[1];
  const scan = await scanMatches(deps, {
    afterId,
    wanted: args.page.limit + 1 - exact.length,
    matches: (org) => org.id !== exactId && base(org),
  });
  const all = [...exact, ...scan.matches];
  if (all.length > args.page.limit) {
    const items = all.slice(0, args.page.limit);
    const position = (items.length > exact.length ? items.at(-1)?.id : undefined) ?? SCAN_START;
    return { items, nextCursor: encodeCursor([position, position]) };
  }
  const position = scan.lastScannedId ?? SCAN_START;
  return { items: all, nextCursor: scan.exhausted ? null : encodeCursor([position, position]) };
};

/** `GET /v1/admin/organizations`: live organizations by id, one page at a time, optionally filtered. */
export const makeListOrganizationsAdmin =
  (deps: Omit<ConsoleDeps, "audit">): ListOrganizationsAdmin =>
  async ({ page, filter = {} }) => {
    const filtering = filter.query !== undefined || filter.status !== undefined;
    const listed = filtering ? await filteredPage(deps, { page, filter }) : await deps.organizations.listLive(page);
    return {
      items: await Promise.all(listed.items.map((org) => summarizeOrganization(deps, org))),
      nextCursor: listed.nextCursor,
    };
  };

/** `GET /v1/admin/organizations/{organizationId}`: the summary plus the member count; null when not live. */
export const makeGetOrganizationAdmin =
  (deps: Omit<ConsoleDeps, "audit">): GetOrganizationAdmin =>
  async (tenantId) => {
    const org = await deps.organizations.getLive(tenantId);
    if (org === null) return null;
    const [summary, memberCount] = await Promise.all([
      summarizeOrganization(deps, org),
      deps.organizations.countMembers(tenantId),
    ]);
    return { ...summary, memberCount };
  };

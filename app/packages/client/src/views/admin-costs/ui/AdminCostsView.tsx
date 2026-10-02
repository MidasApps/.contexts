"use client";

import type { OrganizationAdminSummary } from "@core/contracts";
import { useId, useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { BUDGET_ALERT_RATIO, budgetUsage, BudgetUsagePill, useCollectedAdminOrganizations, type BudgetLevel } from "#/entities/admin-organization/index.ts";
import { useAdminOverview } from "#/entities/admin-overview/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { KpiCard } from "#/widgets/admin-kpi-cards/index.ts";
import { AdminPageFrame, AdminQuerySection, numberedPagination, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { CostCharts } from "#/widgets/cost-charts/index.ts";
import { UsageBreakdown } from "./UsageBreakdown.tsx";

const PAGE_SIZE = 20;
const LEVELS = ["all", "alert", "over"] as const;
type LevelFilter = (typeof LEVELS)[number];
const column = dataTableColumnHelper<OrganizationAdminSummary>();

const levelOf = (organization: OrganizationAdminSummary): BudgetLevel => budgetUsage(organization).level;
/** `alert` = at or above the threshold (over the cap included); `over` = over the cap only. */
const matchesLevel = (organization: OrganizationAdminSummary, filter: LevelFilter): boolean =>
  filter === "all" || (filter === "over" ? levelOf(organization) === "over" : levelOf(organization) !== "ok");

function AdjustLink({ organization }: { organization: OrganizationAdminSummary }) {
  const t = useTranslations("admin.costs");
  return (
    <Button variant="outline" size="sm" asChild>
      <RouteLink to={{ id: "admin", rest: `organizations/${organization.id}` }} aria-label={t("adjustNamed", { name: organization.name })}>
        {t("adjust")}
      </RouteLink>
    </Button>
  );
}

function Kpis({ organizations, totalCostMicroUsd }: { organizations: readonly OrganizationAdminSummary[]; totalCostMicroUsd: number }) {
  const t = useTranslations("admin.costs.kpi");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const threshold = format.number(BUDGET_ALERT_RATIO, { style: "percent" });
  return (
    <section aria-labelledby="costs-kpi-title" className="flex flex-col gap-3">
      <h2 id="costs-kpi-title" className="text-sm font-medium text-muted-foreground">
        {t("title")}
      </h2>
      <dl className="grid gap-3 sm:grid-cols-3">
        <KpiCard label={t("total")} value={formatCost(totalCostMicroUsd)} hint={t("totalHint")} />
        <KpiCard label={t("alert", { threshold })} value={format.number(organizations.filter((organization) => levelOf(organization) !== "ok").length)} hint={t("alertHint")} />
        <KpiCard label={t("over")} value={format.number(organizations.filter((organization) => levelOf(organization) === "over").length)} hint={t("overHint")} />
      </dl>
    </section>
  );
}

/** The list of flagged organizations stays short; the budgets table filtered at the alert shows them all. */
const ATTENTION_ROWS = 10;
const BUDGETS_SECTION_ID = "costs-budgets";

function Attention({ organizations }: { organizations: readonly OrganizationAdminSummary[] }) {
  const t = useTranslations("admin.costs.attention");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const search = useAdminSearch(["level"]);
  const flagged = organizations
    .filter((organization) => levelOf(organization) !== "ok")
    .sort((a, b) => (budgetUsage(b).ratio ?? Number.POSITIVE_INFINITY) - (budgetUsage(a).ratio ?? Number.POSITIVE_INFINITY));
  const shown = flagged.slice(0, ATTENTION_ROWS);
  const showAll = (): void => {
    search.set({ level: "alert" });
    document.getElementById(BUDGETS_SECTION_ID)?.scrollIntoView?.({ block: "start" });
  };
  return (
    <section aria-labelledby="costs-attention-title" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h2 id="costs-attention-title" className="text-sm font-medium">
        {t("title")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("description", { threshold: format.number(BUDGET_ALERT_RATIO, { style: "percent" }) })}</p>
      {flagged.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul aria-labelledby="costs-attention-title" className="flex flex-col divide-y divide-border">
          {shown.map((organization) => (
            <li key={organization.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{organization.name}</span>
                <span className="font-mono text-caption text-muted-foreground tabular-nums">
                  {t("costOfCap", { cost: formatCost(organization.costMtdMicroUsd), cap: formatCost(organization.budget.caps.monthlyMicroUsd) })}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <BudgetUsagePill organization={organization} />
                <AdjustLink organization={organization} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {flagged.length <= ATTENTION_ROWS ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t("shown", { shown: shown.length, count: flagged.length })}</p>
          <Button variant="outline" size="sm" onClick={showAll}>
            {t("viewAll", { count: flagged.length })}
          </Button>
        </div>
      )}
    </section>
  );
}

const useColumns = () => {
  const t = useTranslations("admin");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  return useMemo(
    () => [
      column.accessor("name", { header: () => t("costs.columns.organization"), cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
      column.accessor("costMtdMicroUsd", { header: () => t("costs.columns.costMtd"), meta: { numeric: true }, cell: ({ getValue }) => formatCost(getValue()) }),
      column.display({ id: "cap", header: () => t("costs.columns.cap"), meta: { numeric: true }, cell: ({ row }) => formatCost(row.original.budget.caps.monthlyMicroUsd) }),
      column.display({ id: "tokens", header: () => t("costs.columns.tokensCap"), meta: { numeric: true }, cell: ({ row }) => format.number(row.original.budget.caps.monthlyTokens) }),
      column.display({ id: "source", header: () => t("costs.columns.source"), cell: ({ row }) => t(`organizations.budgetSource.${row.original.budget.source}`) }),
      column.display({ id: "usage", header: () => t("costs.columns.usage"), meta: { numeric: true }, cell: ({ row }) => <BudgetUsagePill organization={row.original} /> }),
      column.display({ id: "actions", header: () => t("costs.columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <AdjustLink organization={row.original} /> }),
    ],
    [format, formatCost, t],
  );
};

function Budgets({ organizations }: { organizations: readonly OrganizationAdminSummary[] }) {
  const t = useTranslations("admin.costs");
  const formatCost = useFormatMicroUsd();
  const levelId = useId();
  const search = useAdminSearch(["level"]);
  const level: LevelFilter = LEVELS.find((candidate) => candidate === search.values.level) ?? "all";
  const columns = useColumns();
  const filtered = organizations.filter((organization) => matchesLevel(organization, level));
  const rows = filtered.slice((search.page - 1) * PAGE_SIZE, search.page * PAGE_SIZE);
  return (
    <section id={BUDGETS_SECTION_ID} aria-labelledby="costs-budgets-title" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="costs-budgets-title" className="text-sm font-medium">
          {t("budgetsTitle")}
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={levelId}>{t("filters.level")}</Label>
          <Select value={level} onValueChange={(value) => search.set({ level: value === "all" ? undefined : value })}>
            <SelectTrigger id={levelId} className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((candidate) => (
                <SelectItem key={candidate} value={candidate}>
                  {t(`filters.${candidate}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTable
        caption={t("caption")}
        captionHidden
        columns={columns}
        data={rows}
        getRowId={(organization) => organization.id}
        pagination={numberedPagination(search, { hasMore: filtered.length > search.page * PAGE_SIZE, pending: false }, t("pagination"))}
        renderCard={(organization) => (
          <div className="flex flex-col gap-2">
            <span className="font-medium">{organization.name}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {t("attention.costOfCap", { cost: formatCost(organization.costMtdMicroUsd), cap: formatCost(organization.budget.caps.monthlyMicroUsd) })}
              <BudgetUsagePill organization={organization} />
            </span>
            <span className="self-start">
              <AdjustLink organization={organization} />
            </span>
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={3}
            icon="wallet"
            title={t("noMatchTitle")}
            description={t("noMatchDescription")}
            action={
              <Button variant="secondary" onClick={() => search.set({ level: undefined })}>
                {t("clearFilter")}
              </Button>
            }
          />
        }
      />
    </section>
  );
}

/** Said above every number computed from the list when the client's page cap cut it. */
function TruncatedNotice({ count }: { count: number }) {
  const t = useTranslations("admin.costs");
  return (
    <Alert variant="warning">
      <Icon name="alert-triangle" />
      <AlertTitle>{t("organizationsTruncatedTitle")}</AlertTitle>
      <AlertDescription>{t("organizationsTruncatedDescription", { count })}</AlertDescription>
    </Alert>
  );
}

type CostsContentProps = { organizations: readonly OrganizationAdminSummary[]; truncated: boolean; overviewTotal: number | undefined };

function CostsContent({ organizations, truncated, overviewTotal }: CostsContentProps) {
  const t = useTranslations("admin.costs");
  // The platform total comes from the overview API; if that call failed, the listed organizations' sum stands in.
  const total = overviewTotal ?? organizations.reduce((sum, organization) => sum + organization.costMtdMicroUsd, 0);
  if (organizations.length === 0) {
    return (
      <EmptyState
        headingLevel={2}
        icon="wallet"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "admin", rest: "organizations" }}>{t("emptyAction")}</RouteLink>
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {truncated ? <TruncatedNotice count={organizations.length} /> : null}
      <Kpis organizations={organizations} totalCostMicroUsd={total} />
      <Attention organizations={organizations} />
      <CostCharts
        rowHeader={t("columns.organization")}
        totalCostMicroUsd={total}
        rows={organizations.map((organization) => ({ id: organization.id, label: organization.name, costMicroUsd: organization.costMtdMicroUsd, capMicroUsd: organization.budget.caps.monthlyMicroUsd }))}
      />
      <UsageBreakdown />
      <Budgets organizations={organizations} />
    </div>
  );
}

/**
 * `/admin/costs` (SP5 spec §6, platform.usage.read): cost month to date of the platform and of
 * each organization against its cap, who is at or over the 80 % alert threshold, and the budgets
 * in force with their source, and the usage by day and by model of a range (decision 0044).
 * Budgets are edited on the organization's page.
 */
export function AdminCostsView() {
  const t = useTranslations("admin.costs");
  const permissions = usePlatformPermissions();
  const allowed = permissions.can("platform.usage.read");
  const organizations = useCollectedAdminOrganizations({ enabled: allowed });
  const overview = useAdminOverview({ enabled: allowed });
  return (
    <AdminPageFrame permission="platform.usage.read" title={t("title")} description={t("description")}>
      <AdminQuerySection query={organizations} loadingLabel={t("loading")}>
        {(data) => <CostsContent organizations={data.items} truncated={data.truncated} overviewTotal={overview.data?.costMtdMicroUsd} />}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}

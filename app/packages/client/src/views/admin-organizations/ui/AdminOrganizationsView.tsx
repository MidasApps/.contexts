"use client";

import type { OrganizationAdminSummary, Plan } from "@core/contracts";
import { useId, useMemo } from "react";
import { useTranslations } from "use-intl";
import { ADMIN_ORGANIZATIONS_PAGE_LIMIT, BudgetUsagePill, OrganizationStatusPill, useAdminOrganizationSearch, type AdminOrganizationSearchFilter } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { usePlans } from "#/entities/plan/index.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { useDebouncedValue } from "#/shared/lib/timing/use-debounced-value.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SearchField } from "#/shared/ui/molecules/SearchField/SearchField.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

const ANY_STATUS = "any";
const MAX_QUERY = 200;
/** Typing waits this long before the server is asked. */
const SEARCH_DELAY_MS = 300;
const column = dataTableColumnHelper<OrganizationAdminSummary>();

function OrganizationName({ organization }: { organization: OrganizationAdminSummary }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{organization.name}</span>
      <span className="font-mono text-caption text-muted-foreground">{organization.id}</span>
    </span>
  );
}

function OpenLink({ organization }: { organization: OrganizationAdminSummary }) {
  const t = useTranslations("admin.organizations");
  return (
    <Button variant="outline" size="sm" asChild>
      <RouteLink to={{ id: "admin", rest: `organizations/${organization.id}` }} aria-label={t("openNamed", { name: organization.name })}>
        {t("open")}
      </RouteLink>
    </Button>
  );
}

const usePlanName = (plans: readonly Plan[] | undefined) => {
  const t = useTranslations("admin.organizations");
  return (organization: OrganizationAdminSummary): string => {
    if (organization.planId === null) return t("defaultPlan");
    return plans?.find((plan) => plan.id === organization.planId)?.name ?? organization.planId;
  };
};

const useColumns = (planName: (organization: OrganizationAdminSummary) => string) => {
  const t = useTranslations("admin.organizations");
  const formatCost = useFormatMicroUsd();
  return useMemo(
    () => [
      column.display({ id: "name", header: () => t("columns.organization"), cell: ({ row }) => <OrganizationName organization={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <OrganizationStatusPill status={getValue()} /> }),
      column.display({ id: "plan", header: () => t("columns.plan"), cell: ({ row }) => planName(row.original) }),
      column.accessor("costMtdMicroUsd", { header: () => t("columns.costMtd"), meta: { numeric: true }, cell: ({ getValue }) => formatCost(getValue()) }),
      column.display({
        id: "cap",
        header: () => t("columns.cap"),
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="flex flex-col items-end">
            <span>{formatCost(row.original.budget.caps.monthlyMicroUsd)}</span>
            <span className="font-sans text-caption text-muted-foreground">{t(`budgetSource.${row.original.budget.source}`)}</span>
          </span>
        ),
      }),
      column.display({ id: "usage", header: () => t("columns.usage"), meta: { numeric: true }, cell: ({ row }) => <BudgetUsagePill organization={row.original} /> }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <OpenLink organization={row.original} /> }),
    ],
    [formatCost, planName, t],
  );
};

function Filters({ query, status, onChange }: { query: string; status: string | undefined; onChange: (patch: { q?: string | undefined; status?: string | undefined }) => void }) {
  const t = useTranslations("admin.organizations");
  const statusId = useId();
  return (
    <div role="search" aria-label={t("filters.label")} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <SearchField
        className="sm:w-72"
        value={query}
        maxLength={MAX_QUERY}
        onValueChange={(value) => onChange({ q: value })}
        label={t("filters.search")}
        placeholder={t("filters.searchPlaceholder")}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={statusId}>{t("filters.status")}</Label>
        <Select value={status ?? ANY_STATUS} onValueChange={(value) => onChange({ status: value === ANY_STATUS ? undefined : value })}>
          <SelectTrigger id={statusId} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_STATUS}>{t("filters.anyStatus")}</SelectItem>
            <SelectItem value="active">{t("status.active")}</SelectItem>
            <SelectItem value="suspended">{t("status.suspended")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Results({ filter, filtering, plans, onClear }: { filter: AdminOrganizationSearchFilter; filtering: boolean; plans: readonly Plan[] | undefined; onClear: () => void }) {
  const t = useTranslations("admin.organizations");
  const formatCost = useFormatMicroUsd();
  const permissions = usePlatformPermissions();
  const organizations = useAdminOrganizationSearch(filter, { enabled: permissions.can("platform.organization.read") });
  const paged = useCursorPages(organizations, ADMIN_ORGANIZATIONS_PAGE_LIMIT, t("pagination"));
  const planName = usePlanName(plans);
  const columns = useColumns(planName);
  return (
    <AdminQuerySection query={organizations} loadingLabel={t("loading")}>
      {() => (
        <DataTable
          caption={t("caption")}
          captionHidden
          columns={columns}
          data={paged.rows}
          getRowId={(organization) => organization.id}
          pagination={paged.pagination}
          stateHeadingLevel={2}
          renderCard={(organization) => (
            <div className="flex flex-col gap-2">
              <span className="flex items-start justify-between gap-2">
                <OrganizationName organization={organization} />
                <OrganizationStatusPill status={organization.status} />
              </span>
              <span className="text-body">{planName(organization)}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {t("cardCost", { cost: formatCost(organization.costMtdMicroUsd), cap: formatCost(organization.budget.caps.monthlyMicroUsd) })}
                <BudgetUsagePill organization={organization} />
              </span>
              <span className="self-start">
                <OpenLink organization={organization} />
              </span>
            </div>
          )}
          empty={
            filtering ? (
              <EmptyState
                frame="plain"
                headingLevel={2}
                icon="search"
                title={t("noMatchTitle")}
                description={t("noMatchDescription")}
                action={
                  <Button variant="secondary" onClick={onClear}>
                    {t("clearFilters")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                frame="plain"
                headingLevel={2}
                icon="building"
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            )
          }
        />
      )}
    </AdminQuerySection>
  );
}

/** Filters live in the URL (a filtered list is a link staff can share); the server does the search. */
function OrganizationsList({ plans }: { plans: readonly Plan[] | undefined }) {
  const search = useAdminSearch(["q", "status"]);
  const typed = search.values.q ?? "";
  const status = search.values.status === "active" || search.values.status === "suspended" ? search.values.status : undefined;
  const debounced = useDebouncedValue(typed, SEARCH_DELAY_MS);
  // Clearing the box applies at once; only typing waits for the pause.
  const settled = (typed === "" ? "" : debounced).trim().slice(0, MAX_QUERY);
  const filter: AdminOrganizationSearchFilter = { query: settled === "" ? undefined : settled, status };
  return (
    <div className="flex flex-col gap-4">
      <Filters query={typed} status={status} onChange={search.set} />
      {/* A new filter starts from its first page. */}
      <Results key={`${status ?? ANY_STATUS}:${settled}`} filter={filter} filtering={typed !== "" || status !== undefined} plans={plans} onClear={() => search.set({ q: undefined, status: undefined })} />
    </div>
  );
}

/**
 * `/admin/organizations` (SP5 spec §6, platform.organization.read): every organization with its
 * status, plan, cost month to date and budget. The search (words of the name or id) and the status
 * filter are in the URL and run on the server, one cursor page at a time (decision 0044). Plan
 * names need `platform.plan.manage`; without it the plan id is shown.
 */
export function AdminOrganizationsView() {
  const t = useTranslations("admin.organizations");
  const permissions = usePlatformPermissions();
  const plans = usePlans({ enabled: permissions.can("platform.plan.manage") });
  return (
    <AdminPageFrame permission="platform.organization.read" title={t("title")} description={t("description")}>
      <OrganizationsList plans={plans.data} />
    </AdminPageFrame>
  );
}

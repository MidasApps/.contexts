"use client";

import type { OrganizationAdminSummary, TraceSummary } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { TraceCost, TraceDuration, TraceStatusPill, useAdminTraces, type TracePage } from "#/entities/trace/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminPageFrame, AdminQuerySection, numberedPagination, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { traceDateRange, validDay } from "../model/trace-date-range.ts";
import { AGENT_ID, TraceFilters, type TraceFilterValues } from "./TraceFilters.tsx";

const column = dataTableColumnHelper<TraceSummary>();

function TraceName({ trace }: { trace: TraceSummary }) {
  const t = useTranslations("admin.traces");
  return (
    <span className="flex min-w-0 flex-col">
      <RouteLink to={{ id: "admin", rest: `traces/${trace.traceId}` }} aria-label={t("open", { name: trace.name })} className="truncate font-medium underline-offset-4 hover:underline">
        {trace.name}
      </RouteLink>
      <span className="font-mono text-caption text-muted-foreground">{trace.traceId}</span>
    </span>
  );
}

/** What ran: the agent, else the workflow of the root span. */
const useTargetLabel = () => {
  const t = useTranslations("admin.traces");
  return (trace: Pick<TraceSummary, "agentId" | "workflowId">): string => {
    if (trace.agentId !== null) return t("agentTarget", { id: trace.agentId });
    if (trace.workflowId !== null) return t("workflowTarget", { id: trace.workflowId });
    return t("noTarget");
  };
};

/** Organization name when the list knows it, else the id; platform jobs have no organization. */
const useOrganizationLabel = (organizations: readonly OrganizationAdminSummary[] | undefined) => {
  const t = useTranslations("admin.traces");
  return (tenantId: string | null): string => (tenantId === null ? t("platform") : (organizations?.find((organization) => organization.id === tenantId)?.name ?? tenantId));
};

type Labels = { target: ReturnType<typeof useTargetLabel>; organization: ReturnType<typeof useOrganizationLabel> };

const useColumns = ({ target, organization }: Labels) => {
  const t = useTranslations("admin.traces");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "trace", header: () => t("columns.trace"), cell: ({ row }) => <TraceName trace={row.original} /> }),
      column.accessor("tenantId", { header: () => t("columns.organization"), cell: ({ getValue }) => organization(getValue()) }),
      column.display({ id: "target", header: () => t("columns.target"), cell: ({ row }) => target(row.original) }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <TraceStatusPill status={getValue()} /> }),
      column.accessor("startedAt", { header: () => t("columns.startedAt"), cell: ({ getValue }) => formatDateTime(getValue(), "precise") }),
      column.accessor("durationMs", { header: () => t("columns.duration"), meta: { numeric: true }, cell: ({ getValue }) => <TraceDuration durationMs={getValue()} /> }),
      column.display({
        id: "tokens",
        header: () => t("columns.tokens"),
        meta: { numeric: true },
        cell: ({ row }) => t("tokensValue", { input: format.number(row.original.inputTokens), output: format.number(row.original.outputTokens) }),
      }),
      column.accessor("costMicroUsd", { header: () => t("columns.cost"), meta: { numeric: true }, cell: ({ getValue }) => <TraceCost costMicroUsd={getValue()} /> }),
    ],
    [format, formatDateTime, organization, t, target],
  );
};

function TraceEmpty({ filtering, onClear }: { filtering: boolean; onClear: () => void }) {
  const t = useTranslations("admin.traces");
  if (filtering) {
    return (
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
    );
  }
  return (
    <EmptyState
      frame="plain"
      headingLevel={2}
      icon="scroll-text"
      title={t("emptyTitle")}
      description={t("emptyDescription")}
      action={
        <Button variant="secondary" asChild>
          <RouteLink to={{ id: "admin", rest: "logs" }}>{t("emptyAction")}</RouteLink>
        </Button>
      }
    />
  );
}

type TraceTableProps = { page: TracePage; labels: Labels; fetching: boolean; filtering: boolean; search: { page: number; setPage: (page: number) => void }; onClear: () => void };

function TraceTable({ page, labels, fetching, filtering, search, onClear }: TraceTableProps) {
  const t = useTranslations("admin.traces");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(labels);
  return (
    <DataTable
      caption={t("caption")}
      captionHidden
      columns={columns}
      data={page.data}
      getRowId={(trace) => trace.traceId}
      pagination={numberedPagination(search, { hasMore: page.meta.hasMore, pending: fetching }, t("pagination"))}
      stateHeadingLevel={2}
      renderCard={(trace) => (
        <div className="flex flex-col gap-2">
          <span className="flex items-start justify-between gap-2">
            <TraceName trace={trace} />
            <TraceStatusPill status={trace.status} />
          </span>
          <span className="text-body">
            {labels.organization(trace.tenantId)} · {labels.target(trace)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(trace.startedAt, "precise")} · <TraceDuration durationMs={trace.durationMs} /> · <TraceCost costMicroUsd={trace.costMicroUsd} />
          </span>
        </div>
      )}
      empty={<TraceEmpty filtering={filtering} onClear={onClear} />}
    />
  );
}

/**
 * `/admin/traces` (SP5 spec §6, platform.trace.read): traces of every organization, newest first,
 * filtered by organization, agent, status and days and paged by number, all in the URL. The cost
 * of a trace is what the usage ledger recorded for it. Each row opens the trace with its span tree.
 */
export function AdminTracesView() {
  const t = useTranslations("admin.traces");
  const permissions = usePlatformPermissions();
  const allowed = permissions.can("platform.trace.read");
  const search = useAdminSearch(["organizationId", "agentId", "status", "from", "to"]);
  const values: TraceFilterValues = {
    organizationId: search.values.organizationId,
    // A hand-edited URL must not turn into a 400: an invalid agent key is ignored.
    agentId: search.values.agentId !== undefined && AGENT_ID.test(search.values.agentId) ? search.values.agentId : undefined,
    status: search.values.status === "ok" || search.values.status === "error" ? search.values.status : undefined,
    from: validDay(search.values.from),
    to: validDay(search.values.to),
  };
  const { from, to, ...listFilters } = values;
  const traces = useAdminTraces({ page: search.page, ...listFilters, ...traceDateRange(from, to) }, { enabled: allowed });
  const organizations = useAllAdminOrganizations({ enabled: allowed && permissions.can("platform.organization.read") });
  const labels: Labels = { target: useTargetLabel(), organization: useOrganizationLabel(organizations.data) };
  const filtering = Object.values(values).some((value) => value !== undefined);
  const clear = (): void => search.set({ organizationId: undefined, agentId: undefined, status: undefined, from: undefined, to: undefined });
  return (
    <AdminPageFrame permission="platform.trace.read" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <TraceFilters key={values.agentId ?? ""} values={values} onChange={search.set} />
        <AdminQuerySection query={traces} loadingLabel={t("loading")}>
          {(page) => <TraceTable page={page} labels={labels} fetching={traces.isFetching} filtering={filtering} search={search} onClear={clear} />}
        </AdminQuerySection>
      </div>
    </AdminPageFrame>
  );
}

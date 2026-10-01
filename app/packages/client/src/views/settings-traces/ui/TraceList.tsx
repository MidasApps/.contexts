"use client";

import type { TraceSummary } from "@core/contracts";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { TraceCost, TraceDuration, TraceStatusPill, useTenantTraces, type TracePage } from "#/entities/trace/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { TraceFilters, type TraceFilterValues } from "./TraceFilters.tsx";
import { useTargetLabel } from "./trace-target.ts";

const column = dataTableColumnHelper<TraceSummary>();

type Organization = { id: string; name: string };

function TraceName({ trace, organizationId }: { trace: TraceSummary; organizationId: string }) {
  const t = useTranslations("settings.traces");
  return (
    <span className="flex min-w-0 flex-col">
      <RouteLink
        to={{ id: "settings", organizationId, section: "traces", rest: trace.traceId }}
        aria-label={t("open", { name: trace.name })}
        className="truncate font-medium underline-offset-4 hover:underline"
      >
        {trace.name}
      </RouteLink>
      <span className="font-mono text-[11.5px] text-muted-foreground">{trace.traceId}</span>
    </span>
  );
}

function TraceTarget({ trace }: { trace: TraceSummary }) {
  return useTargetLabel()(trace);
}

const useColumns = (organizationId: string) => {
  const t = useTranslations("settings.traces");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "trace", header: () => t("columns.trace"), cell: ({ row }) => <TraceName trace={row.original} organizationId={organizationId} /> }),
      column.display({ id: "target", header: () => t("columns.target"), cell: ({ row }) => <TraceTarget trace={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <TraceStatusPill status={getValue()} /> }),
      column.accessor("startedAt", { header: () => t("columns.startedAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.accessor("durationMs", { header: () => t("columns.duration"), meta: { numeric: true }, cell: ({ getValue }) => <TraceDuration durationMs={getValue()} /> }),
      column.display({
        id: "tokens",
        header: () => t("columns.tokens"),
        meta: { numeric: true },
        cell: ({ row }) => t("tokensValue", { input: format.number(row.original.inputTokens), output: format.number(row.original.outputTokens) }),
      }),
      column.accessor("costMicroUsd", { header: () => t("columns.cost"), meta: { numeric: true }, cell: ({ getValue }) => <TraceCost costMicroUsd={getValue()} /> }),
    ],
    [format, formatDateTime, organizationId, t],
  );
};

function TraceEmpty({ filtering, onClear }: { filtering: boolean; onClear: () => void }) {
  const t = useTranslations("settings.traces");
  if (!filtering) return <EmptyState frame="plain" headingLevel={2} icon="scroll-text" title={t("emptyTitle")} description={t("emptyDescription")} />;
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

type Paging = { page: number; setPage: (page: number) => void; hasMore: boolean; pending: boolean };

/** Numbered paging as previous/next (the console lists page by number, without a total). */
const paginationOf = ({ page, setPage, hasMore, pending }: Paging, label: string) =>
  page === 1 && !hasMore ? undefined : { hasPrevious: page > 1, hasNext: hasMore, pending, onPrevious: () => setPage(page - 1), onNext: () => setPage(page + 1), label };

type TraceTableProps = { organization: Organization; data: TracePage; paging: Paging; filtering: boolean; onClear: () => void };

function TraceTable({ organization, data, paging, filtering, onClear }: TraceTableProps) {
  const t = useTranslations("settings.traces");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(organization.id);
  return (
    <DataTable
      caption={t("caption", { organization: organization.name })}
      captionHidden
      columns={columns}
      data={data.data}
      getRowId={(trace) => trace.traceId}
      pagination={paginationOf(paging, t("pagination"))}
      stateHeadingLevel={2}
      renderCard={(trace) => (
        <div className="flex flex-col gap-2">
          <span className="flex items-start justify-between gap-2">
            <TraceName trace={trace} organizationId={organization.id} />
            <TraceStatusPill status={trace.status} />
          </span>
          <span className="text-[13px]">
            <TraceTarget trace={trace} />
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(trace.startedAt)} · <TraceDuration durationMs={trace.durationMs} /> · <TraceCost costMicroUsd={trace.costMicroUsd} />
          </span>
        </div>
      )}
      empty={<TraceEmpty filtering={filtering} onClear={onClear} />}
    />
  );
}

/**
 * The organization's traces, newest first (`GET /v1/traces`, tenant forced on the server),
 * filtered by status and agent and paged by number. Filters and page are page state: the
 * settings route carries no search.
 */
export function TraceList({ organization }: { organization: Organization }) {
  const t = useTranslations("settings.traces");
  const [values, setValues] = useState<TraceFilterValues>({ agentId: undefined, status: undefined });
  const [page, setPage] = useState(1);
  const traces = useTenantTraces(organization.id, { page, ...values });
  const change = (patch: Partial<TraceFilterValues>): void => {
    setValues((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const filtering = values.agentId !== undefined || values.status !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <TraceFilters key={values.agentId ?? ""} values={values} onChange={change} />
      <QuerySection query={traces} loadingLabel={t("loading")}>
        {(data) => (
          <TraceTable
            organization={organization}
            data={data}
            paging={{ page, setPage, hasMore: data.meta.hasMore, pending: traces.isFetching }}
            filtering={filtering}
            onClear={() => change({ agentId: undefined, status: undefined })}
          />
        )}
      </QuerySection>
    </div>
  );
}

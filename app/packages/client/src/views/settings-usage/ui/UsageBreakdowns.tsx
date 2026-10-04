"use client";

import type { UsageSummary } from "@core/contracts";
import { type ReactNode, useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { useAgentLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { BarChartFigure } from "#/shared/ui/molecules/Chart/BarChartFigure.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

type Totals = UsageSummary["totals"];
/** A breakdown row with its display name resolved (agent label, member name, or the id). */
type NamedRow = { id: string; name: ReactNode; totals: Totals };
const column = dataTableColumnHelper<NamedRow>();

/** Name, calls, tokens and cost: the same columns for agents and users. */
const useNamedColumns = (nameHeader: string) => {
  const t = useTranslations("settings.usage.breakdowns.columns");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  return useMemo(
    () => [
      column.display({
        id: "name",
        header: () => nameHeader,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      }),
      column.display({
        id: "calls",
        header: () => t("calls"),
        meta: { numeric: true },
        cell: ({ row }) => format.number(row.original.totals.calls),
      }),
      column.display({
        id: "tokens",
        header: () => t("tokens"),
        meta: { numeric: true },
        cell: ({ row }) => format.number(row.original.totals.inputTokens + row.original.totals.outputTokens),
      }),
      column.display({
        id: "cost",
        header: () => t("cost"),
        meta: { numeric: true },
        cell: ({ row }) => formatCost(row.original.totals.costMicroUsd),
      }),
    ],
    [format, formatCost, nameHeader, t],
  );
};

function NamedTable({
  title,
  caption,
  nameHeader,
  rows,
}: {
  title: string;
  caption: string;
  nameHeader: string;
  rows: readonly NamedRow[];
}) {
  const t = useTranslations("settings.usage.breakdowns");
  const formatCost = useFormatMicroUsd();
  const columns = useNamedColumns(nameHeader);
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <DataTable
        caption={caption}
        captionHidden
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        stateHeadingLevel={3}
        renderCard={(row) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.name}</span>
            <span className="font-mono text-xs tabular-nums">
              {t("cardMeta", { calls: row.totals.calls, cost: formatCost(row.totals.costMicroUsd) })}
            </span>
          </div>
        )}
        empty={null}
      />
    </section>
  );
}

/**
 * The month by UTC day (chart with its data table), by agent and by user (decision 0060). Agents
 * show their labels (decision 0052); users their member name when the viewer may list members,
 * else the uid; calls without a user are the platform's own jobs. Hidden when the month has no
 * calls: the per-model empty state already says so.
 */
export function UsageBreakdowns({
  summary,
  memberName,
}: {
  summary: UsageSummary;
  memberName: (uid: string | null) => string | undefined;
}) {
  const t = useTranslations("settings.usage.breakdowns");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const agentLabel = useAgentLabel();
  if (summary.totals.calls === 0) return null;
  // The ledger buckets by UTC day, so the label is the UTC day too.
  const dayLabel = (day: string): string =>
    format.dateTime(new Date(`${day}T00:00:00.000Z`), { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  const agents = summary.byAgent.map((row) => ({ id: row.agentId, name: agentLabel(row.agentId), totals: row.totals }));
  const users = summary.byUser.map((row) => ({
    id: row.userId ?? "platform",
    name:
      row.userId === null
        ? t("platformJobs")
        : (memberName(row.userId) ?? <span className="font-mono text-xs break-all">{row.userId}</span>),
    totals: row.totals,
  }));
  return (
    <div className="flex flex-col gap-6">
      <BarChartFigure
        title={t("byDay.title")}
        description={t("byDay.description")}
        series={[{ key: "cost", label: t("columns.cost") }]}
        rows={summary.byDay.map((row) => ({
          id: row.day,
          label: dayLabel(row.day),
          values: { cost: row.totals.costMicroUsd },
        }))}
        rowHeader={t("byDay.day")}
        formatValue={(value) => formatCost(value)}
      />
      <NamedTable
        title={t("byAgent.title")}
        caption={t("byAgent.caption")}
        nameHeader={t("byAgent.name")}
        rows={agents}
      />
      <NamedTable title={t("byUser.title")} caption={t("byUser.caption")} nameHeader={t("byUser.name")} rows={users} />
    </div>
  );
}

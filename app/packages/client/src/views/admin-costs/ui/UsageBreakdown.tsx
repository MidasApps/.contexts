"use client";

import type { AdminUsage } from "@core/contracts";
import { useId, useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useAdminUsage } from "#/entities/admin-usage/index.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { BarChartFigure } from "#/shared/ui/molecules/Chart/BarChartFigure.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminOrganizationFilter, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

type ModelRow = AdminUsage["byModel"][number];
const column = dataTableColumnHelper<ModelRow>();
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MODELS_IN_CHART = 10;

/** A day of the URL when it has the day format; anything else is ignored (the API validates the rest). */
const dayOf = (value: string | undefined): string | undefined => (value !== undefined && DAY.test(value) ? value : undefined);

const useModelColumns = () => {
  const t = useTranslations("admin.costs.usage");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  return useMemo(
    () => [
      column.accessor("model", { header: () => t("columns.model"), cell: ({ getValue }) => <span className="font-mono text-[12.5px]">{getValue()}</span> }),
      column.accessor("provider", { header: () => t("columns.provider") }),
      column.accessor("calls", { header: () => t("columns.calls"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
      column.accessor("inputTokens", { header: () => t("columns.inputTokens"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
      column.accessor("outputTokens", { header: () => t("columns.outputTokens"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
      column.accessor("costMicroUsd", { header: () => t("columns.cost"), meta: { numeric: true }, cell: ({ getValue }) => formatCost(getValue()) }),
      column.accessor("unpricedCalls", { header: () => t("columns.unpriced"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
    ],
    [format, formatCost, t],
  );
};

function Totals({ usage }: { usage: AdminUsage }) {
  const t = useTranslations("admin.costs.usage");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const day = (value: string): string => format.dateTime(new Date(`${value}T00:00:00.000Z`), { timeZone: "UTC", dateStyle: "medium" });
  return (
    <p role="status" className="text-sm">
      {t("totals", {
        from: day(usage.from),
        to: day(usage.to),
        cost: formatCost(usage.totals.costMicroUsd),
        calls: format.number(usage.totals.calls),
        tokens: format.number(usage.totals.inputTokens + usage.totals.outputTokens),
      })}
    </p>
  );
}

function Charts({ usage, onClear }: { usage: AdminUsage; onClear: () => void }) {
  const t = useTranslations("admin.costs.usage");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const columns = useModelColumns();
  const dayLabel = (value: string): string => format.dateTime(new Date(`${value}T00:00:00.000Z`), { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  if (usage.totals.calls === 0) {
    return (
      <EmptyState
        frame="plain"
        headingLevel={3}
        icon="wallet"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={
          <Button variant="secondary" onClick={onClear}>
            {t("clear")}
          </Button>
        }
      />
    );
  }
  const topModels = usage.byModel.slice(0, MODELS_IN_CHART);
  return (
    <div className="flex flex-col gap-6">
      {usage.truncated ? (
        <Alert variant="warning">
          <Icon name="alert-triangle" />
          <AlertTitle>{t("truncatedTitle")}</AlertTitle>
          <AlertDescription>{t("truncatedDescription", { count: usage.organizations })}</AlertDescription>
        </Alert>
      ) : null}
      {usage.totals.unpricedCalls === 0 ? null : <p className="text-xs text-muted-foreground">{t("unpricedNote", { count: usage.totals.unpricedCalls })}</p>}
      <BarChartFigure
        title={t("byDayTitle")}
        description={t("byDayDescription")}
        series={[{ key: "cost", label: t("columns.cost") }]}
        rows={usage.byDay.map((day) => ({ id: day.day, label: dayLabel(day.day), values: { cost: day.costMicroUsd } }))}
        rowHeader={t("columns.day")}
        formatValue={(value) => formatCost(value)}
      />
      <BarChartFigure
        title={t("byModelTitle")}
        description={usage.byModel.length > topModels.length ? t("byModelDescriptionTop", { shown: topModels.length, total: usage.byModel.length }) : t("byModelDescription")}
        series={[{ key: "cost", label: t("columns.cost") }]}
        rows={topModels.map((model) => ({ id: `${model.provider}/${model.model}`, label: model.model, values: { cost: model.costMicroUsd } }))}
        rowHeader={t("columns.model")}
        formatValue={(value) => formatCost(value)}
      />
      <DataTable caption={t("modelsCaption")} columns={columns} data={usage.byModel} getRowId={(model) => `${model.provider}/${model.model}`} stateHeadingLevel={3} empty={null} />
    </div>
  );
}

/**
 * Usage by day and by model on `/admin/costs` (`GET /v1/admin/usage`, decision 0044): the month
 * to date of every organization by default; an organization and a range of UTC days (the ledger's
 * days) narrow it, all in the URL. Its own loading, error and empty states: the budgets above do
 * not wait for it.
 */
export function UsageBreakdown() {
  const t = useTranslations("admin.costs.usage");
  const fromId = useId();
  const toId = useId();
  const search = useAdminSearch(["organizationId", "from", "to"]);
  const filters = { organizationId: search.values.organizationId, from: dayOf(search.values.from), to: dayOf(search.values.to) };
  const usage = useAdminUsage(filters);
  const clear = (): void => search.set({ organizationId: undefined, from: undefined, to: undefined });
  return (
    <section aria-labelledby="costs-usage-title" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id="costs-usage-title" className="text-sm font-medium">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <div role="search" aria-label={t("filtersLabel")} className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <AdminOrganizationFilter value={filters.organizationId} onValueChange={(organizationId) => search.set({ organizationId })} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fromId}>{t("from")}</Label>
          <Input id={fromId} type="date" className="lg:w-40" value={filters.from ?? ""} max={filters.to} onChange={(event) => search.set({ from: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={toId}>{t("to")}</Label>
          <Input id={toId} type="date" className="lg:w-40" value={filters.to ?? ""} min={filters.from} onChange={(event) => search.set({ to: event.target.value })} />
        </div>
      </div>
      <AdminQuerySection query={usage} loadingLabel={t("loading")} rows={4}>
        {(data) => (
          <div className="flex flex-col gap-4">
            <Totals usage={data} />
            <Charts usage={data} onClear={clear} />
          </div>
        )}
      </AdminQuerySection>
    </section>
  );
}

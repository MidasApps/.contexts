"use client";

import type { UsageSummary } from "@core/contracts";
import { useId, useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { budgetUse, type BudgetLevel } from "#/entities/usage/index.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

type ModelRow = UsageSummary["byModel"][number];
const column = dataTableColumnHelper<ModelRow>();

const LEVEL_TONES: Record<BudgetLevel, StatusTone> = { ok: "emerald", alert: "amber", over: "danger" };
const BAR_TONES: Record<BudgetLevel, string> = { ok: "bg-emerald", alert: "bg-amber", over: "bg-destructive" };

function Totals({ summary }: { summary: UsageSummary }) {
  const t = useTranslations("settings.usage.totals");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const { totals } = summary;
  const items = [
    { key: "cost", value: formatCost(totals.costMicroUsd), hint: t("costHint") },
    { key: "tokens", value: format.number(totals.inputTokens + totals.outputTokens), hint: t("tokensHint", { input: format.number(totals.inputTokens), output: format.number(totals.outputTokens) }) },
    { key: "calls", value: format.number(totals.calls), hint: t("callsHint") },
    { key: "unpriced", value: format.number(totals.unpricedCalls), hint: t("unpricedHint") },
  ] as const;
  return (
    <section aria-labelledby="usage-totals-title" className="flex flex-col gap-3">
      <h2 id="usage-totals-title" className="text-sm font-medium text-muted-foreground">
        {t("title")}
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{t(item.key)}</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">{item.value}</dd>
            <dd className="text-xs text-muted-foreground">{item.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CapRow({ label, used, cap, usedText, capText, threshold }: { label: string; used: number; cap: number; usedText: string; capText: string; threshold: number }) {
  const t = useTranslations("settings.usage.budget");
  const format = useFormatter();
  const labelId = useId();
  const { ratio, level } = budgetUse(used, cap, threshold);
  const percent = ratio === null ? 100 : Math.min(100, Math.round(ratio * 100));
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        <StatusPill tone={LEVEL_TONES[level]}>{t(`level.${level}`)}</StatusPill>
      </div>
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t("useOfCap", { used: usedText, cap: capText })}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full ${BAR_TONES[level]}`} style={{ width: `${String(percent)}%` }} />
      </div>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {ratio === null ? t("useOfCap", { used: usedText, cap: capText }) : t("useOfCapWithPercent", { used: usedText, cap: capText, percent: format.number(ratio, { style: "percent", maximumFractionDigits: 0 }) })}
      </p>
    </li>
  );
}

function Budget({ summary }: { summary: UsageSummary }) {
  const t = useTranslations("settings.usage.budget");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const { totals, budget } = summary;
  const tokens = totals.inputTokens + totals.outputTokens;
  const threshold = budget.alertThresholdPercent;
  const levels = [budgetUse(totals.costMicroUsd, budget.monthlyMicroUsd, threshold).level, budgetUse(tokens, budget.monthlyTokens, threshold).level];
  const worst: BudgetLevel = levels.includes("over") ? "over" : levels.includes("alert") ? "alert" : "ok";
  return (
    <section aria-labelledby="usage-budget-title" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id="usage-budget-title" className="text-title font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description", { threshold })}</p>
      </div>
      {worst === "ok" ? null : (
        <Alert variant={worst === "over" ? "destructive" : "warning"}>
          <AlertTitle>{t(`alert.${worst}.title`)}</AlertTitle>
          <AlertDescription>{t(`alert.${worst}.description`, { threshold })}</AlertDescription>
        </Alert>
      )}
      <ul className="flex flex-col gap-4">
        <CapRow label={t("spend")} used={totals.costMicroUsd} cap={budget.monthlyMicroUsd} usedText={formatCost(totals.costMicroUsd)} capText={formatCost(budget.monthlyMicroUsd)} threshold={threshold} />
        <CapRow label={t("tokens")} used={tokens} cap={budget.monthlyTokens} usedText={format.number(tokens)} capText={format.number(budget.monthlyTokens)} threshold={threshold} />
      </ul>
    </section>
  );
}

function Models({ summary }: { summary: UsageSummary }) {
  const t = useTranslations("settings.usage.models");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const columns = useMemo(
    () => [
      column.display({ id: "model", header: () => t("columns.model"), cell: ({ row }) => <span className="font-medium">{row.original.model}</span> }),
      column.accessor("provider", { header: () => t("columns.provider") }),
      column.display({ id: "calls", header: () => t("columns.calls"), meta: { numeric: true }, cell: ({ row }) => format.number(row.original.totals.calls) }),
      column.display({ id: "input", header: () => t("columns.inputTokens"), meta: { numeric: true }, cell: ({ row }) => format.number(row.original.totals.inputTokens) }),
      column.display({ id: "output", header: () => t("columns.outputTokens"), meta: { numeric: true }, cell: ({ row }) => format.number(row.original.totals.outputTokens) }),
      column.display({ id: "cost", header: () => t("columns.cost"), meta: { numeric: true }, cell: ({ row }) => formatCost(row.original.totals.costMicroUsd) }),
    ],
    [format, formatCost, t],
  );
  return (
    <section aria-labelledby="usage-models-title" className="flex flex-col gap-3">
      <h2 id="usage-models-title" className="text-sm font-medium">
        {t("title")}
      </h2>
      <DataTable
        caption={t("caption")}
        captionHidden
        columns={columns}
        data={summary.byModel}
        getRowId={(row) => `${row.provider}/${row.model}`}
        stateHeadingLevel={3}
        renderCard={(row) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.model}</span>
            <span className="text-xs text-muted-foreground">{row.provider}</span>
            <span className="font-mono text-xs tabular-nums">{t("cardMeta", { calls: row.totals.calls, cost: formatCost(row.totals.costMicroUsd) })}</span>
          </div>
        )}
        empty={<EmptyState frame="plain" headingLevel={3} icon="chart" title={t("emptyTitle")} description={t("emptyDescription")} />}
      />
    </section>
  );
}

/** A month of model usage: totals, the state of both caps (in words, not only color) and the per-model breakdown. */
export function UsageSummaryPanel({ summary }: { summary: UsageSummary }) {
  return (
    <div className="flex flex-col gap-6">
      <Totals summary={summary} />
      <Budget summary={summary} />
      <Models summary={summary} />
    </div>
  );
}

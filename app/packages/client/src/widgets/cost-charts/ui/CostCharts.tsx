"use client";

import { useTranslations } from "use-intl";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { BarChartFigure } from "#/shared/ui/molecules/Chart/BarChartFigure.tsx";

/** One bar group: who spent, how much this month and against which cap (micro-USD). */
export type CostChartRow = { id: string; label: string; costMicroUsd: number; capMicroUsd: number };

export type CostChartsProps = {
  rows: readonly CostChartRow[];
  /** Total of the month as the API reports it; shown as given, never re-summed from the bars. */
  totalCostMicroUsd: number;
  /** Header of the row column ("Organização", "Modelo"). */
  rowHeader: string;
  /** Most rows drawn (highest cost first). */
  limit?: number;
};

/**
 * Cost month to date against the cap, highest cost first (SP5 spec §6–§7; used by `/admin/costs`
 * and the tenant usage page). The numbers are exactly the ones passed in: the chart's table and
 * the total line carry no arithmetic of their own beyond ordering and the row limit.
 */
export function CostCharts({ rows, totalCostMicroUsd, rowHeader, limit = 10 }: CostChartsProps) {
  const t = useTranslations("common.costCharts");
  const formatCost = useFormatMicroUsd();
  const top = [...rows].sort((a, b) => b.costMicroUsd - a.costMicroUsd).slice(0, limit);
  return (
    <section data-slot="cost-charts" className="flex flex-col gap-2">
      <BarChartFigure
        title={t("title")}
        description={
          rows.length > top.length ? t("descriptionTop", { shown: top.length, total: rows.length }) : t("description")
        }
        series={[
          { key: "cost", label: t("cost") },
          { key: "cap", label: t("cap") },
        ]}
        rows={top.map((row) => ({
          id: row.id,
          label: row.label,
          values: { cost: row.costMicroUsd, cap: row.capMicroUsd },
        }))}
        rowHeader={rowHeader}
        formatValue={(value) => formatCost(value)}
      />
      <p className="text-sm">
        {t.rich("total", {
          total: formatCost(totalCostMicroUsd),
          value: (chunks) => <span className="font-mono font-semibold tabular-nums">{chunks}</span>,
        })}
      </p>
    </section>
  );
}

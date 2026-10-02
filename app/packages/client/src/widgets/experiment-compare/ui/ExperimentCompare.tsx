"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { compareExperiments, type ScoreComparison } from "#/entities/eval-experiment/index.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { BarChartFigure } from "#/shared/ui/molecules/Chart/BarChartFigure.tsx";

export type ExperimentCompareProps = {
  /** The reference experiment. */
  a: EvalExperimentSummary;
  /** The experiment compared against it. */
  b: EvalExperimentSummary;
  /** How an experiment is named in the chart (its agent, dataset and start); defaults to its id. */
  nameOf?: ((experiment: EvalExperimentSummary) => string) | undefined;
};

const byId = (experiment: EvalExperimentSummary): string => experiment.experimentId;

const OUTCOME_KEYS = { better: "better", worse: "worse", same: "same", "only-a": "onlyA", "only-b": "onlyB" } as const;
const OUTCOME_ICONS: Record<ScoreComparison["outcome"], IconName> = { better: "circle-check", worse: "alert-triangle", same: "info", "only-a": "info", "only-b": "info" };

/**
 * Two experiments side by side (SP5 spec §8): mean score per scorer for A and B with the baseline
 * floor as bars (and as a table for assistive technology), and one sentence per scorer saying
 * whether B is better, worse or the same, with the difference in percentage points. The
 * comparison is computed here; the API has no compare endpoint.
 */
export function ExperimentCompare({ a, b, nameOf = byId }: ExperimentCompareProps) {
  const t = useTranslations("admin.evals.compare");
  const format = useFormatter();
  const rows = useMemo(() => compareExperiments(a, b), [a, b]);
  const percent = (value: number): string => format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const delta = (row: ScoreComparison): string =>
    row.a === null || row.b === null ? "" : format.number(row.b - row.a, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  return (
    <div data-slot="experiment-compare" className="flex flex-col gap-4">
      <BarChartFigure
        title={t("chartTitle")}
        description={t("chartDescription", { a: nameOf(a), b: nameOf(b) })}
        rowHeader={t("scorer")}
        formatValue={percent}
        series={[
          { key: "a", label: t("seriesA", { id: nameOf(a) }) },
          { key: "b", label: t("seriesB", { id: nameOf(b) }) },
          { key: "baseline", label: t("baseline"), color: "var(--muted-foreground)" },
        ]}
        rows={rows.map((row) => ({ id: row.scorer, label: row.scorer, values: { a: row.a, b: row.b, baseline: row.baseline } }))}
      />
      <ul aria-label={t("verdicts")} className="flex flex-col gap-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.scorer} data-outcome={row.outcome} className="flex items-start gap-2">
            <Icon name={OUTCOME_ICONS[row.outcome]} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{t(`outcome.${OUTCOME_KEYS[row.outcome]}`, { scorer: row.scorer, delta: delta(row) })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { useFormatter, useTranslations } from "use-intl";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

const STATUS_TONES: Record<EvalExperimentSummary["status"], StatusTone> = { pending: "neutral", running: "blue", completed: "emerald", failed: "danger" };
const VERDICT_TONES: Record<EvalExperimentSummary["verdict"], StatusTone> = { passed: "emerald", failed: "danger", pending: "neutral" };
const VERDICT_ICONS = { passed: "circle-check", failed: "circle-x", pending: "clock" } as const;

export function ExperimentStatusPill({ status }: { status: EvalExperimentSummary["status"] }) {
  const t = useTranslations("admin.evals.experiments.status");
  return <StatusPill tone={STATUS_TONES[status]}>{t(status)}</StatusPill>;
}

/** The gate verdict in words with an icon (never color alone). */
export function ExperimentVerdictPill({ verdict }: { verdict: EvalExperimentSummary["verdict"] }) {
  const t = useTranslations("admin.evals.experiments.verdict");
  return (
    <StatusPill tone={VERDICT_TONES[verdict]} icon={VERDICT_ICONS[verdict]}>
      {t(verdict)}
    </StatusPill>
  );
}

/** Mean per scorer with its baseline floor, as percentages in the UI locale. */
export function ExperimentScores({ experiment }: { experiment: EvalExperimentSummary }) {
  const t = useTranslations("admin.evals.experiments");
  const format = useFormatter();
  const percent = (value: number): string => format.number(value, { style: "percent", maximumFractionDigits: 1 });
  if (experiment.scores.length === 0) return <span className="text-muted-foreground">{t("noScores")}</span>;
  return (
    <ul aria-label={t("scoresOf", { id: experiment.experimentId })} className="flex flex-col gap-0.5 text-xs">
      {experiment.scores.map((score) => (
        <li key={score.scorer} className="tabular-nums">
          {score.baseline === null
            ? t("score", { scorer: score.scorer, mean: percent(score.mean) })
            : t("scoreWithBaseline", { scorer: score.scorer, mean: percent(score.mean), baseline: percent(score.baseline) })}
        </li>
      ))}
    </ul>
  );
}

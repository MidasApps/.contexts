"use client";

import type { EvalDataset, EvalExperimentSummary } from "@core/contracts";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useAgentLabel } from "#/shared/lib/labels/use-catalog-labels.ts";

export type ExperimentLabel = {
  /** "{agent} · {dataset} · {start}" — the name people tell experiments apart by. */
  readonly name: (experiment: Pick<EvalExperimentSummary, "agentId" | "datasetId" | "startedAt">) => string;
  /** The dataset's name (with its version), or its id while the datasets are unknown. */
  readonly dataset: (datasetId: string) => string;
};

/**
 * Human names for experiments, whose ids are opaque: the agent's label, the dataset's name and the
 * start time. `datasets` is the list the page already reads; without it the dataset id is used.
 */
export const useExperimentLabel = (
  datasets: readonly Pick<EvalDataset, "id" | "name">[] | undefined,
): ExperimentLabel => {
  const t = useTranslations("common.evalExperiment");
  const agentLabel = useAgentLabel();
  const formatDateTime = useFormatDateTime();
  const names = useMemo(
    () => new Map((datasets ?? []).map((dataset) => [dataset.id, dataset.name] as const)),
    [datasets],
  );
  const dataset = useCallback((datasetId: string) => names.get(datasetId) ?? datasetId, [names]);
  return useMemo(
    () => ({
      name: (experiment) =>
        t("label", {
          agent: agentLabel(experiment.agentId),
          dataset: dataset(experiment.datasetId),
          when: formatDateTime(experiment.startedAt),
        }),
      dataset,
    }),
    [t, agentLabel, dataset, formatDateTime],
  );
};

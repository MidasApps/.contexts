"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useAdminExperimentPair, useAdminExperiments, type ExperimentPage } from "#/entities/eval-experiment/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminQuerySection, numberedPagination } from "#/widgets/admin-nav/index.ts";
import { ExperimentComparisonPanel } from "#/widgets/experiment-compare/index.ts";
import type { EvalsUrl } from "../model/use-evals-url.ts";
import { ExperimentScores, ExperimentStatusPill, ExperimentVerdictPill } from "./eval-pills.tsx";

const column = dataTableColumnHelper<EvalExperimentSummary>();

function ExperimentName({ experiment }: { experiment: EvalExperimentSummary }) {
  const t = useTranslations("admin.evals.experiments");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono text-[12.5px] font-medium break-all">{experiment.experimentId}</span>
      <span className="text-[11.5px] text-muted-foreground">
        {t("agent", { id: experiment.agentId })}
        {experiment.promptVersionId === null ? null : ` · ${t("promptEval")}`}
      </span>
    </span>
  );
}

function CompareToggle({ experiment, url }: { experiment: EvalExperimentSummary; url: EvalsUrl }) {
  const t = useTranslations("admin.evals.experiments");
  const chosen = url.compare.includes(experiment.experimentId);
  return (
    <Button variant={chosen ? "secondary" : "outline"} size="sm" aria-pressed={chosen} aria-label={t("selectNamed", { id: experiment.experimentId })} onClick={() => url.toggleCompare(experiment.experimentId)}>
      {chosen ? t("selected") : t("select")}
    </Button>
  );
}

const useColumns = (url: EvalsUrl) => {
  const t = useTranslations("admin.evals.experiments");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "experiment", header: () => t("columns.experiment"), cell: ({ row }) => <ExperimentName experiment={row.original} /> }),
      column.accessor("datasetId", { header: () => t("columns.dataset"), cell: ({ getValue }) => <span className="font-mono text-[12.5px]">{getValue()}</span> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <ExperimentStatusPill status={getValue()} /> }),
      column.accessor("verdict", { header: () => t("columns.verdict"), cell: ({ getValue }) => <ExperimentVerdictPill verdict={getValue()} /> }),
      column.accessor("itemCount", { header: () => t("columns.items"), meta: { numeric: true }, cell: ({ getValue }) => format.number(getValue()) }),
      column.display({ id: "scores", header: () => t("columns.scores"), cell: ({ row }) => <ExperimentScores experiment={row.original} /> }),
      column.accessor("startedAt", { header: () => t("columns.startedAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.accessor("finishedAt", { header: () => t("columns.finishedAt"), cell: ({ getValue }) => (getValue() === null ? t("running") : formatDateTime(getValue() ?? "")) }),
      column.display({ id: "compare", header: () => t("columns.compare"), cell: ({ row }) => <CompareToggle experiment={row.original} url={url} /> }),
    ],
    [format, formatDateTime, t, url],
  );
};

/** The comparison of the two chosen experiments, from this page or read by id from another one. */
function Comparison({ experiments, url }: { experiments: readonly EvalExperimentSummary[]; url: EvalsUrl }) {
  const t = useTranslations("admin.evals.compare");
  const pair = useAdminExperimentPair(url.compare, experiments);
  const copy = { title: t("title"), hint: t("hint"), hintOne: t("hintOne"), missing: t("missing"), loading: t("loading"), clear: t("clear") };
  return <ExperimentComparisonPanel ids={url.compare} pair={pair} onClear={url.clearCompare} copy={copy} />;
}

function ExperimentsTable({ page, url, fetching }: { page: ExperimentPage; url: EvalsUrl; fetching: boolean }) {
  const t = useTranslations("admin.evals.experiments");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(url);
  return (
    <div className="flex flex-col gap-6">
      {page.data.length === 0 && url.compare.length === 0 ? null : <Comparison experiments={page.data} url={url} />}
      <DataTable
        caption={t("caption")}
        captionHidden
        columns={columns}
        data={page.data}
        getRowId={(experiment) => experiment.experimentId}
        pagination={numberedPagination(url, { hasMore: page.meta.hasMore, pending: fetching }, t("pagination"))}
        stateHeadingLevel={2}
        renderCard={(experiment) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-start justify-between gap-2">
              <ExperimentName experiment={experiment} />
              <ExperimentVerdictPill verdict={experiment.verdict} />
            </span>
            <span className="text-xs text-muted-foreground">{t("cardMeta", { items: experiment.itemCount, when: formatDateTime(experiment.startedAt) })}</span>
            <ExperimentScores experiment={experiment} />
            <span className="self-start">
              <CompareToggle experiment={experiment} url={url} />
            </span>
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={2}
            icon="activity"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button variant="secondary" onClick={() => url.setTab("datasets")}>
                {t("emptyAction")}
              </Button>
            }
          />
        }
      />
    </div>
  );
}

/** Experiments of every source (CI runs, prompt evals, tenant experiments) with the comparison. */
export function ExperimentsPanel({ url }: { url: EvalsUrl }) {
  const t = useTranslations("admin.evals.experiments");
  const experiments = useAdminExperiments(url.page);
  return (
    <AdminQuerySection query={experiments} loadingLabel={t("loading")}>
      {(page) => <ExperimentsTable page={page} url={url} fetching={experiments.isFetching} />}
    </AdminQuerySection>
  );
}

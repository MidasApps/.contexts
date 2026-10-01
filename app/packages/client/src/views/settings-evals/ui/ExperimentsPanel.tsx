"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useTenantExperiments, type ExperimentPage } from "#/entities/eval-experiment/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { ExperimentCompare } from "#/widgets/experiment-compare/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ExperimentScores, ExperimentStatusPill, ExperimentVerdictPill } from "./eval-pills.tsx";

const column = dataTableColumnHelper<EvalExperimentSummary>();

type Organization = { id: string; name: string };

/** The two experiments picked for comparison (A first); a third pick replaces B. */
type Compare = { ids: readonly string[]; toggle: (id: string) => void; clear: () => void };

const useCompare = (): Compare => {
  const [ids, setIds] = useState<readonly string[]>([]);
  const toggle = (id: string): void => setIds((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current.slice(0, 1), id]));
  return { ids, toggle, clear: () => setIds([]) };
};

function ExperimentName({ experiment }: { experiment: EvalExperimentSummary }) {
  const t = useTranslations("settings.evals.experiments");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono text-[12.5px] font-medium break-all">{experiment.experimentId}</span>
      <span className="text-[11.5px] text-muted-foreground">{t("agent", { id: experiment.agentId })}</span>
    </span>
  );
}

function CompareToggle({ experiment, compare }: { experiment: EvalExperimentSummary; compare: Compare }) {
  const t = useTranslations("settings.evals.experiments");
  const chosen = compare.ids.includes(experiment.experimentId);
  return (
    <Button
      variant={chosen ? "secondary" : "outline"}
      size="sm"
      aria-pressed={chosen}
      aria-label={t("selectNamed", { id: experiment.experimentId })}
      onClick={() => compare.toggle(experiment.experimentId)}
    >
      {chosen ? t("selected") : t("select")}
    </Button>
  );
}

const useColumns = (compare: Compare) => {
  const t = useTranslations("settings.evals.experiments");
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
      column.display({ id: "compare", header: () => t("columns.compare"), cell: ({ row }) => <CompareToggle experiment={row.original} compare={compare} /> }),
    ],
    [compare, format, formatDateTime, t],
  );
};

/** The comparison of the two chosen experiments, or what is still missing to see one. */
function Comparison({ experiments, compare }: { experiments: readonly EvalExperimentSummary[]; compare: Compare }) {
  const t = useTranslations("settings.evals.compare");
  const [a, b] = compare.ids.map((id) => experiments.find((experiment) => experiment.experimentId === id));
  // A chosen experiment can leave the page when the list is paged or refreshed.
  const stale = compare.ids.length > 0 && (a === undefined || (compare.ids.length === 2 && b === undefined));
  return (
    <section aria-labelledby="experiment-compare-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="experiment-compare-title" className="text-sm font-medium">
          {t("title")}
        </h2>
        {compare.ids.length === 0 ? null : (
          <Button variant="ghost" size="sm" onClick={compare.clear}>
            {t("clear")}
          </Button>
        )}
      </div>
      {stale ? (
        <Alert variant="warning">
          <AlertDescription>{t("missing")}</AlertDescription>
        </Alert>
      ) : a !== undefined && b !== undefined ? (
        <ExperimentCompare a={a} b={b} />
      ) : (
        <p className="text-sm text-muted-foreground">{compare.ids.length === 1 ? t("hintOne") : t("hint")}</p>
      )}
    </section>
  );
}

type Paging = { page: number; setPage: (page: number) => void; pending: boolean };

type ExperimentsTableProps = { organization: Organization; data: ExperimentPage; paging: Paging; compare: Compare; onStart: (() => void) | null };

function ExperimentsTable({ organization, data, paging, compare, onStart }: ExperimentsTableProps) {
  const t = useTranslations("settings.evals.experiments");
  const start = useTranslations("settings.evals.start");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(compare);
  const { page, setPage } = paging;
  const pagination =
    page === 1 && !data.meta.hasMore
      ? undefined
      : { hasPrevious: page > 1, hasNext: data.meta.hasMore, pending: paging.pending, onPrevious: () => setPage(page - 1), onNext: () => setPage(page + 1), label: t("pagination") };
  return (
    <div className="flex flex-col gap-8">
      <DataTable
        caption={t("caption", { organization: organization.name })}
        captionHidden
        columns={columns}
        data={data.data}
        getRowId={(experiment) => experiment.experimentId}
        pagination={pagination}
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
              <CompareToggle experiment={experiment} compare={compare} />
            </span>
          </div>
        )}
        empty={
          <EmptyState
            frame="plain"
            headingLevel={2}
            icon="activity"
            title={t("emptyTitle")}
            description={onStart === null ? t("emptyDescriptionReadOnly") : t("emptyDescription")}
            action={onStart === null ? undefined : <Button onClick={onStart}>{start("action")}</Button>}
          />
        }
      />
      {data.data.length === 0 ? null : <Comparison experiments={data.data} compare={compare} />}
    </div>
  );
}

/**
 * The organization's experiments (`GET /v1/evals/experiments`, paged by number) with scores per
 * scorer and the gate verdict, and the comparison of two of them (computed here: the API has no
 * compare endpoint). `onStart` is `null` for a viewer who cannot start one.
 */
export function ExperimentsPanel({ organization, onStart }: { organization: Organization; onStart: (() => void) | null }) {
  const t = useTranslations("settings.evals.experiments");
  const [page, setPage] = useState(1);
  const compare = useCompare();
  const experiments = useTenantExperiments(organization.id, page);
  return (
    <QuerySection query={experiments} loadingLabel={t("loading")}>
      {(data) => <ExperimentsTable organization={organization} data={data} paging={{ page, setPage, pending: experiments.isFetching }} compare={compare} onStart={onStart} />}
    </QuerySection>
  );
}

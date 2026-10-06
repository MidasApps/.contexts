"use client";

import type { EvalExperimentSummary } from "@core/contracts";
import { createContext, use, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import {
  type ExperimentLabel,
  type ExperimentPage,
  useExperimentLabel,
  useTenantDatasets,
  useTenantExperimentPair,
  useTenantExperiments,
} from "#/entities/eval-experiment/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { ExperimentComparisonPanel } from "#/widgets/experiment-compare/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ExperimentScores, ExperimentStatusPill, ExperimentVerdictPill } from "./eval-pills.tsx";

const column = dataTableColumnHelper<EvalExperimentSummary>();

type Organization = { id: string; name: string };

/** The two experiments picked for comparison (A first); a third pick replaces B. */
type Compare = { ids: readonly string[]; toggle: (id: string) => void; clear: () => void };

const useCompare = (): Compare => {
  const [ids, setIds] = useState<readonly string[]>([]);
  const toggle = (id: string): void =>
    setIds((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current.slice(0, 1), id],
    );
  return { ids, toggle, clear: () => setIds([]) };
};

// Cells read the labels from context: the column definitions must keep their identity while the
// datasets load, or TanStack remounts the cells and drops a click made meanwhile.
const LabelsContext = createContext<ExperimentLabel | null>(null);
const useLabels = (): ExperimentLabel => {
  const labels = use(LabelsContext);
  if (labels === null) throw new Error("experiment cells must render inside the experiments table");
  return labels;
};

function DatasetName({ datasetId }: { datasetId: string }) {
  return useLabels().dataset(datasetId);
}

/** The experiment by agent, dataset and start; its opaque id stays as secondary text for support. */
function ExperimentName({ experiment }: { experiment: EvalExperimentSummary }) {
  const labels = useLabels();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{labels.name(experiment)}</span>
      <span className="font-mono text-caption break-all text-muted-foreground">{experiment.experimentId}</span>
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
      column.display({
        id: "experiment",
        header: () => t("columns.experiment"),
        cell: ({ row }) => <ExperimentName experiment={row.original} />,
      }),
      column.accessor("datasetId", {
        header: () => t("columns.dataset"),
        cell: ({ getValue }) => <DatasetName datasetId={getValue()} />,
      }),
      column.accessor("status", {
        header: () => t("columns.status"),
        cell: ({ getValue }) => <ExperimentStatusPill status={getValue()} />,
      }),
      column.accessor("verdict", {
        header: () => t("columns.verdict"),
        cell: ({ getValue }) => <ExperimentVerdictPill verdict={getValue()} />,
      }),
      column.accessor("itemCount", {
        header: () => t("columns.items"),
        meta: { numeric: true },
        cell: ({ getValue }) => format.number(getValue()),
      }),
      column.display({
        id: "scores",
        header: () => t("columns.scores"),
        cell: ({ row }) => <ExperimentScores experiment={row.original} />,
      }),
      column.accessor("startedAt", {
        header: () => t("columns.startedAt"),
        cell: ({ getValue }) => formatDateTime(getValue()),
      }),
      column.accessor("finishedAt", {
        header: () => t("columns.finishedAt"),
        cell: ({ getValue }) => (getValue() === null ? t("running") : formatDateTime(getValue() ?? "")),
      }),
      column.display({
        id: "compare",
        header: () => t("columns.compare"),
        cell: ({ row }) => <CompareToggle experiment={row.original} compare={compare} />,
      }),
    ],
    [compare, format, formatDateTime, t],
  );
};

/** The comparison of the two chosen experiments; one that left the page (paged, refreshed) is read by id. */
function Comparison({
  organizationId,
  experiments,
  compare,
  labels,
}: {
  organizationId: string;
  experiments: readonly EvalExperimentSummary[];
  compare: Compare;
  labels: ExperimentLabel;
}) {
  const t = useTranslations("settings.evals.compare");
  const pair = useTenantExperimentPair(organizationId, compare.ids, experiments);
  const copy = {
    title: t("title"),
    hint: t("hint"),
    hintOne: t("hintOne"),
    missing: t("missing"),
    loading: t("loading"),
    clear: t("clear"),
  };
  return (
    <ExperimentComparisonPanel ids={compare.ids} pair={pair} onClear={compare.clear} copy={copy} nameOf={labels.name} />
  );
}

type Paging = { page: number; setPage: (page: number) => void; pending: boolean };

type ExperimentsTableProps = {
  organization: Organization;
  data: ExperimentPage;
  paging: Paging;
  compare: Compare;
  onStart: (() => void) | null;
};

function ExperimentsTable({ organization, data, paging, compare, onStart }: ExperimentsTableProps) {
  const labels = useExperimentLabel(useTenantDatasets(organization.id).data);
  const t = useTranslations("settings.evals.experiments");
  const start = useTranslations("settings.evals.start");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(compare);
  const { page, setPage } = paging;
  const pagination =
    page === 1 && !data.meta.hasMore
      ? undefined
      : {
          hasPrevious: page > 1,
          hasNext: data.meta.hasMore,
          pending: paging.pending,
          onPrevious: () => setPage(page - 1),
          onNext: () => setPage(page + 1),
          label: t("pagination"),
        };
  return (
    <div className="flex flex-col gap-6">
      {data.data.length === 0 && compare.ids.length === 0 ? null : (
        <Comparison organizationId={organization.id} experiments={data.data} compare={compare} labels={labels} />
      )}
      <LabelsContext value={labels}>
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
              <span className="text-xs text-muted-foreground">
                {t("cardMeta", { items: experiment.itemCount, when: formatDateTime(experiment.startedAt) })}
              </span>
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
      </LabelsContext>
    </div>
  );
}

/**
 * The organization's experiments (`GET /v1/evals/experiments`, paged by number) with scores per
 * scorer and the gate verdict, and the comparison of two of them above the list, from any page
 * (computed here: the API has no compare endpoint). `onStart` is `null` for a viewer who cannot
 * start one.
 */
export function ExperimentsPanel({
  organization,
  onStart,
}: {
  organization: Organization;
  onStart: (() => void) | null;
}) {
  const t = useTranslations("settings.evals.experiments");
  // The page lives in the URL (`?page=`), like the tab above it.
  const { page, setPage } = useSettingsSearch([]);
  const compare = useCompare();
  const experiments = useTenantExperiments(organization.id, page);
  return (
    <QuerySection query={experiments} loadingLabel={t("loading")}>
      {(data) => (
        <ExperimentsTable
          organization={organization}
          data={data}
          paging={{ page, setPage, pending: experiments.isFetching }}
          compare={compare}
          onStart={onStart}
        />
      )}
    </QuerySection>
  );
}

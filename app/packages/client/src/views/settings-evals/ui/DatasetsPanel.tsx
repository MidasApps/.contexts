"use client";

import type { EvalDataset } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useTenantDatasets } from "#/entities/eval-experiment/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";

const column = dataTableColumnHelper<EvalDataset>();

function DatasetName({ dataset }: { dataset: EvalDataset }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{dataset.name}</span>
      <span className="font-mono text-caption text-muted-foreground">{dataset.id}</span>
    </span>
  );
}

function Targets({ dataset }: { dataset: EvalDataset }) {
  const t = useTranslations("settings.evals.datasets");
  if (dataset.targetIds.length === 0) return <span className="text-muted-foreground">{t("noTargets")}</span>;
  return (
    <ul aria-label={t("targetsOf", { name: dataset.name })} className="flex flex-wrap gap-1">
      {dataset.targetIds.map((target) => (
        <li key={target}>
          <Badge variant="tag" className="font-mono">
            {target}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function OpenItemsButton({ dataset, onOpenItems }: { dataset: EvalDataset; onOpenItems: (datasetId: string) => void }) {
  const t = useTranslations("settings.evals.datasets");
  return (
    <Button
      variant="outline"
      size="sm"
      className="self-start"
      onClick={() => onOpenItems(dataset.id)}
      aria-label={t("openItemsNamed", { name: dataset.name })}
    >
      <Icon name="list" />
      {t("openItems")}
    </Button>
  );
}

const useColumns = (onOpenItems: (datasetId: string) => void) => {
  const t = useTranslations("settings.evals.datasets");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({
        id: "name",
        header: () => t("columns.name"),
        cell: ({ row }) => <DatasetName dataset={row.original} />,
      }),
      column.accessor("version", {
        header: () => t("columns.version"),
        meta: { numeric: true },
        cell: ({ getValue }) => format.number(getValue()),
      }),
      column.display({
        id: "targets",
        header: () => t("columns.targets"),
        cell: ({ row }) => <Targets dataset={row.original} />,
      }),
      column.accessor("createdAt", {
        header: () => t("columns.createdAt"),
        cell: ({ getValue }) => formatDateTime(getValue()),
      }),
      column.display({
        id: "items",
        header: () => t("columns.items"),
        cell: ({ row }) => <OpenItemsButton dataset={row.original} onOpenItems={onOpenItems} />,
      }),
    ],
    [format, formatDateTime, onOpenItems, t],
  );
};

type DatasetActions = {
  onSeeExperiments: () => void;
  onOpenItems: (datasetId: string) => void;
  /** `null` without `core.eval.write` (or offline). */
  onCreate: (() => void) | null;
};

type DatasetsTableProps = DatasetActions & {
  organization: { id: string; name: string };
  datasets: readonly EvalDataset[];
};

function DatasetsTable({ organization, datasets, onSeeExperiments, onOpenItems, onCreate }: DatasetsTableProps) {
  const t = useTranslations("settings.evals.datasets");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(onOpenItems);
  return (
    <DataTable
      caption={t("caption", { organization: organization.name })}
      captionHidden
      columns={columns}
      data={datasets}
      getRowId={(dataset) => dataset.id}
      stateHeadingLevel={2}
      renderCard={(dataset) => (
        <div className="flex flex-col gap-2">
          <DatasetName dataset={dataset} />
          <span className="text-xs text-muted-foreground">
            {t("cardMeta", { version: dataset.version, when: formatDateTime(dataset.createdAt) })}
          </span>
          <Targets dataset={dataset} />
          <OpenItemsButton dataset={dataset} onOpenItems={onOpenItems} />
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="database"
          title={t("emptyTitle")}
          description={onCreate === null ? t("emptyDescriptionReadOnly") : t("emptyDescription")}
          action={
            onCreate === null ? (
              <Button variant="secondary" onClick={onSeeExperiments}>
                {t("emptyAction")}
              </Button>
            ) : (
              <Button onClick={onCreate}>{t("create.action")}</Button>
            )
          }
        />
      }
    />
  );
}

/**
 * The organization's own datasets (`GET /v1/evals/datasets`): name, version and the agents they
 * evaluate, each opening its items; creating one needs core.eval.write (decision 0062).
 */
export function DatasetsPanel({
  organization,
  ...actions
}: DatasetActions & { organization: { id: string; name: string } }) {
  const t = useTranslations("settings.evals.datasets");
  const datasets = useTenantDatasets(organization.id);
  return (
    <div className="flex flex-col gap-4">
      {actions.onCreate === null ? null : (
        <Button className="self-end" onClick={actions.onCreate}>
          <Icon name="plus" />
          {t("create.action")}
        </Button>
      )}
      <QuerySection query={datasets} loadingLabel={t("loading")}>
        {(data) => <DatasetsTable organization={organization} datasets={data} {...actions} />}
      </QuerySection>
    </div>
  );
}

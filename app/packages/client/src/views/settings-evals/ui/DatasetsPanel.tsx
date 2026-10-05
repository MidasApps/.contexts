"use client";

import type { EvalDataset } from "@core/contracts";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useTenantDatasets } from "#/entities/eval-experiment/index.ts";
import { DeleteEvalDatasetDialog, RenameEvalDatasetDialog } from "#/features/manage-eval-datasets/index.ts";
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

/** The organization's rated answers land here and the runtime recreates it, so it is never changed. */
const FEEDBACK_DATASET_NAME = "feedback";

type RowActions = {
  onOpenItems: (datasetId: string) => void;
  /** `null` without core.eval.write (or offline). */
  onRename: ((dataset: EvalDataset) => void) | null;
  onDelete: ((dataset: EvalDataset) => void) | null;
};

function DatasetButtons({ dataset, actions }: { dataset: EvalDataset; actions: RowActions }) {
  const t = useTranslations("settings.evals.datasets");
  const changeable = dataset.name !== FEEDBACK_DATASET_NAME;
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.onOpenItems(dataset.id)}
        aria-label={t("openItemsNamed", { name: dataset.name })}
      >
        <Icon name="list" />
        {t("openItems")}
      </Button>
      {changeable && actions.onRename !== null ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.onRename?.(dataset)}
          aria-label={t("renameNamed", { name: dataset.name })}
        >
          <Icon name="pencil" />
          {t("rename.action")}
        </Button>
      ) : null}
      {changeable && actions.onDelete !== null ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.onDelete?.(dataset)}
          aria-label={t("deleteNamed", { name: dataset.name })}
        >
          <Icon name="trash" />
          {t("delete.action")}
        </Button>
      ) : null}
    </span>
  );
}

const useColumns = (actions: RowActions) => {
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
        cell: ({ row }) => <DatasetButtons dataset={row.original} actions={actions} />,
      }),
    ],
    [actions, format, formatDateTime, t],
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
  rowActions: RowActions;
};

function DatasetsTable({ organization, datasets, onSeeExperiments, onCreate, rowActions }: DatasetsTableProps) {
  const t = useTranslations("settings.evals.datasets");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(rowActions);
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
          <DatasetButtons dataset={dataset} actions={rowActions} />
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
 * evaluate, each opening its items; creating (decision 0062), renaming and deleting one (decision
 * 0075) need core.eval.write, and the `feedback` dataset is never renamed or deleted.
 */
export function DatasetsPanel({
  organization,
  ...actions
}: DatasetActions & { organization: { id: string; name: string } }) {
  const t = useTranslations("settings.evals.datasets");
  const datasets = useTenantDatasets(organization.id);
  const [renaming, setRenaming] = useState<EvalDataset | null>(null);
  const [deleting, setDeleting] = useState<EvalDataset | null>(null);
  const writable = actions.onCreate !== null;
  const rowActions = useMemo<RowActions>(
    () => ({
      onOpenItems: actions.onOpenItems,
      onRename: writable ? setRenaming : null,
      onDelete: writable ? setDeleting : null,
    }),
    [actions.onOpenItems, writable],
  );
  return (
    <div className="flex flex-col gap-4">
      {actions.onCreate === null ? null : (
        <Button className="self-end" onClick={actions.onCreate}>
          <Icon name="plus" />
          {t("create.action")}
        </Button>
      )}
      <QuerySection query={datasets} loadingLabel={t("loading")}>
        {(data) => <DatasetsTable organization={organization} datasets={data} rowActions={rowActions} {...actions} />}
      </QuerySection>
      <RenameEvalDatasetDialog
        organizationId={organization.id}
        dataset={renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
      />
      <DeleteEvalDatasetDialog
        organizationId={organization.id}
        dataset={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  );
}

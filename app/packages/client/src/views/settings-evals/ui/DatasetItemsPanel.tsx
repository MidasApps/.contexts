"use client";

import type { EvalDatasetItem } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { useTenantDatasetItems, useTenantDatasets, type DatasetItemPage } from "#/entities/eval-experiment/index.ts";
import { AddEvalDatasetItemDialog, DeleteEvalDatasetItemDialog } from "#/features/manage-eval-datasets/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";

const column = dataTableColumnHelper<EvalDatasetItem>();

/** How a row names its item for screen readers: the start of its input. */
const PREVIEW_LENGTH = 40;
const previewOf = (item: EvalDatasetItem): string => (item.input.length > PREVIEW_LENGTH ? `${item.input.slice(0, PREVIEW_LENGTH)}…` : item.input);

function ItemText({ text }: { text: string }) {
  return <span className="line-clamp-4 whitespace-pre-wrap break-words">{text}</span>;
}

function ExpectedOutput({ item }: { item: EvalDatasetItem }) {
  const t = useTranslations("settings.evals.items");
  return item.expectedOutput === null ? <span className="text-muted-foreground">{t("noExpectedOutput")}</span> : <ItemText text={item.expectedOutput} />;
}

function DeleteItemButton({ item, onDelete }: { item: EvalDatasetItem; onDelete: (item: EvalDatasetItem) => void }) {
  const t = useTranslations("settings.evals.items");
  return (
    <Button variant="outline" size="sm" className="self-start" onClick={() => onDelete(item)} aria-label={t("deleteNamed", { input: previewOf(item) })}>
      <Icon name="trash" />
      {t("deleteAction")}
    </Button>
  );
}

const useColumns = (onDelete: ((item: EvalDatasetItem) => void) | null) => {
  const t = useTranslations("settings.evals.items");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "input", header: () => t("columns.input"), cell: ({ row }) => <ItemText text={row.original.input} /> }),
      column.display({ id: "expectedOutput", header: () => t("columns.expectedOutput"), cell: ({ row }) => <ExpectedOutput item={row.original} /> }),
      column.accessor("createdAt", { header: () => t("columns.createdAt"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      ...(onDelete === null
        ? []
        : [column.display({ id: "actions", header: () => t("columns.actions"), cell: ({ row }) => <DeleteItemButton item={row.original} onDelete={onDelete} /> })]),
    ],
    [formatDateTime, onDelete, t],
  );
};

type Paging = { page: number; setPage: (page: number) => void; pending: boolean };
type ItemsTableProps = { datasetName: string; data: DatasetItemPage; paging: Paging; onAdd: (() => void) | null; onDelete: ((item: EvalDatasetItem) => void) | null };

function ItemsTable({ datasetName, data, paging, onAdd, onDelete }: ItemsTableProps) {
  const t = useTranslations("settings.evals.items");
  const formatDateTime = useFormatDateTime();
  const columns = useColumns(onDelete);
  const { page, setPage } = paging;
  const pagination =
    page === 1 && !data.meta.hasMore
      ? undefined
      : { hasPrevious: page > 1, hasNext: data.meta.hasMore, pending: paging.pending, onPrevious: () => setPage(page - 1), onNext: () => setPage(page + 1), label: t("pagination") };
  return (
    <DataTable
      caption={t("caption", { name: datasetName })}
      captionHidden
      columns={columns}
      data={data.data}
      getRowId={(item) => item.id}
      pagination={pagination}
      stateHeadingLevel={3}
      renderCard={(item) => (
        <div className="flex flex-col gap-2">
          <ItemText text={item.input} />
          <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
          <ExpectedOutput item={item} />
          {onDelete === null ? null : <DeleteItemButton item={item} onDelete={onDelete} />}
        </div>
      )}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={3}
          icon="list"
          title={t("emptyTitle")}
          description={onAdd === null ? t("emptyDescriptionReadOnly") : t("emptyDescription")}
          action={onAdd === null ? undefined : <Button onClick={onAdd}>{t("add.action")}</Button>}
        />
      }
    />
  );
}

export type DatasetItemsPanelProps = {
  organization: { id: string; name: string };
  datasetId: string;
  /** `core.eval.write` and online: may add and delete items. */
  canWrite: boolean;
  onBack: () => void;
};

/**
 * The items of one of the organization's datasets (`GET /v1/evals/datasets/{id}/items`, decision
 * 0062), paged by number in the URL, with adding a manual item and deleting one (core.eval.write).
 */
export function DatasetItemsPanel({ organization, datasetId, canWrite, onBack }: DatasetItemsPanelProps) {
  const t = useTranslations("settings.evals.items");
  const { page, setPage } = useSettingsSearch([]);
  const items = useTenantDatasetItems(organization.id, datasetId, page);
  // The name comes from the list the previous tab already loaded; a stale link shows the id.
  const datasetName = useTenantDatasets(organization.id).data?.find((dataset) => dataset.id === datasetId)?.name ?? datasetId;
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EvalDatasetItem | null>(null);
  const onAdd = canWrite ? () => setAdding(true) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
            <Icon name="arrow-left" />
            {t("back")}
          </Button>
          <h2 className="text-heading-sm font-semibold">
            {t("title", { name: datasetName })}
          </h2>
        </div>
        {onAdd === null ? null : (
          <Button onClick={onAdd}>
            <Icon name="plus" />
            {t("add.action")}
          </Button>
        )}
      </div>
      <QuerySection query={items} loadingLabel={t("loading")}>
        {(data) => <ItemsTable datasetName={datasetName} data={data} paging={{ page, setPage, pending: items.isFetching }} onAdd={onAdd} onDelete={canWrite ? setDeleting : null} />}
      </QuerySection>
      {canWrite ? (
        <>
          <AddEvalDatasetItemDialog organizationId={organization.id} dataset={{ id: datasetId, name: datasetName }} open={adding} onOpenChange={setAdding} />
          <DeleteEvalDatasetItemDialog organizationId={organization.id} item={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
        </>
      ) : null}
    </div>
  );
}

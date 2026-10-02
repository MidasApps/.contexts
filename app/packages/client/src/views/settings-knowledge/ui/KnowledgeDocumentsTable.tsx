"use client";

import type { KnowledgeDocument } from "@core/contracts";
import { useMemo, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { collectionOfNamespace, isOwnCollection, KNOWLEDGE_PAGE_LIMIT, KnowledgeStatusPill, type useKnowledgeDocuments } from "#/entities/knowledge/index.ts";
import { ApiError } from "#/shared/api/api-error.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useModuleLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { DataTable, type DataTableStatus } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

const column = dataTableColumnHelper<KnowledgeDocument>();

/** What the list calls a document: its title, else where it came from. */
export const documentName = (document: KnowledgeDocument): string => (document.title === null || document.title === "" ? (document.sourceUrl ?? document.sourceRef) : document.title);

/**
 * Display name of a namespace: the organization, a project by name, platform or module content
 * (the module by its manifest label). A project missing from a complete list was removed; one
 * missing from a partial list is named generically, never by its id.
 */
export const useCollectionName = (projectNames: ReadonlyMap<string, string>, projectsComplete: boolean): ((namespace: string) => string) => {
  const t = useTranslations("settings.knowledge.collections");
  const moduleLabel = useModuleLabel();
  return (namespace) => {
    const collection = collectionOfNamespace(namespace);
    if (collection.kind === "project") {
      const name = projectNames.get(collection.projectId);
      if (name !== undefined) return t("project", { name });
      return t(projectsComplete ? "projectRemoved" : "projectUnknown");
    }
    if (collection.kind === "module") return t("module", { name: moduleLabel(collection.moduleId) });
    return t(collection.kind);
  };
};

const statusOf = (query: ReturnType<typeof useKnowledgeDocuments>): DataTableStatus => {
  if (query.isPending) return { kind: "loading" };
  if (query.isError) return { kind: "error", requestId: query.error instanceof ApiError ? query.error.requestId : undefined, onRetry: () => void query.refetch() };
  return { kind: "ready" };
};

function DeleteAction({ document, onDelete }: { document: KnowledgeDocument; onDelete: ((document: KnowledgeDocument) => void) | null }) {
  const t = useTranslations("settings.knowledge");
  if (onDelete === null || !isOwnCollection(collectionOfNamespace(document.namespace))) return null;
  return (
    <Button variant="outline" size="sm" className="self-start" onClick={() => onDelete(document)} aria-label={t("deleteNamed", { name: documentName(document) })}>
      {t("deleteAction")}
    </Button>
  );
}

export type KnowledgeDocumentsTableProps = {
  caption: string;
  documents: ReturnType<typeof useKnowledgeDocuments>;
  collectionName: (namespace: string) => string;
  /** `null` when the viewer cannot delete (or is offline); platform and module content is never deletable. */
  onDelete: ((document: KnowledgeDocument) => void) | null;
  empty: ReactNode;
};

/** The documents of the knowledge base: title, source, collection, indexing status and when they were added. */
export function KnowledgeDocumentsTable({ caption, documents, collectionName, onDelete, empty }: KnowledgeDocumentsTableProps) {
  const t = useTranslations("settings.knowledge");
  const formatDateTime = useFormatDateTime();
  const paged = useCursorPages(documents, KNOWLEDGE_PAGE_LIMIT, t("pagination"));
  const columns = useMemo(
    () => [
      column.display({ id: "title", header: () => t("columns.title"), cell: ({ row }) => <span className="font-medium break-all">{documentName(row.original)}</span> }),
      column.accessor("source", { header: () => t("columns.source"), cell: ({ getValue }) => t(`sources.${getValue()}`) }),
      column.accessor("namespace", { header: () => t("columns.collection"), cell: ({ getValue }) => collectionName(getValue()) }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <KnowledgeStatusPill status={getValue()} /> }),
      column.accessor("createdAt", { header: () => t("columns.added"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <DeleteAction document={row.original} onDelete={onDelete} /> }),
    ],
    [collectionName, formatDateTime, onDelete, t],
  );
  return (
    <DataTable
      caption={caption}
      captionHidden
      columns={columns}
      data={paged.rows}
      getRowId={(document) => document.id}
      status={statusOf(documents)}
      pagination={paged.pagination}
      stateHeadingLevel={2}
      renderCard={(document) => (
        <div className="flex flex-col gap-2">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium break-all">{documentName(document)}</span>
            <KnowledgeStatusPill status={document.status} />
          </span>
          <span className="text-[13px]">{collectionName(document.namespace)}</span>
          <span className="text-xs text-muted-foreground">{t("cardMeta", { source: t(`sources.${document.source}`), date: formatDateTime(document.createdAt, "date") })}</span>
          <DeleteAction document={document} onDelete={onDelete} />
        </div>
      )}
      empty={empty}
    />
  );
}

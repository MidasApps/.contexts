"use client";

import { useTable, type RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { useIsMobile } from "#/shared/lib/media/use-media-query.ts";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "#/shared/ui/atoms/Table/Table.tsx";
import { ErrorState } from "#/shared/ui/molecules/ErrorState/ErrorState.tsx";
import { dataTableFeatures, type DataTableColumn, type DataTableFeatures } from "./data-table-columns.ts";
import { DataTablePagination, type DataTablePaginationProps } from "./DataTablePagination.tsx";

export type DataTableStatus =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; requestId?: string | undefined; onRetry?: (() => void) | undefined };

export type DataTableProps<TData extends RowData> = {
  /** Required table name (rules/accessibility.md: every data table has a caption). */
  caption: string;
  /** Hide the caption visually when a heading above already says it. */
  captionHidden?: boolean;
  columns: ReadonlyArray<DataTableColumn<TData>>;
  data: ReadonlyArray<TData>;
  getRowId: (row: TData) => string;
  status?: DataTableStatus;
  /** Shown instead of the body when the page has no rows (usually an `EmptyState` with frame="plain"). */
  empty: ReactNode;
  /** Cursor paging driven by `meta.page` (omit when the list is not paged). */
  pagination?: DataTablePaginationProps | undefined;
  /**
   * Card for one row below `md` (768 px): the table becomes a labelled list of cards so rows stay
   * readable without horizontal scrolling (breakpoints.html). Omit to keep the scrolling table.
   */
  renderCard?: ((row: TData) => ReactNode) | undefined;
  /** Heading level of the error state: 2 when the table sits right under the page `h1`, 3 inside a section (default). */
  stateHeadingLevel?: 2 | 3;
  /** Skeleton rows while loading. */
  loadingRows?: number;
  className?: string;
};

type Instance<TData extends RowData> = ReturnType<typeof useTable<DataTableFeatures, TData>>;

const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6"] as const;

function SkeletonRows({ rows, columnIds }: { rows: number; columnIds: string[] }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
      {columnIds.map((columnId, columnIndex) => (
        <TableCell key={columnId}>
          <Skeleton className={cn("h-4", SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length])} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function DataRows<TData extends RowData>({ table, empty, columnCount }: { table: Instance<TData>; empty: ReactNode; columnCount: number }) {
  const rows = table.getRowModel().rows;
  if (rows.length === 0) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columnCount} className="p-0">
          {empty}
        </TableCell>
      </TableRow>
    );
  }
  return rows.map((row) => (
    <TableRow key={row.id}>
      {row.getAllCells().map((cell) => (
        <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.numeric === true && "text-right font-mono tabular-nums")}>
          <table.FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function HeaderRows<TData extends RowData>({ table }: { table: Instance<TData> }) {
  return table.getHeaderGroups().map((headerGroup) => (
    <TableRow key={headerGroup.id} className="hover:bg-transparent">
      {headerGroup.headers.map((header) => {
        const meta = header.column.columnDef.meta;
        return (
          <TableHead key={header.id} colSpan={header.colSpan} className={cn(meta?.numeric === true && "text-right")}>
            {header.isPlaceholder ? null : (
              <span className={cn(meta?.headerHidden === true && "sr-only")}>
                <table.FlexRender header={header} />
              </span>
            )}
          </TableHead>
        );
      })}
    </TableRow>
  ));
}

type CardListProps<TData extends RowData> = {
  caption: string;
  captionHidden: boolean;
  data: ReadonlyArray<TData>;
  getRowId: (row: TData) => string;
  renderCard: (row: TData) => ReactNode;
  status: DataTableStatus;
  empty: ReactNode;
  loadingRows: number;
  headingLevel: 2 | 3;
};

/** The mobile form of the table: caption as a heading-less label, one card per row. */
function CardList<TData extends RowData>({ caption, captionHidden, data, getRowId, renderCard, status, empty, loadingRows, headingLevel }: CardListProps<TData>) {
  const t = useTranslations("common.states");
  if (status.kind === "error") return <ErrorState frame="plain" headingLevel={headingLevel} requestId={status.requestId} onRetry={status.onRetry} />;
  if (status.kind === "loading") {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t("loading")}</span>
        {Array.from({ length: Math.min(loadingRows, 3) }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <>
      <p className={cn("text-sm font-medium", captionHidden && "sr-only")}>{caption}</p>
      {data.length === 0 ? (
        empty
      ) : (
        <ul aria-label={caption} className="flex flex-col gap-2">
          {data.map((row) => (
            <li key={getRowId(row)} className="rounded-lg border border-border bg-card p-3">
              {renderCard(row)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * List organism over TanStack Table v9 (server-driven: no client sorting/filtering). Caption and
 * `scope="col"` headers always; loading keeps the header and shows skeleton rows (`aria-busy`
 * with a status text); errors render `ErrorState` with the request reference; empty pages render
 * the caller's empty state; paging is previous/next over cursors. With `renderCard`, small
 * screens get a card list instead of the table.
 */
export function DataTable<TData extends RowData>({
  caption,
  captionHidden = false,
  columns,
  data,
  getRowId,
  status = { kind: "ready" },
  empty,
  pagination,
  renderCard,
  stateHeadingLevel: headingLevel = 3,
  loadingRows = 5,
  className,
}: DataTableProps<TData>) {
  const t = useTranslations("common.states");
  const mobile = useIsMobile();
  const table = useTable({ features: dataTableFeatures, columns: [...columns], data, getRowId: (row) => getRowId(row) });
  const columnIds = table.getAllLeafColumns().map((column) => column.id);
  const busy = status.kind === "loading";
  if (mobile && renderCard !== undefined) {
    return (
      <div data-slot="data-table" data-layout="cards" className={cn("flex flex-col gap-3", className)}>
        <CardList caption={caption} captionHidden={captionHidden} data={data} getRowId={getRowId} renderCard={renderCard} status={status} empty={empty} loadingRows={loadingRows} headingLevel={headingLevel} />
        {pagination === undefined || status.kind === "error" ? null : <DataTablePagination {...pagination} />}
      </div>
    );
  }
  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      <Table scrollLabel={caption} aria-busy={busy || undefined}>
        <TableCaption className={cn(captionHidden && "sr-only")}>{caption}</TableCaption>
        <TableHeader>
          <HeaderRows table={table} />
        </TableHeader>
        <TableBody>
          {status.kind === "error" ? null : busy ? (
            <SkeletonRows rows={loadingRows} columnIds={columnIds} />
          ) : (
            <DataRows table={table} empty={empty} columnCount={columnIds.length} />
          )}
        </TableBody>
      </Table>
      {busy ? (
        <p role="status" className="sr-only">
          {t("loading")}
        </p>
      ) : null}
      {status.kind === "error" ? <ErrorState frame="plain" headingLevel={headingLevel} requestId={status.requestId} onRetry={status.onRetry} /> : null}
      {pagination === undefined || status.kind === "error" ? null : <DataTablePagination {...pagination} />}
    </div>
  );
}

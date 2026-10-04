import { type ColumnDef, createColumnHelper, type RowData, tableFeatures } from "@tanstack/react-table";

/** Per-column presentation hints read by `DataTable`. */
export type DataTableColumnMeta = {
  /** Numbers, money, IDs: mono tabular digits aligned to the end (DESIGN.md "Mono para precisão"). */
  numeric?: boolean;
  /** Visually hidden header text (action columns still need a header for screen readers). */
  headerHidden?: boolean;
};

// Type-only slot: TanStack reads the type of `columnMeta` and strips the value at runtime.
const columnMeta: DataTableColumnMeta = {};

/**
 * TanStack Table v9 feature set of the DataTable: core row model only. Sorting/filtering happen
 * on the server (`/v1` cursor pages, `contracts/api.md` §9–10), so no client row models.
 */
export const dataTableFeatures = tableFeatures({ columnMeta });

export type DataTableFeatures = typeof dataTableFeatures;

// `any` value type as in TanStack's own docs: a column list mixes value types per column.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

/**
 * Typed column helper bound to the DataTable features.
 *
 * @example
 *   const column = dataTableColumnHelper<Member>();
 *   const columns = [column.accessor("name", { header: () => t("name") })];
 */
export const dataTableColumnHelper = <TData extends RowData>() => createColumnHelper<DataTableFeatures, TData>();

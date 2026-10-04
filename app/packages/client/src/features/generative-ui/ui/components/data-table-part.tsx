"use client";

import type { DataTableProps } from "@core/contracts";
import { useMemo } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useFormatMoney } from "#/shared/lib/format/use-format-money.ts";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

type Column = DataTableProps["columns"][number];
type Row = { readonly index: number; readonly values: Readonly<Record<string, unknown>> };

const column = dataTableColumnHelper<Row>();
const EMPTY = "—";

const isMoney = (value: unknown): value is { amountMinor: number; currency: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { amountMinor?: unknown }).amountMinor === "number" &&
  typeof (value as { currency?: unknown }).currency === "string";

const asText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value) ?? EMPTY;
};

/** Cell formatters by column type; a value of another shape is shown as text, never dropped. */
const useCellFormat = () => {
  const t = useTranslations("chat.ui.table");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  const formatMoney = useFormatMoney();
  return (type: Column["type"], value: unknown): string => {
    if (value === null || value === undefined || value === "") return EMPTY;
    if (type === "number" && typeof value === "number") return format.number(value);
    if (type === "boolean" && typeof value === "boolean") return value ? t("yes") : t("no");
    if (type === "money" && isMoney(value)) return formatMoney(value);
    if ((type === "date" || type === "datetime") && typeof value === "string" && !Number.isNaN(Date.parse(value)))
      return formatDateTime(value, type);
    return asText(value);
  };
};

/**
 * `data-table` (SP4 spec §5.2): read-only rows a tool returned, in the SP2 `DataTable` (caption,
 * column headers, numbers in mono tabular digits). Cells are text — nothing in a row is
 * rendered as markup. `truncated` says that more rows exist than are shown.
 */
export function DataTablePart({ props }: GenerativeComponentProps<DataTableProps>) {
  const t = useTranslations("chat.ui.table");
  const tRoot = useTranslations();
  const formatCell = useCellFormat();
  const rows = useMemo(() => props.rows.map((values, index): Row => ({ index, values })), [props.rows]);
  const columns = props.columns.map((definition) =>
    column.accessor((row) => row.values[definition.key], {
      id: definition.key,
      header: () =>
        definition.labelKey !== undefined && tRoot.has(definition.labelKey as never)
          ? tRoot(definition.labelKey as never)
          : (definition.label ?? definition.key),
      cell: (cell) => formatCell(definition.type, cell.getValue()),
      meta: { numeric: definition.type === "number" || definition.type === "money" },
    }),
  );
  return (
    <div data-slot="data-table-part" className="flex flex-col gap-2">
      <DataTable
        caption={t("caption")}
        captionHidden
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.index)}
        empty={<p className="p-4 text-center text-body text-muted-foreground">{t("empty")}</p>}
      />
      {props.truncated ? (
        <p className="text-body-sm text-muted-foreground">{t("truncated", { count: props.rows.length })}</p>
      ) : null}
    </div>
  );
}

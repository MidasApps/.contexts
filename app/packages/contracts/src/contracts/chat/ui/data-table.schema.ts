import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { none, personal } from "../../field-docs.ts";

export const MAX_TABLE_ROWS = 500;

const ColumnSchema = z.strictObject({
  key: z.string().min(1).max(100).meta(none("Row key of the column.")),
  labelKey: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .meta(none("i18n key of the header; `label`, then the key itself, otherwise.")),
  label: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .meta(none("Header written in the conversation's language, for columns without a catalog key.")),
  type: z.enum(["text", "number", "date", "datetime", "boolean", "money"]).meta(none("How cells are formatted.")),
});

/** Props of `data-table` (SP4 spec §5.2): read-only rows shown with the SP2 `DataTable`. */
export const DataTablePropsSchema = z.strictObject({
  columns: z.array(ColumnSchema).min(1).max(50).meta(none("Columns in display order.")),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .max(MAX_TABLE_ROWS)
    .meta(personal("Rows; may hold records of people.")),
  truncated: z.boolean().meta(none("Whether more rows exist than shown.")),
});
export type DataTableProps = z.infer<typeof DataTablePropsSchema>;

export const DataTablePropsContract = defineContract(DataTablePropsSchema, {
  id: "chat.DataTableProps",
  kind: "ui-component",
  description: "A read-only table of records an agent tool returned.",
  examples: [
    {
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "units", labelKey: "table.units", type: "number" },
      ],
      rows: [{ name: "North", units: 12 }],
      truncated: false,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});

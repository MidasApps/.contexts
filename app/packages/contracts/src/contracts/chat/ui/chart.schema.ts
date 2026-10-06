import { z } from "zod";
import { defineContract } from "../../contract.ts";
import { none, personal } from "../../field-docs.ts";

const SeriesSchema = z.strictObject({
  key: z.string().min(1).max(100).meta(none("Row key of the values.")),
  label: z.string().min(1).max(100).meta(none("Legend label.")),
});

/** Props of `chart` (SP4 spec §5.2): a shadcn chart over tool rows. */
export const ChartPropsSchema = z.strictObject({
  kind: z.enum(["bar", "line", "area", "pie"]).meta(none("Chart type.")),
  x: z.string().min(1).max(100).meta(none("Row key of the category or time axis.")),
  xLabel: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .meta(none("Header of the category or time axis, in the conversation's language; the key itself otherwise.")),
  series: z.array(SeriesSchema).min(1).max(10).meta(none("Plotted series.")),
  rows: z.array(z.record(z.string(), z.unknown())).max(1000).meta(personal("Data rows.")),
});
export type ChartProps = z.infer<typeof ChartPropsSchema>;

export const ChartPropsContract = defineContract(ChartPropsSchema, {
  id: "chat.ChartProps",
  kind: "ui-component",
  description: "A bar, line, area or pie chart of rows an agent tool returned.",
  examples: [
    {
      kind: "bar",
      x: "month",
      xLabel: "Month",
      series: [{ key: "total", label: "Total" }],
      rows: [{ month: "2026-08", total: 42 }],
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});

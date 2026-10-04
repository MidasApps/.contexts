"use client";

import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "#/shared/lib/cn.ts";

/** Series colors come from the theme tokens (`--chart-1…5` = status accents, light and dark). */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export type BarChartSeries = {
  /** Key of the series in each row's `values`. */
  key: string;
  /** Translated name (legend, tooltip, table header). */
  label: string;
  /** A token color; defaults to `CHART_COLORS` by position. */
  color?: string;
};

export type BarChartRow = { id: string; label: string; values: Readonly<Record<string, number | null>> };

export type BarChartFigureProps = {
  /** Visible title of the figure (also names the data table). */
  title: string;
  description?: string | undefined;
  series: readonly BarChartSeries[];
  rows: readonly BarChartRow[];
  /** Header of the first table column (what a row is: "Organização", "Avaliador"). */
  rowHeader: string;
  /** Formats a value for the axis, the tooltip and the table (money, percent). */
  formatValue: (value: number) => string;
  /** Text of a missing value in the table. */
  emptyValue?: string;
  className?: string;
};

const colorOf = (series: BarChartSeries, index: number): string =>
  series.color ?? CHART_COLORS[index % CHART_COLORS.length] ?? "var(--chart-1)";

/** Heading-less legend: a swatch and the series name; the swatch is decorative. */
function Legend({ series }: { series: readonly BarChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((item, index) => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-xs" style={{ background: colorOf(item, index) }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Grouped bar chart in the shadcn chart pattern (recharts, decision 0042) with the design system's
 * rules (dataviz.html): token colors, mono tabular numbers, no decorative grid beyond hairlines.
 * The drawing is hidden from assistive technology; the same numbers follow in a real table
 * (visually hidden), so screen readers, tests and "no color only" all read the data itself.
 */
export function BarChartFigure({
  title,
  description,
  series,
  rows,
  rowHeader,
  formatValue,
  emptyValue = "—",
  className,
}: BarChartFigureProps) {
  const data = rows.map((row) => ({ label: row.label, ...row.values }));
  const tooltipStyle: CSSProperties = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 12,
  };
  return (
    <figure
      data-slot="bar-chart"
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}
    >
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description === undefined ? null : <span className="text-xs text-muted-foreground">{description}</span>}
      </figcaption>
      <div aria-hidden="true" className="h-64 w-full font-mono text-label tabular-nums">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 256 }}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tick={{ fill: "var(--muted-foreground)" }}
              tickFormatter={(value: number) => formatValue(value)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={tooltipStyle}
              formatter={(value) => (typeof value === "number" ? formatValue(value) : String(value))}
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                fill={colorOf(item, index)}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend series={series} />
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {series.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {series.map((item) => {
                const value = row.values[item.key];
                return (
                  <td key={item.key}>{value === null || value === undefined ? emptyValue : formatValue(value)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

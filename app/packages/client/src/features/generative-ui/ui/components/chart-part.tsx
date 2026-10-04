"use client";

import type { ChartProps } from "@core/contracts";
import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatter, useTranslations } from "use-intl";
import { CHART_COLORS } from "#/shared/ui/molecules/Chart/BarChartFigure.tsx";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

type Point = { readonly label: string; readonly values: Readonly<Record<string, number | null>> };

const colorAt = (index: number): string => CHART_COLORS[index % CHART_COLORS.length] ?? "var(--chart-1)";

const numberOf = (value: unknown): number | null => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const labelOf = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "—";

const pointsOf = (props: ChartProps): Point[] =>
  props.rows.map((row) => ({
    label: labelOf(row[props.x]),
    values: Object.fromEntries(props.series.map((series) => [series.key, numberOf(row[series.key])])),
  }));

const AXIS_TICK = { fill: "var(--muted-foreground)" } as const;
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

const cartesian = (
  props: ChartProps,
  data: readonly Record<string, unknown>[],
  formatValue: (value: number) => string,
): ReactElement => {
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={56}
        tick={AXIS_TICK}
        tickFormatter={(value: number) => formatValue(value)}
      />
      <Tooltip
        cursor={{ fill: "var(--muted)" }}
        contentStyle={TOOLTIP_STYLE}
        formatter={(value) => (typeof value === "number" ? formatValue(value) : String(value))}
      />
    </>
  );
  const common = {
    data: [...data],
    margin: { top: 4, right: 4, bottom: 0, left: 4 },
    accessibilityLayer: false,
  } as const;
  if (props.kind === "line") {
    return (
      <LineChart {...common}>
        {axes}
        {props.series.map((series, index) => (
          <Line
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stroke={colorAt(index)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }
  if (props.kind === "area") {
    return (
      <AreaChart {...common}>
        {axes}
        {props.series.map((series, index) => (
          <Area
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stroke={colorAt(index)}
            fill={colorAt(index)}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  }
  return (
    <BarChart {...common}>
      {axes}
      {props.series.map((series, index) => (
        <Bar
          key={series.key}
          dataKey={series.key}
          name={series.label}
          fill={colorAt(index)}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
};

/** A pie shows the first series: one slice per row. */
const pie = (
  props: ChartProps,
  data: readonly Record<string, unknown>[],
  formatValue: (value: number) => string,
): ReactElement => (
  <PieChart accessibilityLayer={false}>
    <Tooltip
      contentStyle={TOOLTIP_STYLE}
      formatter={(value) => (typeof value === "number" ? formatValue(value) : String(value))}
    />
    <Pie
      data={[...data]}
      dataKey={props.series[0]?.key ?? ""}
      nameKey="label"
      innerRadius="45%"
      outerRadius="80%"
      stroke="var(--card)"
      isAnimationActive={false}
    >
      {data.map((_, index) => (
        <Cell key={index} fill={colorAt(index)} />
      ))}
    </Pie>
  </PieChart>
);

/**
 * `chart` (SP4 spec §5.2): bar, line, area or pie over the rows a tool returned, in the shadcn
 * chart pattern (recharts, token colours, dataviz.html). The drawing is hidden from assistive
 * technology; the same numbers follow in a real table, so the data never depends on colour or
 * sight. Loaded lazily: recharts is heavy and most conversations never draw a chart.
 */
export function ChartPart({ props }: GenerativeComponentProps<ChartProps>) {
  const t = useTranslations("chat.ui.chart");
  const format = useFormatter();
  const formatValue = (value: number): string => format.number(value, { maximumFractionDigits: 2 });
  const points = pointsOf(props);
  const data = points.map((point) => ({ label: point.label, ...point.values }));
  const shownSeries = props.kind === "pie" ? props.series.slice(0, 1) : props.series;
  const title = t("label", {
    kind: t(`kinds.${props.kind}`),
    series: shownSeries.map((series) => series.label).join(", "),
  });
  return (
    <figure
      data-slot="chart-part"
      data-kind={props.kind}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <figcaption className="text-body font-medium text-foreground">{title}</figcaption>
      <div aria-hidden="true" className="h-56 w-full font-mono text-label tabular-nums">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 224 }}>
          {props.kind === "pie" ? pie(props, data, formatValue) : cartesian(props, data, formatValue)}
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(props.kind === "pie" ? points.map((point) => point.label) : shownSeries.map((series) => series.label)).map(
          (label, index) => (
            <li key={`${label}-${index}`} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-xs" style={{ background: colorAt(index) }} />
              {label}
            </li>
          ),
        )}
      </ul>
      <table className="sr-only">
        <caption>{t("data")}</caption>
        <thead>
          <tr>
            <th scope="col">{props.xLabel ?? props.x}</th>
            {shownSeries.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={index}>
              <th scope="row">{point.label}</th>
              {shownSeries.map((series) => {
                const value = point.values[series.key];
                return <td key={series.key}>{value === null || value === undefined ? "—" : formatValue(value)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

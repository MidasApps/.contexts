'use client';

import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import { formatNumber } from '@/shared/lib/format';
import { valueContent } from '@/pages/explore/ui/blocks/SeriesTooltip';
import { ChartSizer } from './ChartSizer';

export interface DonutSlice {
  name: string;
  value: number;
  fill: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  height?: number | string;
  tooltipFormatter?: (value: number) => string;
}

export function DonutChartComponent({ data, height = '100%', tooltipFormatter }: DonutChartProps) {
  return (
    <ChartSizer height={height}>
      {(w, h) => {
        const r = Math.min(w, h);
        return (
          <PieChart width={w} height={h}>
            <Pie
              data={data}
              cx={w / 2}
              cy={h / 2}
              innerRadius={r * 0.30}
              outerRadius={r * 0.44}
              dataKey="value"
              strokeWidth={0}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={data[i].fill} />
              ))}
            </Pie>
            {/* Nome da fatia em cima, valor embaixo, participação como apoio.
                O `formatter` devolvendo `[valor, '']` fazia o Recharts imprimir
                o separador com o nome vazio: todo tooltip da rosca abria com um
                `": "` solto — e nunca dizia de que fatia era o número. */}
            <Tooltip
              {...CHART_TOOLTIP_STYLE}
              content={valueContent({
                itemName: (p) => String(p.payload?.[0]?.name ?? ''),
                itemValue: (p) => {
                  const v = Number(p.payload?.[0]?.value ?? Number.NaN);
                  if (!Number.isFinite(v)) return null;
                  return tooltipFormatter ? tooltipFormatter(v) : formatNumber(v);
                },
                details: (p) => {
                  const v = Number(p.payload?.[0]?.value ?? 0);
                  const total = data.reduce((s, f) => s + f.value, 0);
                  return total > 0 ? [`${formatNumber((v / total) * 100, 1)}% do total`] : [];
                },
              })}
            />
          </PieChart>
        );
      }}
    </ChartSizer>
  );
}

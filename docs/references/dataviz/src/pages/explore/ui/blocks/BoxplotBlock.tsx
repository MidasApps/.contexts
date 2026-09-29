'use client';

import {
  ComposedChart, Bar, Scatter, ErrorBar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import {
  CHART_COLORS, CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_TOOLTIP_STYLE, CHART_INK_CLASS,
} from '@/shared/config/chart-theme';
import { cn } from '@/shared/lib/utils';
import type { BoxplotBlock as BoxplotBlockType } from '@/shared/config/agents/types';
import { formattedValue, compactValue } from './formatted-value';
import { axisDomain } from './axis-domain';

/**
 * Dispersão por grupo — mediana, quartis e extremos.
 *
 * Uma carteira com LTV médio de 68% pode ser homogênea ou ter metade acima de
 * 85%: a média não distingue, e o histograma mostra um grupo por vez. Este é o
 * bloco que compara a FORMA de vários grupos.
 *
 * ⚠️ **O Recharts não tem boxplot.** Este é montado com o que ele tem: uma
 * barra invisível até o primeiro quartil, a caixa empilhada por cima até o
 * terceiro, `ErrorBar` para os bigodes e forma customizada para a mediana.
 * Funciona e é o bloco mais frágil do conjunto — mudança de layout da
 * biblioteca mexe nele antes de mexer em qualquer outro.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseProps = any;

/** Traço horizontal centrado no ponto: `Scatter` não tem `shape="line"`. */
function MedianMark(props: LooseProps) {
  const { cx, cy } = props as { cx?: number; cy?: number };
  if (cx === undefined || cy === undefined) return null;
  return (
    <line
      x1={cx - 16} x2={cx + 16} y1={cy} y2={cy}
      stroke={CHART_COLORS.secondary} strokeWidth={2.5}
    />
  );
}

export function BoxplotBlock({
  block,
  height = '100%',
}: {
  block: BoxplotBlockType;
  height?: number | string;
}) {
  const grupos = block.grupos ?? [];
  const format = (v: number) => formattedValue(v, block.format, block.decimals);

  /*
   * Um bigode em cada barra da pilha — e é obrigatório que seja assim.
   *
   * O `ErrorBar` se ancora no TOPO do segmento em que vive, não no valor do
   * dado. Com os dois bigodes na mesma barra (a caixa, topo = q3) o inferior
   * descia a partir do q3 e parava no meio do caminho: a haste cruzava a caixa
   * e a ponta não chegava ao mínimo — o gráfico exibia um mínimo que não era o
   * mínimo. Na base (topo = q1) o inferior nasce onde deve.
   */
  const data = grupos.map((g) => ({
    ...g,
    base: g.q1,
    caixa: g.q3 - g.q1,
    // `[distância abaixo, distância acima]` a partir da âncora.
    bigodeInferior: [g.q1 - g.min, 0] as [number, number],
    bigodeSuperior: [0, g.max - g.q3] as [number, number],
  }));

  const axis = { ...CHART_AXIS_STYLE, tickLine: false as const, axisLine: false as const };

  /*
   * O eixo NÃO parte do zero.
   *
   * Numa barra a área é a mensagem e cortar o zero mente sobre a proporção.
   * Aqui a mensagem é a DISPERSÃO, e um LTV que vai de 31% a 95% desenhado
   * contra um eixo de 0 a 100 empurra as quatro caixas para a metade de cima do
   * card — comprimindo justamente a diferença que o bloco existe para mostrar.
   */
  const extremes = grupos.flatMap((g) => [g.min, g.max]);
  const domain = axisDomain(
    extremes.length ? Math.min(...extremes) : 0,
    extremes.length ? Math.max(...extremes) : 0,
  );

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          <ComposedChart width={w} height={h} data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis dataKey="grupo" {...axis} />
            <YAxis
              {...axis} domain={domain} allowDataOverflow
              tickFormatter={(v: number) => compactValue(v, block.format, block.decimals)}
            />
            <Tooltip
              {...({
                ...CHART_TOOLTIP_STYLE,
                content: ({ active, payload }: LooseProps) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof data[number];
                  return (
                    <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                      <div style={CHART_TOOLTIP_STYLE.labelStyle}>{d.grupo}</div>
                      <div>{`mediana ${format(d.mediana)}`}</div>
                      <div>{`q1 ${format(d.q1)} · q3 ${format(d.q3)}`}</div>
                      <div>{`mín ${format(d.min)} · máx ${format(d.max)}`}</div>
                    </div>
                  );
                },
              } as LooseProps)}
            />
            {/* A base é o vão até o primeiro quartil — invisível, só empurra. */}
            <Bar dataKey="base" stackId="cx" fill="transparent" isAnimationActive={false} maxBarSize={56}>
              <ErrorBar dataKey="bigodeInferior" width={6} strokeWidth={1.5} stroke="currentColor" />
            </Bar>
            <Bar
              dataKey="caixa" stackId="cx" fill={CHART_COLORS.primary} fillOpacity={0.45}
              maxBarSize={56} isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
            >
              <ErrorBar dataKey="bigodeSuperior" width={6} strokeWidth={1.5} stroke="currentColor" />
            </Bar>
            <Scatter dataKey="mediana" shape={MedianMark} />
          </ComposedChart>
        )}
      </ChartSizer>
    </div>
  );
}

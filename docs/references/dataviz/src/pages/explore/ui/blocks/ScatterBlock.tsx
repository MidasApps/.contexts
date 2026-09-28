'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import {
  seriesColor, CHART_AXIS_STYLE, CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE, CHART_LEGEND_STYLE, CHART_INK_CLASS,
} from '@/shared/config/chart-theme';
import { cn } from '@/shared/lib/utils';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import type { ScatterBlock as ScatterBlockType } from '@/shared/config/agents/types';
import { compactValue, formattedValue } from './formatted-value';
import { tooltipContent } from './SeriesTooltip';

/**
 * Dispersão — uma observação por ponto.
 *
 * A concentração de risco (LTV × atraso, ticket × prazo) só existia como
 * tabela de mil linhas, e tabela de mil linhas não mostra agrupamento nem
 * outlier: mostra as cem primeiras linhas ordenadas por alguma coisa. O
 * gráfico responde "onde a carteira se acumula e o que escapou" de uma vez.
 *
 * As linhas de referência (`xReference`/`yReference`) são o que transforma a
 * nuvem em decisão: sem o corte de LTV 80% desenhado, o leitor tem de
 * adivinhar onde fica a fronteira.
 */

/** Agrupa por `group`; sem grupo, uma série só. */
function blockSeries(points: NonNullable<ScatterBlockType['points']>) {
  const byGroup = new Map<string, Array<{ x: number; y: number; size?: number }>>();
  for (const p of points) {
    const key = p.group ?? '';
    const current = byGroup.get(key);
    const point = { x: p.x, y: p.y, ...(p.size !== undefined ? { size: p.size } : {}) };
    if (current) current.push(point);
    else byGroup.set(key, [point]);
  }
  return [...byGroup.entries()].map(([name, data], i) => ({
    nome: name,
    data,
    color: seriesColor(i),
  }));
}

export function ScatterBlock({
  block,
  height = 340,
}: {
  block: ScatterBlockType;
  height?: number | string;
}) {
  const points = block.points ?? [];

  // Primeira coisa: nada abaixo tolera bloco sem ponto. A guarda vem antes de
  // qualquer leitura de `pontos[…]` — é a mesma armadilha que derrubou a página
  // inteira quando um `chart` chegou sem `data`.
  if (points.length === 0) {
    return (
      <div className="flex h-[340px] items-center justify-center text-[11px] italic text-muted-foreground/40">
        Sem dados para exibir
      </div>
    );
  }

  const series = blockSeries(points);
  const hasGroups = series.length > 1 || series[0]?.nome !== '';
  const hasSize = points.some((p) => p.size !== undefined);

  const baseAxis = { ...CHART_AXIS_STYLE, tickLine: false as const, axisLine: false as const };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipProps: any = {
    ...CHART_TOOLTIP_STYLE,
    // Uma linha por eixo, nome à esquerda e número à direita — o `formatter`
    // padrão escrevia "LTV : 52%" com o separador do Recharts no meio.
    content: tooltipContent({
      // Uma casa para percentual: um LTV é "73%", não "73,00%" — as duas casas
      // do default sugerem uma precisão que a leitura de dispersão não tem.
      formatValue: (value, key) => {
        const format = key === 'x' ? block.xFormat : block.yFormat;
        return formattedValue(value, format, format === 'percent' ? 1 : undefined);
      },
    }),
  };

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          <ScatterChart width={w} height={h} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis
              type="number"
              dataKey="x"
              name={block.xLabel ?? 'x'}
              {...baseAxis}
              tickFormatter={(v: number) => compactValue(v, block.xFormat)}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={block.yLabel ?? 'y'}
              {...baseAxis}
              tickFormatter={(v: number) => compactValue(v, block.yFormat)}
            />
            {/* O terceiro canal só é declarado quando existe: sem isto o
                Recharts normaliza tudo para o raio mínimo e some com os pontos. */}
            {hasSize && <ZAxis type="number" dataKey="size" range={[24, 300]} />}
            {/* O `Formatter` do Recharts é genérico sobre `ValueType`, que
                inclui `undefined` e arrays — tipar o parâmetro como `number`
                não satisfaz a assinatura. Mesmo contorno do `ChartBlock`. */}
            <Tooltip {...tooltipProps} />
            {block.xReference && (
              <ReferenceLine
                x={block.xReference.value}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={block.xReference.label
                  ? { value: block.xReference.label, fill: 'currentColor', fontSize: 10, position: 'top' }
                  : undefined}
              />
            )}
            {block.yReference && (
              <ReferenceLine
                y={block.yReference.value}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={block.yReference.label
                  ? { value: block.yReference.label, fill: 'currentColor', fontSize: 10, position: 'right' }
                  : undefined}
              />
            )}
            {hasGroups && <Legend {...CHART_LEGEND_STYLE} />}
            {series.map((s) => (
              <Scatter
                key={s.nome || 'todos'}
                name={s.nome || (block.yLabel ?? 'Observações')}
                data={s.data}
                fill={s.color}
                fillOpacity={0.62}
                isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
              />
            ))}
          </ScatterChart>
        )}
      </ChartSizer>
    </div>
  );
}

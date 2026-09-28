'use client';

import { Treemap, Tooltip } from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { seriesColor, CHART_TOOLTIP_STYLE, CHART_INK_CLASS } from '@/shared/config/chart-theme';
import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/format';
import type { TreemapBlock as TreemapBlockType } from '@/shared/config/agents/types';
import { formattedValue } from './formatted-value';
import { valueContent } from './SeriesTooltip';

/**
 * Peso por área.
 *
 * Serve quando há MUITAS categorias de tamanhos muito desiguais: acima de ~8 as
 * fatias de uma rosca ficam indistinguíveis e a área continua legível. Abaixo
 * disso a rosca diz o mesmo com menos aparato — e com duas ou três categorias
 * o treemap desenha um retângulo gigante que não informa nada.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseProps = any;

export function TreemapBlock({
  block,
  height = '100%',
}: {
  block: TreemapBlockType;
  height?: number | string;
}) {
  const fatias = block.fatias ?? [];
  const format = (v: number) => formattedValue(v, block.format);
  const data = fatias.map((f) => ({ name: f.name, size: Math.max(f.value, 0) }));

  /**
   * Conteúdo próprio do bloco.
   *
   * O `content` padrão do Recharts desenha o rótulo com `fill` E `stroke` ao
   * mesmo tempo, o que produz um texto contornado que parece negrito borrado.
   * Aqui o texto tem só preenchimento, e some quando o bloco é pequeno demais
   * para contê-lo — rótulo cortado no meio é pior que rótulo nenhum, e o
   * tooltip continua dizendo o nome.
   */
  function TreemapCell(props: LooseProps) {
    const { x, y, width, height: cellHeight, index, name, value } = props;
    const fitsLabel = width > 88 && cellHeight > 34;
    const fitsValue = fitsLabel && cellHeight > 54;
    return (
      <g>
        <rect
          x={x} y={y} width={width} height={cellHeight}
          fill={seriesColor(index)}
          stroke="var(--color-background)"
          strokeWidth={2}
        />
        {fitsLabel && (
          <text x={x + 10} y={y + 22} fill="var(--color-primary-foreground)" fontSize={12} fontWeight={500}>
            {name}
          </text>
        )}
        {fitsValue && value !== undefined && (
          <text x={x + 10} y={y + 40} fill="var(--color-primary-foreground)" fontSize={11} fillOpacity={0.75}>
            {format(value)}
          </text>
        )}
      </g>
    );
  }

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          <Treemap
            width={w} height={h} data={data} dataKey="size"
            content={<TreemapCell />}
            isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
          >
            {/* Nome em cima, valor embaixo. Com `formatter` devolvendo nome
                vazio o Recharts imprimia ": R$ 18,4 mi" — o separador órfão, e
                o nome da categoria em lugar nenhum. */}
            <Tooltip
              {...({
                ...CHART_TOOLTIP_STYLE,
                content: valueContent({
                  itemName: (p: LooseProps) => String(p.payload?.[0]?.payload?.name ?? ''),
                  itemValue: (p: LooseProps) => {
                    const v = Number(p.payload?.[0]?.value ?? Number.NaN);
                    return Number.isFinite(v) ? format(v) : null;
                  },
                  details: (p: LooseProps) => {
                    const v = Number(p.payload?.[0]?.value ?? 0);
                    const sum = fatias.reduce((s, f) => s + Math.max(f.value, 0), 0);
                    return sum > 0 ? [`${formatNumber((v / sum) * 100, 1)}% do total`] : [];
                  },
                }),
              } as LooseProps)}
            />
          </Treemap>
        )}
      </ChartSizer>
    </div>
  );
}

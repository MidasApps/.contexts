'use client';

import { FunnelChart, Funnel, LabelList, Tooltip } from 'recharts';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_INK_CLASS } from '@/shared/config/chart-theme';
import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/format';
import type { FunnelBlock as FunnelBlockType } from '@/shared/config/agents/types';
import { formattedValue } from './formatted-value';

/**
 * Funil — um fluxo com perda em cada etapa.
 *
 * A esteira de repasse é o caso do produto: elegíveis → aprovados pelo banco →
 * repassados → liquidados. Hoje isso vira quatro KPIs soltos, e o leitor faz a
 * subtração de cabeça sem enxergar ONDE a perda é maior.
 *
 * A ordem vem do SQL, nunca do bloco. Um funil reordenado por valor deixa de
 * ser funil: o afunilamento passa a ser um artefato da ordenação, não do
 * processo.
 */

/**
 * Uma cor só, esmaecendo.
 *
 * A primeira versão girava a paleta inteira, e o funil saía laranja, marrom,
 * verde, amarelo e vermelho. Cor diferente por etapa diz "categorias distintas"
 * — e verde seguido de vermelho diz "bom" e "ruim", um veredito que o bloco não
 * tem como emitir: perder 60% pode ser ótimo ou péssimo, depende do processo.
 * O que o funil mede é a LARGURA. A cor só acompanha o percurso.
 */
function stageTone(index: number, total: number): number {
  if (total <= 1) return 1;
  return 1 - (index / (total - 1)) * 0.55;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseProps = any;

/**
 * O nome da etapa, à direita do trapézio, numa linha só.
 *
 * O `LabelList` com `position="right"` passa ao `Text` do Recharts a largura da
 * FORMA, não a da coluna de rótulos — e "Enviados ao banco" saía quebrado em
 * três linhas empilhadas sobre uma etapa de 60px. Passar `width` não resolve:
 * a largura da forma vence. Um `<text>` cru não quebra nunca.
 */
function StageName(props: LooseProps) {
  const { viewBox, value } = props;
  if (!viewBox) return null;
  return (
    <text
      x={viewBox.x + viewBox.width + 10}
      y={viewBox.y + viewBox.height / 2}
      dominantBaseline="middle"
      fontSize={11}
      fill="currentColor"
    >
      {value}
    </text>
  );
}

export function FunnelBlock({
  block,
  height = '100%',
}: {
  block: FunnelBlockType;
  height?: number | string;
}) {
  const etapas = block.etapas ?? [];
  const format = (v: number) => formattedValue(v, block.format, block.decimals);
  const first = etapas[0]?.value ?? 0;

  const data = etapas.map((e, i) => ({
    name: e.etapa,
    value: e.value,
    fill: CHART_COLORS.primary,
    fillOpacity: stageTone(i, etapas.length),
    // Conversão contra a etapa ANTERIOR, não contra o topo: é onde a perda
    // acontece que interessa, não o acumulado — esse já se lê pela largura.
    conversao: i === 0 || !etapas[i - 1]?.value
      ? null
      : (e.value / etapas[i - 1]!.value) * 100,
    /*
     * "Do topo" só a partir da TERCEIRA etapa. Na primeira ele vale 100% por
     * definição, e na segunda é o mesmo número da conversão contra a anterior
     * — as duas linhas diziam "71,3%" uma embaixo da outra, e a repetição faz
     * o leitor procurar a diferença que não existe.
     */
    doTopo: i >= 2 && first ? (e.value / first) * 100 : null,
  }));

  return (
    <div className={cn('h-full w-full', CHART_INK_CLASS)}>
      <ChartSizer height={height}>
        {(w, h) => (
          // A coluna de rótulos é uma FRAÇÃO da largura, não 160px fixos: com
          // valor fixo o funil encolhia até virar uma tira num card estreito, e
          // num card largo sobrava vão à direita dos nomes.
          <FunnelChart
            width={w} height={h}
            margin={{ top: 6, right: Math.max(88, Math.min(200, w * 0.34)), bottom: 6, left: 6 }}
          >
            <Tooltip
              {...({
                ...CHART_TOOLTIP_STYLE,
                content: ({ active, payload }: LooseProps) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof data[number];
                  return (
                    <div style={CHART_TOOLTIP_STYLE.contentStyle}>
                      <div style={CHART_TOOLTIP_STYLE.labelStyle}>{d.name}</div>
                      <div>{format(d.value)}</div>
                      {d.conversao !== null && (
                        <div>{`${formatNumber(d.conversao, 1)}% da etapa anterior`}</div>
                      )}
                      {d.doTopo !== null && (
                        <div>{`${formatNumber(d.doTopo, 1)}% do topo`}</div>
                      )}
                    </div>
                  );
                },
              } as LooseProps)}
            />
            {/* `lastShapeType="rectangle"`: o padrão termina o funil num
                triângulo, e um bico afirma que o fluxo chega a zero na última
                etapa — que é justamente a que sobreviveu. */}
            <Funnel
              dataKey="value" data={data} lastShapeType="rectangle"
              isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
            >
              {/* Sem o rótulo à direita o leitor vê trapézios e não sabe qual
                  etapa é qual — a forma sozinha não nomeia nada. */}
              <LabelList dataKey="name" content={<StageName />} />
              <LabelList
                position="center"
                dataKey="value"
                stroke="none"
                fill="var(--color-primary-foreground)"
                fontSize={12}
                formatter={((v: number) => format(v)) as LooseProps}
              />
            </Funnel>
          </FunnelChart>
        )}
      </ChartSizer>
    </div>
  );
}

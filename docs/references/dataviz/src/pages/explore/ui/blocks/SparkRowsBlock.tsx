'use client';

import { AreaChart, Area } from 'recharts';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { humanizeColumnName } from '@/shared/lib/format';
import type { SparkRowsBlock as SparkRowsBlockType } from '@/shared/config/agents/types';
import { BlockCard, BlockCardHead, BlockEmpty, BLOCK_SUPPORT } from './block-shell';
import { KpiExpandedModal } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import { BlockLoadingSparkRows } from './BlockLoading';
import { compactValue } from './formatted-value';

/**
 * Várias séries com histórico, uma por linha — *small multiples*.
 *
 * Quatro KPIs com sparkline ocupam a linha inteira e ainda assim só o último
 * valor é legível. As mesmas quatro séries aqui cabem em metade dela: o número
 * perde destaque e a TENDÊNCIA ganha, que é a troca certa quando o assunto é
 * acompanhamento e não o indicador principal da página.
 *
 * A curva é um `<AreaChart type="monotone">` com gradiente — exatamente o que o
 * `KpiCard` já usa na sparkline dele. A primeira versão deste bloco desenhava
 * um `<path>` com segmentos retos, e o resultado eram DUAS sparklines no mesmo
 * produto com aparências diferentes: uma suave com preenchimento, outra
 * serrilhada e chapada. Era a inconsistência que este trabalho existia para
 * eliminar, criada dentro dele.
 */

/**
 * Piso da faixa de cada série.
 *
 * A curva ocupa a linha inteira abaixo do rótulo, e não uma caixa de 80px à
 * direita dele. Numa coluna de 3/6 aqueles 80px eram ~15% da largura
 * disponível: a série desenhava um risco quase reto, e todo o resto do card
 * ficava vazio. Com a linha inteira, a forma da série volta a ser legível —
 * que é a única coisa que este bloco tem a dizer.
 */
const MIN_ROW_HEIGHT = 34;
/** O que sobra para a curva depois do rótulo e do valor, na faixa mínima. */
const CURVE_HEIGHT = 22;

/** Sobe, desce ou anda de lado — comparando o primeiro ponto com o último. */
function seriesDirection(points: number[]): 'sobe' | 'desce' | 'estavel' {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || first === last) return 'estavel';
  return last > first ? 'sobe' : 'desce';
}

export function SparkRowsBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: SparkRowsBlockType;
  loading?: boolean;
  /** Clicar abre o chat sobre o conjunto — mesmo gesto dos vizinhos. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const series = block.series ?? [];
  const positiveIsGood = block.positiveIsGood ?? true;

  /*
   * Carregando vem ANTES do vazio, e desenha esqueleto na geometria real.
   * Sem esta ramificação o bloco caía no `series.length === 0` só depois do
   * `!loading`, e durante a busca o card ficava com o cabeçalho e um vazio
   * embaixo — nem esqueleto, nem conteúdo.
   */
  if (loading) {
    return (
      <BlockCard loading>
        <BlockCardHead label={block.title ?? 'Tendência por métrica'} support={block.subtitle} />
        <BlockLoadingSparkRows />
      </BlockCard>
    );
  }

  if (series.length === 0) {
    return (
      <BlockCard>
        <BlockCardHead label={block.title ?? 'Tendência por métrica'} support={block.subtitle} />
        <BlockEmpty height={140} />
      </BlockCard>
    );
  }

  const title = block.title ?? 'Tendência por métrica';
  const principal = series[0];

  return (
    <>
    <BlockCard
      loading={loading}
      onExpand={expandable && !loading ? () => setExpanded(true) : undefined}
      expandLabel={`Analisar ${title}`}
    >
      <BlockCardHead
        label={title}
        support={block.subtitle}
        right={
          series[0]?.points.length
            ? <span className={BLOCK_SUPPORT}>{`${series[0].points.length} períodos`}</span>
            : undefined
        }
      />

      {/* Cada série é uma FATIA do card, não uma linha de altura fixa boiando
          num vazio. `justify-evenly` só empurrava as linhas para longe umas das
          outras; com `flex-1` por série a curva cresce junto e o card fica
          preenchido com informação, não com espaço. */}
      <div className="flex flex-1 flex-col gap-3">
        {series.map((seriesItem, i) => {
          const direction = seriesDirection(seriesItem.points);
          const ink = direction === 'estavel'
            ? 'text-muted-foreground'
            : (direction === 'sobe') === positiveIsGood
              ? 'text-success'
              : 'text-destructive';
          const last = seriesItem.points[seriesItem.points.length - 1];
          const name = humanizeColumnName(seriesItem.name);
          // O id do gradiente precisa ser único no documento: dois blocos na
          // mesma página com a mesma série colidiriam e o segundo herdaria o
          // preenchimento do primeiro.
          const gradientId = `sparkrow-${block.id}-${i}`;
          const data = seriesItem.points.map((v, x) => ({ x, v }));

          return (
            <div
              key={seriesItem.name}
              className="flex min-h-0 flex-1 flex-col border-b border-border pb-2 last:border-b-0"
              style={{ minHeight: MIN_ROW_HEIGHT }}
            >
              {/* Rótulo e valor dividem a linha de cima; a curva fica com a
                  largura inteira embaixo. Antes os três disputavam a mesma
                  linha, e a curva — que é o conteúdo — ficava com a menor
                  fatia dos três. */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                  {name}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {last === undefined ? '—' : compactValue(last, block.format, block.decimals)}
                </span>
              </div>
              <div
                className={cn('min-h-0 flex-1', ink)}
                role="img"
                aria-label={`${name}: tendência ${
                  direction === 'sobe' ? 'de alta' : direction === 'desce' ? 'de baixa' : 'estável'
                }`}
              >
                {/* Reserva do tamanho da FAIXA. O default do ChartSizer são
                    300px, medida de gráfico de card: numa faixa de 34px ele
                    desenhava uma mancha do tamanho da página quando o pai não
                    tinha altura (modo de edição). */}
                <ChartSizer height="100%" reservedHeight={CURVE_HEIGHT}>
                  {(w, h) => (
                    <AreaChart width={w} height={h} data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                      />
                    </AreaChart>
                  )}
                </ChartSizer>
              </div>
            </div>
          );
        })}
      </div>
    </BlockCard>

    <KpiExpandedModal
      isOpen={expanded}
      onClose={() => setExpanded(false)}
      config={{
        label: title,
        icon: Activity,
        value: `${series.length} séries`,
        format: (v: number) => compactValue(v, block.format, block.decimals),
        context: series
          .map((s) => `${humanizeColumnName(s.name)}: ${
            s.points.length ? compactValue(s.points[s.points.length - 1]!, block.format, block.decimals) : '—'
          }`)
          .join('; '),
      }}
      // A primeira série vai ampliada para o gráfico do modal: é a única que
      // cabe ali, e some o mini-gráfico que já se vê no card.
      sparklineData={principal?.points ?? []}
      months={[]}
    />
    </>
  );
}

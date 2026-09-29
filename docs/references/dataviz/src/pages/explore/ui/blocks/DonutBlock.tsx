'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { DonutChart } from '@/widgets/chart-widget';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { cn } from '@/shared/lib/utils';
import { valueContent } from './SeriesTooltip';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import { CHART_PALETTE, CHART_INK_CLASS, CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/lib/format';
// `formatNumber` já estava importado para o formatador de valor; a barra de
// linha única o reusa para o percentual, em vez de `toFixed`.
import type { DonutBlock as DonutBlockType } from '@/shared/config/agents/types';
import { BlockEmpty } from './block-shell';
import { compactValue } from './formatted-value';

function formatValue(n: number, fmt: DonutBlockType['format']): string {
  if (fmt === 'currency') return formatCurrency(n);
  if (fmt === 'percent') return formatPercent(n, 1);
  return formatNumber(n);
}

/**
 * O total do centro — abreviado, porque o vão da rosca é apertado.
 *
 * Era uma segunda implementação de abreviação, com `toFixed` e sem espaço:
 * `R$85.2mi`. Ponto decimal e ausência de espaço no meio de uma tela onde o
 * card ao lado diz "R$ 71,09 mi". `compactValue` é a única regra de
 * abreviação do produto — duas nunca ficam iguais.
 */
function formatCenter(total: number, fmt: DonutBlockType['format']): string {
  return compactValue(total, fmt);
}

/**
 * @param height Altura imposta de fora. O `ChartWidget` clona o filho com
 *   `height="100%"` ao expandir, para que ele ocupe a coluna inteira do
 *   diálogo — a rosca não aceitava a prop e ficava do tamanho mínimo num canto,
 *   com os cards de legenda espremidos ao lado. Ausente, a rosca segue
 *   acompanhando a altura que a linha deu ao card.
 */
export function DonutBlock({ block, height }: { block: DonutBlockType; height?: string }) {
  const slices = block.slices ?? [];
  const total = slices.reduce((sum, s) => sum + (s.value || 0), 0);
  const colors = block.colors ?? CHART_PALETTE;
  const showCards = block.showLegendCards !== false;

  if (slices.length === 0) return <BlockEmpty height="100%" />;

  const data = slices.map((s, i) => ({
    name: s.name,
    value: s.value,
    fill: s.fill ?? colors[i % colors.length],
  }));

  /*
   * Barra 100% de linha única — a mesma composição em cerca de um terço da
   * altura. É a escolha certa quando a composição é CONTEXTO de outro bloco e
   * não o assunto da linha: a rosca reserva 160px de diâmetro mais os cards
   * laterais, e paga isso em espaço vertical que o vizinho perde.
   */
  if (block.display === 'bar') {
    // `toFixed` emite ponto decimal; o resto do app fala pt-BR. Um "60.0%" no
    // meio de uma tela de "R$ 48,2 mi" denuncia que veio de outro lugar.
    const percent = (v: number) => `${formatNumber(total > 0 ? (v / total) * 100 : 0, 1)}%`;

    /*
     * Barra 100% de linha única — um `<BarChart>` empilhado de UMA categoria,
     * com `stackOffset="expand"` fazendo a normalização e os eixos escondidos.
     * A alternativa era um flexbox de `<span>` com `width` em percentual: dava
     * o mesmo desenho e nenhum tooltip, enquanto todo gráfico vizinho tem o
     * seu. Aqui a composição é lida com o mesmo gesto do resto da página.
     */
    const row: Record<string, string | number> = { nome: 'composicao' };
    for (const s of data) row[s.name] = s.value;

    return (
      // `h-full` junto do `justify-center`: sem altura para centralizar dentro,
      // o `justify-center` não tinha efeito e a faixa encostava no topo com o
      // resto do card em branco. Mesma quebra de cadeia do ChartWidget.
      <div className={cn('flex h-full w-full flex-col justify-center', CHART_INK_CLASS)}>
        <div
          role="img"
          aria-label={`Composição: ${data.map((s) => `${s.name} ${percent(s.value)}`).join(', ')}`}
        >
          <ChartSizer height={30}>
            {(w, h) => (
              <BarChart
                width={w} height={h} data={[row]} layout="vertical"
                stackOffset="expand" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide domain={[0, 1]} />
                <YAxis type="category" dataKey="nome" hide />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  content={valueContent({
                    itemName: (p) => String(p.payload?.[0]?.name ?? ''),
                    itemValue: (p) => {
                      const slice = data.find((s) => s.name === p.payload?.[0]?.name);
                      return slice ? formatValue(slice.value, block.format) : null;
                    },
                    details: (p) => {
                      const slice = data.find((s) => s.name === p.payload?.[0]?.name);
                      return slice ? [`${percent(slice.value)} do total`] : [];
                    },
                  })}
                />
                {data.map((s, i) => (
                  <Bar
                    key={s.name}
                    dataKey={s.name}
                    stackId="composicao"
                    fill={s.fill}
                    radius={i === 0 ? [7, 0, 0, 7] : i === data.length - 1 ? [0, 7, 7, 0] : 0}
                    isAnimationActive={RECHARTS_ANIMATION_ACTIVE}
                  />
                ))}
              </BarChart>
            )}
          </ChartSizer>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
          {data.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <i className="size-2 shrink-0 rounded-[2px]" style={{ background: s.fill }} aria-hidden="true" />
              {s.name}
              <b className="font-semibold tabular-nums text-foreground">{percent(s.value)}</b>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    /*
     * `h-full` e `items-stretch`: a rosca acompanha a altura que a linha deu ao
     * card, em vez de ficar num quadrado de 160px com o resto do card em branco
     * embaixo. O `DonutChart` já derivava o raio de `min(w, h)` — quem o
     * prendia era esta caixa de tamanho fixo.
     *
     * `w-full` pelo mesmo motivo, no outro eixo: no card a largura vem do
     * container, mas no diálogo o pai centraliza (`justify-center`) e um flex
     * item sem largura declarada encolhe até o conteúdo. A rosca ficava do
     * tamanho mínimo num canto, com os cards espremidos ao lado e o resto da
     * coluna vazio.
     */
    <div
      className="flex h-full w-full items-stretch gap-5"
      style={height ? { height } : undefined}
    >
      <div
        className={cn(
          'relative min-h-[132px] shrink-0',
          /* Sem os cards laterais a rosca fica com o card inteiro; com eles,
             divide. O teto existe para ela não virar um disco gigante numa
             linha 6/6 do relatório — mas no diálogo o espaço é a tela toda, e
             ali 240px deixam de ser contenção para virar limitação. */
          showCards ? (height ? 'w-[46%] max-w-[420px]' : 'w-[46%] max-w-[240px]') : 'w-full',
        )}
      >
        <DonutChart
          data={data}
          height="100%"
          tooltipFormatter={(v) => formatValue(v, block.format)}
        />
        {/* `z-0`: o total é pano de fundo da rosca, e o tooltip é a camada de
            cima. Esta div é irmã POSTERIOR do gráfico e absoluta, então sem
            uma ordem declarada ela empilhava na frente — passar o mouse numa
            fatia mostrava a caixa do tooltip com o total atravessado por cima.
            Quem responde "quanto vale esta fatia" é o tooltip. */}
        <div
          data-centro-da-rosca=""
          className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-1 pointer-events-none"
        >
          <p className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider leading-none">
            {block.centerLabel ?? 'Total'}
          </p>
          <p className="text-base font-bold text-foreground leading-none tabular-nums">
            {formatCenter(total, block.format)}
          </p>
        </div>
      </div>

      {showCards && (
        /*
         * `justify-center` e não empilhado no topo: os cards ficam no eixo da
         * rosca. Empilhados, duas fatias deixavam a metade de baixo do card em
         * branco enquanto a rosca ocupava o centro — o desequilíbrio que a
         * captura mostrou.
         *
         * Eles NÃO usam `flex-1`: com duas fatias isso os esticaria em duas
         * caixas enormes de conteúdo minúsculo. O que preenche a altura é a
         * rosca, que é o elemento que ganha com tamanho.
         */
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          {data.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <div
                key={s.name}
                className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.fill }} />
                  <p className="truncate text-[11px] text-muted-foreground">{s.name}</p>
                </div>
                {/* Valor e percentual na MESMA linha, alinhados pela base: o
                    valor à direita brigava com o rótulo por espaço horizontal,
                    e era o que deixava o card apertado com nome longo. */}
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="font-display text-base font-bold leading-none tabular-nums text-foreground">
                    {formatValue(s.value, block.format)}
                  </p>
                  <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                    {formatNumber(pct, 1)}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

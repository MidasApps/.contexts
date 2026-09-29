'use client';

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';
import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ChartSizer } from '@/widgets/chart-widget/ui/ChartSizer';
import { RECHARTS_ANIMATION_ACTIVE } from '@/shared/config/recharts';
import {
  CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_TOOLTIP_STYLE, CHART_INK_CLASS,
} from '@/shared/config/chart-theme';
import { formatNumber } from '@/shared/lib/format';
import type { TargetItem, TargetsBlock as TargetsBlockType } from '@/shared/config/agents/types';
import {
  HEIGHT, BlockCard, BlockCardHead, BlockEmpty, BLOCK_SUPPORT,
  classifyAgainstLimit, toneInk, type BlockTone,
} from './block-shell';
import { KpiExpandedModal } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import { BlockLoadingTargets } from './BlockLoading';
import { formattedValue } from './formatted-value';
import { valueContent } from './SeriesTooltip';

/**
 * Vários indicadores, cada um contra a sua própria meta.
 *
 * O gauge não escala: cada covenant come 2/6, três fecham a linha, e mesmo
 * assim não se comparam — mínimos diferentes (1,20x, 1,50x, 15%) não têm régua
 * comum em valor absoluto.
 *
 * **A régua comum é o percentual da meta.** Normalizado assim, um índice de
 * 1,38x com mínimo 1,20 (115%) e uma concentração de 8,4% com máximo 15% (56%)
 * viram números do mesmo eixo, e a meta de todos cai na mesma linha vertical.
 * É o que faz deste um bullet chart de verdade e não três barras avulsas.
 *
 * O desenho é um `<BarChart>` horizontal do Recharts — herda animação, tooltip
 * e eixo da mesma biblioteca que o resto dos gráficos, em vez de `<rect>`
 * posicionados à mão.
 */

const FILL: Record<BlockTone, string> = {
  neutro: 'fill-muted-foreground',
  positivo: 'fill-success',
  atencao: 'fill-warning',
  ruptura: 'fill-destructive',
};

const DOT: Record<BlockTone, string> = {
  neutro: 'bg-muted-foreground',
  positivo: 'bg-success',
  atencao: 'bg-warning',
  ruptura: 'bg-destructive',
};

/** Altura por item, mais o respiro do eixo inferior. */
const HEIGHT_PER_ITEM = 34;
const AXIS_HEIGHT = 26;

/**
 * O piso do desenho, para o card não sobrar vazio embaixo.
 *
 * Sai da conta do degrau `conjunto` (240px): menos 40 de respiro do card, 40 de
 * cabeçalho e 20 da legenda do eixo. Dois covenants desenhariam 94px e
 * deixariam quase metade do card em branco.
 */
const MIN_DRAWING_HEIGHT = HEIGHT.conjunto - 100;

interface BulletRow {
  label: string;
  /** O valor como percentual da meta — a régua comum. */
  pct: number;
  tom: BlockTone;
  valor: string;
  meta: string;
  invertida: boolean;
}

function evaluate(
  item: TargetItem,
  blockInverted: boolean,
  format: (v: number) => string,
): BulletRow {
  const inverted = item.reverseScale ?? blockInverted;
  return {
    label: item.label,
    // Meta zero não tem percentual — o item cai em 0 e a barra some, que é
    // preferível a `Infinity` derrubando o domínio do eixo inteiro.
    pct: item.target === 0 ? 0 : (item.value / Math.abs(item.target)) * 100,
    tom: classifyAgainstLimit({
      valor: item.value,
      limit: item.target,
      warning: item.warn,
      invertedScale: inverted,
    }),
    valor: format(item.value),
    meta: format(item.target),
    invertida: inverted,
  };
}

export function TargetsBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: TargetsBlockType;
  loading?: boolean;
  /** Clicar abre o chat sobre o conjunto — mesmo gesto dos vizinhos. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = block.items ?? [];
  const blockInverted = block.reverseScale ?? false;
  const format = (v: number) => formattedValue(v, block.format, block.decimals, block.suffix);

  // Carregando antes do vazio — ver a nota equivalente no `SparkRowsBlock`.
  if (loading) {
    return (
      <BlockCard loading>
        <BlockCardHead label={block.title ?? 'Indicadores com meta'} support={block.subtitle} />
        <BlockLoadingTargets />
      </BlockCard>
    );
  }

  if (items.length === 0) {
    return (
      <BlockCard>
        <BlockCardHead label={block.title ?? 'Indicadores com meta'} support={block.subtitle} />
        <BlockEmpty height={140} />
      </BlockCard>
    );
  }

  const rows = items.map((i) => evaluate(i, blockInverted, format));
  const asList = block.display === 'list';

  // O eixo vai até o maior valor ou 150% da meta, o que for maior: abaixo disso
  // um item folgado encostaria na borda e pareceria no limite.
  const ceiling = Math.max(150, ...rows.map((l) => Math.ceil(l.pct / 25) * 25));

  /*
   * A faixa de rompimento só é tingida quando todos os itens têm o mesmo
   * sentido. Num bloco misto — um mínimo e um máximo lado a lado — "abaixo de
   * 100%" é bom para um e ruim para o outro, e um único tingido mentiria sobre
   * metade dos itens. Nesse caso a cor da barra segue carregando o veredito.
   */
  const isOneDirection = rows.every((l) => l.invertida === rows[0]?.invertida);
  const breachBand = !isOneDirection
    ? null
    : rows[0]?.invertida
      ? { x1: 100, x2: ceiling }
      : { x1: 0, x2: 100 };

  const title = block.title ?? 'Indicadores com meta';
  const outOfCompliance = rows.filter((l) => l.tom === 'ruptura');

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
          items.length > 0 ? (
            <span className={BLOCK_SUPPORT}>
              {`${items.length} monitorado${items.length > 1 ? 's' : ''}`}
            </span>
          ) : undefined
        }
      />

      {asList ? (
        // A lista compacta não é um gráfico: é uma tabela de leitura rápida.
        // Impor um chart aqui só acrescentaria eixo a algo que não tem escala.
        <div className="flex flex-col">
          {/* Posição + rótulo: homônimos (dois corretores "Ana Barbosa") são linhas distintas. */}
          {rows.map((l, i) => (
            <div
              key={`${i}-${l.label}`}
              className="flex items-center gap-3 border-b border-border py-2 last:border-b-0"
            >
              <span className={cn('size-2 shrink-0 rounded-full', DOT[l.tom])} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                {l.label}
              </span>
              <span className={cn('text-sm font-semibold tabular-nums', toneInk(l.tom))}>
                {l.valor}
              </span>
              <span className={cn(BLOCK_SUPPORT, 'w-20 shrink-0 text-right')}>
                {`${l.invertida ? 'máx' : 'mín'} ${l.meta}`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('w-full', CHART_INK_CLASS)}>
          <ChartSizer
            height={Math.max(
              MIN_DRAWING_HEIGHT,
              rows.length * HEIGHT_PER_ITEM + AXIS_HEIGHT,
            )}
          >
            {(w, h) => (
              <BarChart
                width={w}
                height={h}
                data={rows}
                layout="vertical"
                barCategoryGap="35%"
                margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...CHART_GRID_STYLE} vertical horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, ceiling]}
                  {...CHART_AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  {...CHART_AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                />
                {breachBand && (
                  <ReferenceArea
                    x1={breachBand.x1}
                    x2={breachBand.x2}
                    className="fill-destructive"
                    fillOpacity={0.08}
                  />
                )}
                {/* O tooltip fala em valor real, não no percentual
                    normalizado: a normalização serve ao EIXO, não à leitura do
                    número. A meta vai numa linha de apoio — no `formatter`
                    antiga ela vinha colada ao valor, atrás de um " : ". */}
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  content={valueContent({
                    itemName: (p) => String((p.payload?.[0]?.payload as BulletRow | undefined)?.label ?? ''),
                    itemValue: (p) => {
                      const l = p.payload?.[0]?.payload as BulletRow | undefined;
                      return l ? String(l.valor) : null;
                    },
                    details: (p) => {
                      const l = p.payload?.[0]?.payload as BulletRow | undefined;
                      return l ? [`meta ${l.meta}`] : [];
                    },
                  })}
                />
                {/* A meta de todos cai na mesma vertical — é o ponto da
                    normalização, e o que torna os itens comparáveis a olho. */}
                <ReferenceLine
                  x={100}
                  className="stroke-foreground"
                  strokeOpacity={0.8}
                  strokeWidth={2}
                  label={{ value: 'meta', position: 'top', fill: 'currentColor', fontSize: 9 }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} isAnimationActive={RECHARTS_ANIMATION_ACTIVE}>
                  {rows.map((l, i) => (
                    <Cell key={`${i}-${l.label}`} className={FILL[l.tom]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartSizer>
          <p className={cn(BLOCK_SUPPORT, 'mt-1 text-center opacity-70')}>
            {`eixo em % da meta de cada indicador — 100% é a meta${
              rows[0] ? ` (${formatNumber(ceiling, 0)}% no topo)` : ''
            }`}
          </p>
        </div>
      )}
    </BlockCard>

    <KpiExpandedModal
      isOpen={expanded}
      onClose={() => setExpanded(false)}
      config={{
        label: title,
        icon: ListChecks,
        // Um conjunto não tem "o número". O que resume é quantos estão fora do
        // enquadramento — que é a pergunta que alguém abre este bloco para fazer.
        value: outOfCompliance.length === 0
          ? `${rows.length} enquadrados`
          : `${outOfCompliance.length} de ${rows.length} fora`,
        format: (v: number) => format(v),
        context: rows
          .map((l) => `${l.label}: ${l.valor} (${l.invertida ? 'máx' : 'mín'} ${l.meta})`)
          .join('; '),
      }}
      sparklineData={[]}
      months={[]}
    />
    </>
  );
}

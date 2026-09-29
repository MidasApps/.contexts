'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/format';
import type { ComparisonBlock as ComparisonBlockType } from '@/shared/config/agents/types';
import {
  BlockCard, BlockCardHead, BlockValueSkeleton, BLOCK_SUPPORT,
  BLOCK_SECONDARY_VALUE,
} from './block-shell';
import { KpiExpandedModal } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import { formattedValue } from './formatted-value';

/**
 * O número de agora ao lado do número de antes.
 *
 * A comparação com o período anterior existia só como tooltip da sparkline do
 * KPI: invisível para quem lê a página e ausente do PDF exportado, que é como
 * o relatório chega ao cotista. Aqui ela é conteúdo, não interação.
 *
 * `deltaAsPoints` existe porque variação relativa de um percentual mente sobre
 * a grandeza: de 5,24% para 4,81% a variação é −8,2% — correto, e ninguém no
 * mercado fala assim. Em pontos percentuais é −0,43.
 */
export function ComparisonBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: ComparisonBlockType;
  loading?: boolean;
  /** Clicar abre o chat sobre este indicador — mesmo gesto do KPI e do gauge. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const format = (v: number) => formattedValue(v, block.format, block.decimals, block.suffix);
  const { current, previous } = block;
  const hasBoth =
    current !== undefined && previous !== undefined
    && Number.isFinite(current) && Number.isFinite(previous);

  const positiveIsGood = block.positiveIsGood ?? true;

  const delta = hasBoth
    ? block.deltaAsPoints
      ? current - previous
      : previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100
    : null;

  const direction = delta === null || delta === 0 ? 'neutral' : delta > 0 ? 'up' : 'down';
  const isGood = direction === 'neutral'
    ? false
    : positiveIsGood ? direction === 'up' : direction === 'down';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  const ink = direction === 'neutral'
    ? 'text-muted-foreground'
    : isGood ? 'text-success' : 'text-destructive';

  const isExpandable = expandable && !loading && hasBoth;

  return (
    <>
    <BlockCard
      loading={loading}
      onExpand={isExpandable ? () => setExpanded(true) : undefined}
      expandLabel={`Analisar ${block.label}`}
    >
      <BlockCardHead label={block.label} />

      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 pr-3.5">
          <p className={cn(BLOCK_SUPPORT, 'mb-1.5')}>{block.currentLabel ?? 'Atual'}</p>
          {loading || !hasBoth ? (
            <BlockValueSkeleton className="h-6 w-20" />
          ) : (
            <p className={cn(BLOCK_SECONDARY_VALUE, 'tabular-nums')}>
              {format(current)}
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1 border-l border-border pl-3.5">
          <p className={cn(BLOCK_SUPPORT, 'mb-1.5')}>{block.previousLabel ?? 'Anterior'}</p>
          {loading || !hasBoth ? (
            <BlockValueSkeleton className="h-6 w-20" />
          ) : (
            <p className={cn(BLOCK_SECONDARY_VALUE, 'tabular-nums text-muted-foreground')}>
              {format(previous)}
            </p>
          )}
        </div>
      </div>

      {!loading && delta !== null && (
        <p className="mt-auto flex items-center gap-1.5 pt-3">
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', ink)}>
            <Icon className="size-3" aria-hidden="true" />
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {formatNumber(Math.abs(delta), block.deltaAsPoints ? (block.decimals ?? 2) : 1)}
            {block.deltaAsPoints ? ' p.p.' : '%'}
          </span>
          <span className={BLOCK_SUPPORT}>
            {direction === 'neutral' ? 'sem variação' : isGood ? 'de melhora' : 'de piora'}
          </span>
        </p>
      )}
    </BlockCard>

    <KpiExpandedModal
      isOpen={expanded}
      onClose={() => setExpanded(false)}
      config={{
        label: block.label,
        icon: ArrowLeftRight,
        value: hasBoth ? format(current) : '—',
        format: (v: number) => format(v),
        // Sem o número anterior a pergunta "melhorou?" não tem resposta.
        context: hasBoth
          ? `${block.previousLabel ?? 'Período anterior'}: ${format(previous)}.`
          : '',
      }}
      sparklineData={[]}
      months={[]}
    />
    </>
  );
}

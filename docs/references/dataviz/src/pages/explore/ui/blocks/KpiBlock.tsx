'use client';

import { useState } from 'react';
import { KpiCard } from '@/widgets/kpi-grid/ui/KpiCard';
import { KpiExpandedModal, type KpiModalConfig } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import { TrendingUp } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/lib/format';
import { parsePtBrNumber } from './parse-number-pt-br';
import type { KpiBlock as KpiBlockType, KpiBlockItem } from '@/shared/config/agents/types';

/** Guess a formatter from the value string */
function guessFormatter(value: string): (v: number) => string {
  if (value.endsWith('%')) return (v: number) => formatPercent(v);
  if (value.includes('R$')) return formatCurrency;
  return (v: number) => formatNumber(v);
}

/**
 * A variação contra o período comparativo — uma leitura só, para o card E para
 * o modal.
 *
 * O `SingleKpiBlock` ganhou essa unificação e este bloco, que monta o MESMO
 * `KpiModalConfig` e abre o MESMO modal, ficou para trás: expandir um item
 * apagava o selo que o card ao lado mostrava.
 */
function itemComparison(item: KpiBlockItem) {
  const parsed = parsePtBrNumber(item.deltaPercent);
  if (parsed === null) return undefined;
  return {
    deltaPercent: parsed,
    direction: item.deltaDirection ?? ('neutral' as const),
    positiveIsGood: item.trendIsPositive ?? true,
  };
}

export function KpiBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: KpiBlockType;
  loading?: boolean;
  /** Clicar abre o modal com histórico e chat sobre o indicador clicado. */
  expandable?: boolean;
}) {
  const [expandedKpi, setExpandedKpi] = useState<{
    config: KpiModalConfig;
    sparklineData: number[];
    months: string[];
  } | null>(null);

  // Antes retornava cedo sem série histórica, e o card não abria nada. Perguntar
  // sobre o indicador não depende de histórico — o modal mostra "Dados
  // históricos não disponíveis" e entrega o chat.
  function handleExpand(item: KpiBlockItem) {
    const comparison = itemComparison(item);
    setExpandedKpi({
      config: {
        label: item.label,
        icon: TrendingUp,
        value: item.value,
        format: guessFormatter(item.value),
        trendBadge: item.trend ? {
          direction: item.trendDirection ?? 'up',
          percent: item.trend,
          positiveIsGood: item.trendIsPositive,
        } : undefined,
        ...(comparison ? { periodComparison: comparison } : {}),
      },
      sparklineData: item.sparklineData ?? [],
      months: item.sparklineMonths ?? [],
    });
  }

  if (!block.items?.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border p-6 text-[11px] text-muted-foreground/40 italic">
        Sem indicadores
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {block.items.map((item, i) => (
          <KpiCard
            key={`${block.id}-${i}`}
            variant="rich"
            loading={loading}
            label={item.label}
            value={item.value}
            icon={TrendingUp}
            glossaryTerm={item.description}
            trendBadge={item.trend ? {
              direction: item.trendDirection ?? 'up',
              percent: item.trend,
              positiveIsGood: item.trendIsPositive,
            } : undefined}
            sparklineData={item.sparklineData}
            sparklineMonths={item.sparklineMonths}
            periodComparison={itemComparison(item)}
            onExpand={expandable ? () => handleExpand(item) : undefined}
            animationIndex={i}
          />
        ))}
      </div>

      <KpiExpandedModal
        isOpen={!!expandedKpi}
        onClose={() => setExpandedKpi(null)}
        config={expandedKpi?.config ?? null}
        sparklineData={expandedKpi?.sparklineData ?? []}
        months={expandedKpi?.months ?? []}
      />
    </>
  );
}

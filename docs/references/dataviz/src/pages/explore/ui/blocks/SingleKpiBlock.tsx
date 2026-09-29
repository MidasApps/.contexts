'use client';

import { useState } from 'react';
import { KpiCard } from '@/widgets/kpi-grid/ui/KpiCard';
import { KpiExpandedModal, type KpiModalConfig } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import {
  TrendingUp,
  Layers,
  Wallet,
  CreditCard,
  AlertTriangle,
  TrendingDown,
  Clock,
  ShieldAlert,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/lib/format';
import { formattedValue } from './formatted-value';
import { parsePtBrNumber } from './parse-number-pt-br';
import type {
  KpiIconName,
  SingleKpiBlock as SingleKpiBlockType,
} from '@/shared/config/agents/types';

/**
 * Nome → ícone. `Record<KpiIconName, …>` é exaustivo nos dois sentidos: falta
 * de entrada e entrada sobrando são erro de compilação, e não um ícone errado
 * aparecendo em silêncio na tela.
 */
const KPI_ICONS: Record<KpiIconName, LucideIcon> = {
  TrendingUp,
  Layers,
  Wallet,
  CreditCard,
  AlertTriangle,
  TrendingDown,
  Clock,
  ShieldAlert,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
};

/**
 * O valor pode não existir ainda.
 *
 * Bloco com `metricId` é preenchido pelo pipeline (`useReportData`) — entre a
 * criação e a chegada do dado, e quando a métrica falha, `value` é `undefined`.
 * Era `string` obrigatório de quando a IA colava o número dentro do bloco; um
 * KPI recém-criado pelo assistente derrubava a página inteira no ErrorBoundary.
 */
const NO_VALUE = '—';

/**
 * O formatador do KPI — do que ele DECLARA, e só depois do que ele parece.
 *
 * A versão anterior só farejava a string já renderizada ("tem R$? é moeda"),
 * e era o que a sparkline e o modal usavam. Funciona enquanto há valor: num
 * card ainda carregando, ou com o traço de vazio, o palpite falha e a série
 * histórica aparecia como número cru — "48200000" embaixo de "R$ 48,2 mi".
 * O bloco tem `format` e `decimals`; usar o palpite tendo a declaração é
 * escolher a fonte pior.
 */
function kpiFormatter(block: SingleKpiBlockType): (v: number) => string {
  if (block.format) return (v: number) => formattedValue(v, block.format, block.decimals);
  const value = block.value;
  if (value?.endsWith('%')) return (v: number) => formatPercent(v);
  if (value?.includes('R$')) return formatCurrency;
  return (v: number) => formatNumber(v);
}

export function SingleKpiBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: SingleKpiBlockType;
  loading?: boolean;
  /** Clicar abre o modal com histórico e chat sobre este indicador. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // O `?? TrendingUp` sobrevive à tipagem porque o bloco vem do Firestore: o
  // tipo garante o nome em quem ESCREVE o template, não em documento antigo já
  // gravado com um nome que não existe mais.
  const Icon = (block.iconName ? KPI_ICONS[block.iconName] : undefined) ?? TrendingUp;
  const positiveIsGood = block.positiveIsGood ?? block.trendIsPositive ?? true;

  const rawValue = parsePtBrNumber(block.value);
  const isAlert =
    block.alertThreshold != null && rawValue != null && rawValue > block.alertThreshold;

  const trendBadge = block.trend
    ? {
        direction: block.trendDirection ?? 'up',
        percent: block.trend,
        positiveIsGood,
      }
    : undefined;

  const format = kpiFormatter(block);

  /**
   * A variação contra o período comparativo — uma leitura só, usada no card e
   * no modal.
   *
   * Era montada inline na prop do card, e o `modalConfig` simplesmente não a
   * tinha: o modal JÁ desenha esse selo ("vs comparativo"), e nunca o recebia.
   * Expandir um KPI fazia a comparação desaparecer da tela ampliada, que é
   * justamente onde se vai olhar com atenção.
   */
  const periodComparison: {
    deltaPercent: number;
    direction: 'up' | 'down' | 'neutral';
    positiveIsGood: boolean;
  } | undefined = block.deltaPercent
    ? (() => {
        const parsed = parsePtBrNumber(block.deltaPercent);
        if (parsed === null) return undefined;
        return {
          deltaPercent: parsed,
          direction: block.deltaDirection ?? ('neutral' as const),
          positiveIsGood,
        };
      })()
    : undefined;

  const modalConfig: KpiModalConfig = {
    label: block.label,
    icon: Icon,
    value: block.value ?? NO_VALUE,
    format,
    trendBadge,
    ...(periodComparison ? { periodComparison } : {}),
  };

  return (
    <>
      <KpiCard
        variant="rich"
        loading={loading}
        label={block.label}
        value={block.value ?? NO_VALUE}
        icon={Icon}
        glossaryTerm={block.glossaryTerm ?? block.description}
        trendBadge={trendBadge}
        /*
         * `[]` = "vem série, ainda sem pontos". Não é preciosismo: o esqueleto
         * do card reserva a faixa de 56px quando `sparklineData !== undefined`,
         * e o documento do Firestore NÃO traz esse campo — ele é dado, e
         * `withoutMaterializedData()` o remove ao salvar. Durante a carga o card
         * só sabe da série por `sparklineMetricId`; sem esta ponte, os 38 KPIs
         * que ganharam trajetória na ADR-0027 crescem 56px cada quando o dado
         * chega, e a página inteira pula. O card real continua exigindo 2
         * pontos para desenhar, então a lista vazia não vira gráfico nenhum.
         */
        sparklineData={block.sparklineData ?? (block.sparklineMetricId ? [] : undefined)}
        sparklineMonths={block.sparklineMonths}
        // Sem isto a série histórica aparecia como número cru no tooltip:
        // "48200000" logo abaixo de um card que exibe "R$ 48,2 mi".
        formatValue={format}
        periodComparison={periodComparison}
        alert={isAlert}
        // A condição era `sparklineData?.length && ...`: sem série histórica o
        // card não abria nada. Na época NENHUM KPI de covenants declarava
        // `sparklineMetricId` (hoje são 38, ADR-0027), então nenhum abria — e a
        // pergunta sobre o indicador não depende de ter histórico. Sem série, o
        // modal já entrega o chat e diz que não há trajetória.
        onExpand={expandable ? () => setExpanded(true) : undefined}
        animationIndex={0}
      />

      <KpiExpandedModal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        config={modalConfig}
        sparklineData={block.sparklineData ?? []}
        months={block.sparklineMonths ?? []}
      />
    </>
  );
}

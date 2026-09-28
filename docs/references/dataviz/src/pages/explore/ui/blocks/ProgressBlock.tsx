'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ComparisonBadge } from './ComparisonBadge';
import { formatNumber } from '@/shared/lib/format';
import { Progress } from '@/shared/ui/progress';
import { KpiExpandedModal } from '@/widgets/kpi-grid/ui/KpiExpandedModal';
import type { ProgressBlock as ProgressBlockType } from '@/shared/config/agents/types';
import {
  BlockCard, BlockCardHead, BlockValue, BlockValueSkeleton, BLOCK_SUPPORT,
} from './block-shell';
import { formattedValue } from './formatted-value';

/**
 * Realizado contra o previsto.
 *
 * O KPI responde "quanto tem". Esta é outra pergunta — "quanto falta" — e não
 * tinha bloco: quem precisava dela escrevia a meta no rótulo do KPI, onde ela
 * não participa de conta nenhuma.
 *
 * A meta é CONFIGURAÇÃO, não dado: vem do contrato, do orçamento, da meta
 * comercial. Só o realizado vem da métrica, e é por isso que só ele vira
 * esqueleto durante o carregamento.
 */
export function ProgressBlock({
  block,
  loading = false,
  expandable = false,
}: {
  block: ProgressBlockType;
  loading?: boolean;
  /** Clicar abre o chat sobre este indicador — mesmo gesto do KPI e do gauge. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const format = (v: number) => formattedValue(v, block.format, block.decimals, block.suffix);
  const value = block.value;
  const hasValue = value !== undefined && Number.isFinite(value);

  // Meta zero não gera percentual — e "Infinity% da meta" é pior que omitir.
  const pct = hasValue && block.target !== 0 ? (value / block.target) * 100 : null;
  const barWidth = pct === null ? 0 : Math.min(Math.max(pct, 0), 100);
  // Acima de 100% a barra satura, mas o número continua contando a verdade.
  const exceeded = pct !== null && pct > 100;

  // Sem valor não há o que perguntar — abrir durante o carregamento mandaria
  // ao chat o zero do template como se fosse o número apurado.
  const isExpandable = expandable && !loading && hasValue;

  /*
   * A barra, numa constante: o card a mostra, e o diálogo de "Ver detalhes"
   * TAMBÉM. Ao expandir, o modal montava só rótulo, número e a meta em prosa —
   * o quanto falta, que no card se vê de relance, virava uma frase para ler.
   */
  const targetBar = (
    <Progress
      className="mt-auto"
      value={pct === null ? null : barWidth}
      aria-label={`${block.label}: progresso até a meta`}
      indicatorClassName={cn(exceeded && 'bg-success')}
    />
  );

  return (
    <>
    <BlockCard
      loading={loading}
      onExpand={isExpandable ? () => setExpanded(true) : undefined}
      expandLabel={`Analisar ${block.label}`}
    >
      <BlockCardHead
        label={block.label}
        support={block.description}
        right={
          pct !== null && !loading ? (
            <span className={cn('text-[11px] font-semibold', exceeded ? 'text-success' : 'text-foreground')}>
              {formatNumber(pct, 0)}%
            </span>
          ) : undefined
        }
      />

      {loading || !hasValue ? (
        <BlockValueSkeleton />
      ) : (
        <div className="flex items-baseline gap-2">
          <BlockValue>{format(value)}</BlockValue>
          <ComparisonBadge
            deltaPercent={block.deltaPercent}
            direction={block.deltaDirection}
          />
        </div>
      )}

      <p className={cn(BLOCK_SUPPORT, 'mb-2 mt-2')}>
        de {format(block.target)} {block.targetLabel ?? 'previstos'}
      </p>

      {/* Uma barra de progresso não é um gráfico: é um controle, e o primitivo
          do Radix é quem já traz os papéis e os `aria-value*` corretos. Chart
          library aqui acrescentaria eixo e tooltip a algo que não tem escala. */}
      {targetBar}
    </BlockCard>

    <KpiExpandedModal
      isOpen={expanded}
      onClose={() => setExpanded(false)}
      config={{
        label: block.label,
        icon: Target,
        value: hasValue ? format(value) : '—',
        format: (v: number) => format(v),
        // A meta é o que dá sentido ao número: "R$ 3,9 mi" não responde
        // "estamos bem?" sem o previsto ao lado.
        context: `Meta: ${format(block.target)} ${block.targetLabel ?? 'previstos'}.`
          + (pct === null ? '' : ` Atingido: ${formatNumber(pct, 0)}%.`),
        // A MESMA barra do card: o quanto falta para a meta se vê, não se lê.
        visual: targetBar,
      }}
      sparklineData={[]}
      months={[]}
    />
    </>
  );
}

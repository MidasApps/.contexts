'use client';

import { ArrowUpRight, ArrowDownRight, CalendarOff, Minus, GitCompare } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/format';
import { parsePtBrNumber } from './parse-number-pt-br';

/**
 * A variação contra o período comparativo — um selo, três blocos.
 *
 * KPI, gauge e progresso reduzem o período a UM número, então respondem à
 * mesma pergunta e devem responder do mesmo jeito. O KPI já tinha o seu selo
 * dentro do `KpiCard`; gauge e progresso não diziam nada sobre o comparativo,
 * porque o arco mede o limite contratado e a barra mede a meta — perguntas
 * diferentes, que não mudam com o período.
 *
 * ⚠️ A cor segue o JUÍZO do bloco, não o sinal do número. Inadimplência que
 * sobe é piora: pintar de verde porque subiu inverteria a leitura. A seta
 * segue o número; a cor, o significado.
 */
export function ComparisonBadge({
  deltaPercent,
  direction,
  positiveIsGood = true,
  className,
}: {
  /** Já formatado pelo pipeline (ex.: "12,3%"). */
  deltaPercent: string | undefined;
  direction: 'up' | 'down' | undefined;
  positiveIsGood?: boolean;
  className?: string;
}) {
  const raw = parsePtBrNumber(deltaPercent);
  if (raw === null) return null;

  const isGood = direction === (positiveIsGood ? 'up' : 'down');
  const isBad = direction === (positiveIsGood ? 'down' : 'up');
  const sign = raw > 0 ? '+' : '';

  return (
    <span
      title="Variação vs período comparativo"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-semibold',
        isGood && 'text-success',
        isBad && 'text-destructive',
        !isGood && !isBad && 'text-muted-foreground',
        className,
      )}
    >
      {direction === 'up' ? <ArrowUpRight className="h-3 w-3" />
        : direction === 'down' ? <ArrowDownRight className="h-3 w-3" />
        : <Minus className="h-3 w-3" />}
      {`${sign}${formatNumber(raw, 1)}%`}
    </span>
  );
}

/**
 * O período que o tracejado do gráfico está mostrando.
 *
 * Irmão do selo acima, e deliberadamente SEM número: um gráfico tem N séries e
 * M pontos, e não existe "a variação" dele — reduzir isso a um percentual no
 * cabeçalho seria inventar um agregado que ninguém pediu. O que falta na tela
 * não é um número, é a identificação do período de lá.
 */
export function PeriodBadge({ band, className }: { band: string | null; className?: string }) {
  if (!band) return null;

  return (
    <span
      title="Período comparativo desenhado em tracejado"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      <GitCompare className="h-3 w-3" strokeWidth={1.5} />
      {`vs ${band}`}
    </span>
  );
}

/**
 * "Este bloco não obedece ao filtro de período."
 *
 * Sem o selo, um gráfico que atravessa 2027 enquanto o filtro diz jan–jun/26
 * parece um erro de dado — e um que PARA em junho parece o mesmo erro pelo
 * motivo oposto. O que distingue os dois casos não está em lugar nenhum da
 * tela; passa a estar aqui.
 */
export function NoPeriodBadge({ className }: { className?: string }) {
  return (
    <span
      title="Projeção: mostra a série inteira, sem o recorte do filtro de período"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      <CalendarOff className="h-3 w-3" strokeWidth={1.5} />
      Projeção
    </span>
  );
}

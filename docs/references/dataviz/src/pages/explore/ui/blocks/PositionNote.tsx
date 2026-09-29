'use client';

import { CalendarOff } from 'lucide-react';
import { formatMonthLabel } from '@/shared/lib/format';

/**
 * "Este bloco não seguiu o período que você escolheu."
 *
 * 52 das 64 métricas do catálogo fixam `data_base_report = MAX(...)` dentro do
 * próprio SQL: são POSIÇÃO, não fluxo — e para um covenant isso é o certo, a
 * pergunta "qual o índice de recebíveis" não tem resposta acumulada. O defeito
 * nunca foi o pin; era a tela não dizer que ele existe. Dois KPIs lado a lado,
 * do mesmo tamanho e com a mesma cara, respondiam de formas opostas ao mesmo
 * filtro, e nada distinguia um do outro.
 *
 * ⚠️ Há DOIS motivos, e a frase muda: a métrica fixada mostra um mês
 * ("posição em jun/26"); a all-time mostra tudo. Dizer "posição em jun/26" num
 * gráfico que exibe abril a julho é afirmação falsa sobre o que está na tela —
 * foi o que a primeira versão desta nota fez com o empilhado de faixas.
 *
 * ⚠️ E o que o regime `posicao` não faz NÃO é "acompanhar o período" — era o
 * que esta nota dizia, e deixou de ser verdade em ADR-0027: o pin calcula o
 * `MAX(data_base_report)` DENTRO da faixa, então o mês exibido é o fim do
 * período escolhido e muda junto com ele. Tanto que `positionMonth()` só
 * acerta o rótulo porque recebe `dateRange.end`. O que ele não faz é acumular
 * a faixa: é um retrato, não uma soma — e é isso que a frase precisa dizer,
 * sob pena de desmentir o mês que ela mesma anuncia.
 *
 * ⚠️ Só aparece quando o usuário RECORTA o período. Sem recorte não há
 * divergência a confessar, e uma nota em 52 dos 64 blocos viraria ruído que
 * ninguém lê — inclusive nas vezes em que ela importa.
 */
export function PositionNote({
  month,
  regime,
}: {
  month: string;
  regime: 'posicao' | 'historico';
}) {
  return (
    // `items-start` e `min-w-0`: num bloco de 2/6 a frase não cabe numa linha,
    // e com `items-center` sem `min-w-0` ela era CORTADA no meio ("…não
    // acompanha o") em vez de quebrar. Meia frase é pior que frase nenhuma —
    // some justamente a parte que diz o que está acontecendo.
    <p className="mt-1 flex items-start gap-1.5 px-1 text-[10px] leading-snug text-muted-foreground/70">
      <CalendarOff className="mt-px h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0">
        {regime === 'posicao'
          ? `Posição em ${formatMonthLabel(month)} — o fim do período, não a faixa inteira`
          : 'Todo o histórico — não acompanha o período'}
      </span>
    </p>
  );
}

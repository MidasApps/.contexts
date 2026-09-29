'use client';

import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Esqueleto de bloco enquanto o dado da métrica não chegou. É carregamento de
 * dado de um relatório já existente, não geração pela IA — por isso não fala
 * em "Na fila" nem "Gerando".
 *
 * Por que existe: sem ele o bloco era desenhado com o template cru, e KPI sem
 * dado vale zero. Num covenant com mínimo de 1,20x, "0,00x" é pintado de
 * VERMELHO — a tela afirmava, por um instante, que o covenant estava rompido.
 * Esqueleto não afirma nada.
 *
 * ─── O esqueleto ocupa a POSIÇÃO do conteúdo real ───
 *
 * Não basta ser uma caixa cinza do tamanho certo: as peças têm de cair onde as
 * de verdade vão cair, senão o card se reorganiza quando o dado chega e a
 * página inteira dá um salto. Depois que os blocos passaram a preencher a
 * altura da linha (`flex-1` em vez de altura fixa), qualquer esqueleto com
 * altura literal ficou fora de posição — por isso todos aqui preenchem.
 */

/** Área de plotagem cartesiana: um retângulo que preenche o espaço todo. */
export function BlockLoadingChart({ height }: { height?: number } = {}) {
  return (
    <div className="h-full w-full" style={height ? { minHeight: height } : undefined} aria-busy="true">
      <Skeleton className="h-full min-h-[120px] w-full rounded-lg bg-muted/40" />
    </div>
  );
}

/**
 * Rosca: anel à esquerda, cards à direita — a mesma repartição do `DonutBlock`.
 *
 * A versão anterior centralizava um círculo de 130px com dois cards ao lado,
 * numa caixa de 180px fixos. Quando o dado chegava, o anel saltava para a
 * esquerda e crescia até a altura do card.
 */
export function BlockLoadingDonut() {
  return (
    <div className="flex h-full min-h-[132px] items-stretch gap-5" aria-busy="true">
      <div className="w-[46%] max-w-[240px] shrink-0">
        <Skeleton className="mx-auto aspect-square h-full max-h-full rounded-full bg-muted/40" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-[58px] w-full rounded-lg bg-muted/40" />
        <Skeleton className="h-[58px] w-full rounded-lg bg-muted/40" />
      </div>
    </div>
  );
}

/**
 * Matriz: uma grade, não um retângulo só.
 *
 * O heatmap usava o esqueleto do gráfico cartesiano — uma caixa cinza inteira
 * onde depois apareciam células separadas por vãos. Grade cinza anuncia grade.
 */
export function BlockLoadingMatrix({ rows = 4, columns = 5 }: { rows?: number; columns?: number } = {}) {
  return (
    <div className="flex h-full min-h-[160px] gap-2" aria-busy="true">
      <Skeleton className="h-full w-12 shrink-0 rounded bg-muted/30" />
      <div
        className="grid h-full flex-1 gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: rows * columns }).map((_, i) => (
          <Skeleton key={i} className="h-full w-full rounded-[3px] bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

/**
 * Série por linha: rótulo e valor em cima, curva embaixo.
 *
 * Espelha o `SparkRowsBlock` depois que a curva ganhou a largura inteira — a
 * geometria anterior (rótulo | curva de 80px | valor, tudo na mesma linha) não
 * existe mais.
 */
export function BlockLoadingSparkRows({ series = 3 }: { series?: number } = {}) {
  return (
    <div className="flex h-full flex-1 flex-col gap-3" aria-busy="true">
      {Array.from({ length: series }).map((_, i) => (
        <div key={i} className="flex min-h-[34px] flex-1 flex-col gap-1.5 border-b border-border pb-2 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-3.5 w-28 rounded bg-muted/40" />
            <Skeleton className="h-3.5 w-16 rounded bg-muted/40" />
          </div>
          <Skeleton className="min-h-0 w-full flex-1 rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

/**
 * Indicadores com meta: rótulo e valor em cima, barra embaixo — por item.
 *
 * O `TargetsBlock` não tinha esqueleto nenhum: durante o carregamento o card
 * ficava com o cabeçalho e um vazio.
 */
export function BlockLoadingTargets({ items = 3 }: { items?: number } = {}) {
  return (
    <div className="flex h-full flex-1 flex-col justify-center gap-4" aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-3 w-32 rounded bg-muted/40" />
            <Skeleton className="h-3 w-14 rounded bg-muted/40" />
          </div>
          <Skeleton className="h-3.5 w-full rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

/**
 * Funil: faixas empilhadas que estreitam — a geometria do `FunnelBlock`.
 *
 * O esqueleto cartesiano (um retângulo só) mentiria aqui: o funil não tem área
 * de plotagem, tem etapas em linhas, e o card se reorganizaria na chegada do
 * dado. A largura decrescente já anuncia o formato antes do número existir.
 */
export function BlockLoadingFunnel({ etapas = 5 }: { etapas?: number } = {}) {
  return (
    <div className="flex h-full flex-1 flex-col justify-center gap-2" aria-busy="true">
      {Array.from({ length: etapas }).map((_, i) => (
        <div key={i} className="flex min-h-0 flex-1 items-center gap-3">
          <Skeleton className="h-3 w-20 shrink-0 rounded bg-muted/40" />
          <Skeleton
            className="h-full min-h-[14px] rounded bg-muted/30"
            style={{ width: `${100 - i * 14}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Treemap: um mosaico, não um retângulo.
 *
 * As proporções são fixas de propósito — um mosaico desigual anuncia o que o
 * bloco desenha (áreas de tamanhos muito diferentes), e o esqueleto não tem
 * como saber as reais antes do dado chegar.
 */
export function BlockLoadingTreemap() {
  return (
    <div className="flex h-full min-h-[140px] gap-1.5" aria-busy="true">
      <Skeleton className="h-full flex-[3] rounded bg-muted/40" />
      <div className="flex flex-[2] flex-col gap-1.5">
        <Skeleton className="w-full flex-[2] rounded bg-muted/35" />
        <div className="flex flex-1 gap-1.5">
          <Skeleton className="h-full flex-1 rounded bg-muted/30" />
          <Skeleton className="h-full flex-1 rounded bg-muted/30" />
        </div>
      </div>
    </div>
  );
}

/**
 * Migração: uma coluna de nós de cada lado, com o vão das fitas no meio.
 *
 * O vão fica vazio de propósito — fita cinza no lugar errado seria pior que
 * vão, porque a posição real depende dos volumes que ainda não chegaram.
 */
export function BlockLoadingSankey({ states = 4 }: { states?: number } = {}) {
  const column = (
    <div className="flex h-full w-16 shrink-0 flex-col gap-3">
      {Array.from({ length: states }).map((_, i) => (
        <Skeleton key={i} className="min-h-0 w-full flex-1 rounded bg-muted/40" />
      ))}
    </div>
  );
  return (
    <div className="flex h-full min-h-[160px] items-stretch gap-4" aria-busy="true">
      {column}
      <Skeleton className="min-h-0 flex-1 rounded bg-muted/15" />
      {column}
    </div>
  );
}

export function BlockLoadingTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col space-y-2" aria-busy="true">
      <Skeleton className="h-9 w-full shrink-0 rounded-lg bg-muted/50" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full shrink-0 rounded bg-muted/40" />
      ))}
    </div>
  );
}

export function BlockLoadingText() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-3/4 bg-muted/40" />
      <Skeleton className="h-4 w-full bg-muted/40" />
      <Skeleton className="h-4 w-2/3 bg-muted/40" />
    </div>
  );
}

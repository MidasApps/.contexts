'use client';

import { useState } from 'react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import { cn } from '@/shared/lib/utils';

/**
 * Cenários de layout — o que só aparece quando as colunas têm alturas diferentes.
 *
 * A linha do relatório é um `grid grid-cols-6`, e grid estica todos os itens até
 * a altura do mais alto. Isso significa que uma coluna de 4/6 com uma tabela de
 * 20 linhas IMPÕE a sua altura a tudo o que estiver ao lado — e uma coluna de
 * 2/6 com três blocos empilhados impõe a soma dos três.
 *
 * O catálogo, que desenha um bloco por vez, não revela nada disso: lá cada
 * bloco tem a altura que quer. É aqui que se vê se ele fica bonito quando NÃO
 * tem — se a plotagem cresce junto ou se o card ganha um vazio embaixo.
 */

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
};

/** Uma coluna da linha: um bloco só, ou vários empilhados. */
export interface ScenarioColumn {
  span: number;
  ids: string[];
}

export interface LayoutScenario {
  title: string;
  /** O que este arranjo põe à prova. */
  proves: string;
  columns: ScenarioColumn[];
}

/**
 * Como os blocos empilhados dividem a altura da coluna.
 *
 * `distribuir` (padrão, decidido pelo produto) dá a cada bloco uma fatia igual:
 * a coluna fica preenchida e as bordas dos cards se alinham com as do vizinho.
 * `natural` os encosta no topo e deixa a sobra embaixo — continua aqui como
 * comparação, porque é a única forma de ver quanto de vazio o outro modo estava
 * escondendo.
 */
type StackingMode = 'distribuir' | 'natural';

export function LayoutScenarios({
  scenarios,
  resolved,
  loading,
  withoutMetric,
}: {
  scenarios: LayoutScenario[];
  resolved: Record<string, CanvasBlock>;
  loading: boolean;
  withoutMetric: Set<string>;
}) {
  const [mode, setMode] = useState<StackingMode>('distribuir');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-popover p-3">
        <span className="text-[11px] font-medium text-muted-foreground">
          Blocos empilhados numa coluna:
        </span>
        {(['distribuir', 'natural'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition-colors',
              mode === m
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/60',
            )}
          >
            {m === 'distribuir' ? 'distribuir (fatias iguais) — padrão' : 'altura natural (sobra embaixo)'}
          </button>
        ))}
      </div>

      <div className="space-y-10">
        {scenarios.map((scenario) => (
          <div key={scenario.title}>
            <p className="text-xs font-medium text-foreground">{scenario.title}</p>
            <p className="mb-2.5 text-[11px] italic text-muted-foreground/80">{scenario.proves}</p>

            <div className="grid grid-cols-6 gap-4">
              {scenario.columns.map((column, i) => (
                <div
                  key={`${scenario.title}-${i}`}
                  className={cn(
                    COL_SPAN_CLASS[column.span],
                    // A coluna é um contêiner: um bloco só ocupa tudo; vários
                    // empilham. Nos dois casos ela tem a altura da linha, que é
                    // a do vizinho mais alto.
                    column.ids.length > 1 && 'flex flex-col gap-4',
                  )}
                >
                  {column.ids.map((id) => {
                    const block = resolved[id];
                    if (!block) return null;
                    return (
                      <div
                        key={id}
                        className={cn(
                          column.ids.length > 1 && mode === 'distribuir' && 'min-h-0 flex-1',
                          column.ids.length === 1 && 'h-full',
                        )}
                      >
                        <CanvasBlockRenderer
                          block={block}
                          loading={loading && !withoutMetric.has(id)}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

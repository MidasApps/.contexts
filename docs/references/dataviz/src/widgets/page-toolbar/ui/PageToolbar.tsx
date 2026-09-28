'use client';

import type { ReactNode } from 'react';
import { Camera, GitCompare, Layers } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';

/**
 * A faixa de controles da página: filtros à esquerda, período e ações à
 * direita.
 *
 * ─── Por que o eixo do tempo inteiro sai da gaveta ───
 *
 * O recorte no tempo vivia só dentro do painel de Filtros. Ele governa TODO
 * número desenhado abaixo, e mesmo assim exigia abrir um painel para se saber
 * qual era — a pergunta "que período é este?" não tinha resposta na tela.
 *
 * O período saiu primeiro; os outros dois controles do mesmo eixo vieram junto
 * depois, porque separá-los não fazia sentido: o MODO diz se a consulta pega só
 * o mês final ou a faixa inteira, e a COMPARAÇÃO diz contra que outro período
 * ela está sendo desenhada.
 *
 * O rótulo do modo descreve o RECORTE, não o resultado. Ele já disse
 * "Acumulado", que prometia soma — verdade em 4 dos 9 blocos que o modo alcança
 * (as métricas de transação, que somam o período) e falso nos outros 4, que
 * agrupam por mês e devolveriam uma barra por mês. Somar aqueles contaria o
 * mesmo contrato uma vez por snapshot. O que o período significa é do bloco; o
 * controle só diz que fatia do tempo entra na consulta. Os três respondem à mesma
 * pergunta — "que recorte de tempo estou vendo?" — e agora respondem no mesmo
 * lugar.
 *
 * ⚠️ Os três não alcançam a mesma coisa, e a tela não diz isso. Das 66 métricas
 * do catálogo, 14 obedecem à FAIXA inteira, 45 fixam
 * `data_base_report = MAX(... WHERE {filter.ate})` — seguem o FIM do período,
 * não a faixa — e 7 não têm cláusula de data nenhuma. Logo: mexer no fim do
 * período muda 59; mexer no início muda 14; alternar Último mês/Todo o período muda
 * 9 (as que obedecem à faixa e não são série). Ver
 * `period-sensitivity.ts`.
 */
export function PageToolbar({
  filters,
  actions,
  className,
}: {
  /** Dropdowns de filtro da página (`PageFilterBar`). */
  filters?: ReactNode;
  /** Editar/Salvar/Cancelar, exportar — o que a página oferece. */
  actions?: ReactNode;
  className?: string;
}) {
  let ctx: ReturnType<typeof useDataFilters> | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
  try { ctx = useDataFilters(); } catch {}

  /*
   * Sem as datas do dataset não há faixa que se possa oferecer, e um seletor
   * vazio convidaria a escolher sem obedecer. `?.` porque o provider entrega
   * `dataBaseOptions` só depois da primeira carga — antes disso o campo pode
   * nem existir no contexto.
   */
  const hasDates = Boolean(ctx?.dataBaseOptions?.length);

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div>

      <div className="flex shrink-0 items-center gap-2">
        {hasDates && (
          /*
           * `aria-pressed` e não `role="radiogroup"`: os dois são escolha
           * exclusiva, mas radiogroup obriga navegação por setas com
           * tabindex móvel, e aqui Tab entre dois botões é o que já funciona.
           * O que faltava era o ESTADO — sem ele o modo corrente só existia no
           * realce `bg-primary/15`, invisível para quem não vê a cor.
           */
          <div role="group" aria-label="Modo de visualização" className="flex items-center rounded-full border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              aria-pressed={ctx!.viewMode === 'snapshot'}
              onClick={() => ctx!.setViewMode('snapshot')}
              title="Só o mês final do período"
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                ctx!.viewMode === 'snapshot'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:text-muted-foreground',
              )}
            >
              <Camera className="h-3 w-3" strokeWidth={1.5} />
              {/*
                `sr-only sm:not-sr-only` e não `hidden sm:inline`: abaixo de
                `sm` o `hidden` tirava o texto da árvore de acessibilidade e o
                botão virava um ícone sem nome — o leitor de tela caía no
                `title`, que descreve o recorte e não nomeia o controle. Assim o
                nome é o mesmo em qualquer largura, e o visual não muda: o
                `sr-only` é posicionado absoluto, logo sai do fluxo do flex.
              */}
              <span className="sr-only sm:not-sr-only">Último mês</span>
            </button>
            <button
              type="button"
              aria-pressed={ctx!.viewMode === 'accumulated'}
              onClick={() => ctx!.setViewMode('accumulated')}
              title="O período inteiro: soma nos indicadores de fluxo, mês a mês nos de série"
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                ctx!.viewMode === 'accumulated'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:text-muted-foreground',
              )}
            >
              <Layers className="h-3 w-3" strokeWidth={1.5} />
              <span className="sr-only sm:not-sr-only">Todo o período</span>
            </button>
          </div>
        )}

        {hasDates && (
          <MonthRangePicker
            startDate={ctx!.dateRange?.start ?? ''}
            endDate={ctx!.dateRange?.end ?? ''}
            onRangeChange={(start, end) => ctx!.setDateRange({ start, end })}
            minDate={ctx!.dataBaseOptions.at(-1)?.value}
            maxDate={ctx!.dataBaseOptions[0]?.value}
            placeholder="Período"
          />
        )}

        {/* O período comparativo só aparece com a comparação ligada — é ele que
            responde "contra o quê", e sem ele o botão liga um modo que o
            usuário não tem como configurar sem abrir outra tela. */}
        {ctx?.compareEnabled && hasDates && (
          <>
            <span aria-hidden="true" className="text-[10px] font-medium text-muted-foreground">vs</span>
            <MonthRangePicker
              startDate={ctx.comparePeriod?.start ?? ''}
              endDate={ctx.comparePeriod?.end ?? ''}
              onRangeChange={(start, end) => ctx!.setComparePeriod({ start, end })}
              minDate={ctx.dataBaseOptions.at(-1)?.value}
              maxDate={ctx.dataBaseOptions[0]?.value}
              label="comparativo"
              placeholder="Selecionar período"
            />
          </>
        )}

        {hasDates && (
          <button
            type="button"
            aria-pressed={ctx!.compareEnabled}
            onClick={() => ctx!.setCompareEnabled(!ctx!.compareEnabled)}
            title="Comparar com outro período"
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              ctx!.compareEnabled
                ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <GitCompare className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="sr-only sm:not-sr-only">Comparar</span>
          </button>
        )}

        {actions}
      </div>
    </div>
  );
}

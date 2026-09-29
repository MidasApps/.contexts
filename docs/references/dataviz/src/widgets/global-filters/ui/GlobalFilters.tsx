'use client';

import { useState } from 'react';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { Settings2, GitCompare, Layers, Camera } from 'lucide-react';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { FilterPanel } from '@/widgets/filter-panel';
import { TopbarClientSwitcher } from '@/widgets/client-switcher';
import { cn } from '@/shared/lib/utils';

interface GlobalFiltersProps {
  pageTitle?: string;
}

/**
 * ⚠️ Cópia paralela do eixo do tempo — e HOJE ela não chega à tela.
 *
 * Os dois únicos call sites passam pelo `CanvasPanel`, que só monta este
 * widget quando `!authoring && showFilters`: o `TemplateEditorPage` usa
 * `authoring` (e cai no `BlockPalette`), e a `ReportPage` passa
 * `showFilters={false}` para não duplicar o que já vive no `AppHeader`. Não
 * sobrou caminho.
 *
 * A cópia viva é a `PageToolbar`. Antes de reativar este widget, prefira
 * apagá-lo: manter dois desenhos do mesmo estado é como o rótulo "Acumulado"
 * sobreviveu num lugar depois de trocado no outro. O que ainda diverge da
 * `PageToolbar`: sem `aria-pressed`, sem grupo nomeado, e o rótulo some abaixo
 * de `sm` (`hidden sm:inline`) deixando botão de ícone sem nome acessível.
 */
export function GlobalFilters({ pageTitle }: GlobalFiltersProps) {
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  let ctx: ReturnType<typeof useDataFilters> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
    ctx = useDataFilters();
  } catch {
    return null;
  }

  const minDate = ctx.dataBaseOptions.at(-1)?.value;
  const maxDate = ctx.dataBaseOptions[0]?.value;

  return (
    <>
      <div className="flex flex-1 items-center gap-2">
        {/* Left: Client switcher (topbar) */}
        <TopbarClientSwitcher />

        {/* Subtle separator */}
        <div className="hidden sm:block h-5 w-px bg-muted/70 mx-1 shrink-0" />

        {/* Filtros button */}
        <button
          onClick={() => setFilterPanelOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ajustes</span>
        </button>

        <div className="flex-1" />

        {/* Right: View mode + Compare toggle + Compare period + Date dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Último mês / Todo o período */}
          <div className="flex items-center rounded-full border border-border bg-muted/40 p-0.5 shrink-0">
            <button
              onClick={() => ctx!.setViewMode('snapshot')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                ctx.viewMode === 'snapshot'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
              title="Só o mês final do período"
            >
              <Camera className="h-3 w-3" strokeWidth={1.5} />
              <span className="hidden sm:inline">Último mês</span>
            </button>
            <button
              onClick={() => ctx!.setViewMode('accumulated')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                ctx.viewMode === 'accumulated'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
              title="O período inteiro: soma nos indicadores de fluxo, mês a mês nos de série"
            >
              <Layers className="h-3 w-3" strokeWidth={1.5} />
              <span className="hidden sm:inline">Todo o período</span>
            </button>
          </div>
          {ctx.dateRange.start && ctx.dateRange.end && (
            <MonthRangePicker
              startDate={ctx.dateRange.start}
              endDate={ctx.dateRange.end}
              onRangeChange={(start, end) => ctx!.setDateRange({ start, end })}
              minDate={minDate}
              maxDate={maxDate}
            />
          )}
          {ctx.compareEnabled && (
            <>
              <span className="text-[10px] text-muted-foreground font-medium">vs</span>
              <MonthRangePicker
                startDate={ctx.comparePeriod?.start ?? ''}
                endDate={ctx.comparePeriod?.end ?? ''}
                onRangeChange={(start, end) => ctx!.setComparePeriod({ start, end })}
                minDate={minDate}
                maxDate={maxDate}
                label="comparativo"
                placeholder="Selecionar período"
              />
            </>
          )}
          <button
            onClick={() => ctx!.setCompareEnabled(!ctx!.compareEnabled)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors shrink-0',
              ctx.compareEnabled
                ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            title="Comparar com outro período"
          >
            <GitCompare className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Comparar</span>
          </button>
        </div>
      </div>

      {/* Filter panel overlay */}
      <FilterPanel
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        pageTitle={pageTitle}
      />
    </>
  );
}

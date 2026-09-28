'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { FilterPanel } from '@/widgets/filter-panel';

interface FiltersButtonProps {
  pageTitle?: string;
  className?: string;
}

/**
 * Abre o painel de Ajustes.
 *
 * ─── Duas coisas que saíram daqui ───
 *
 * **O contador.** Somava "modo de visualização fora do padrão" e "comparação
 * ligada" — os dois controles que se mudaram para a barra da página, junto do
 * período. Mantê-lo faria o botão anunciar dois ajustes ativos e abrir um
 * painel onde nenhum dos dois existe. O que sobrou lá dentro (testar como
 * usuário, modo debug, exportar PDF) não é estado que valha um selo na tela.
 *
 * **A sonda de `useDataFilters()`.** O botão chamava o hook dentro de um
 * try/catch, descartava o resultado e usava o `catch` para não se montar fora
 * do `<DataProvider>` — porque o painel lia o contexto. Não lê mais. A
 * dependência restante só sabia esconder UI que funcionaria, e custava um
 * `eslint-disable` de `rules-of-hooks`.
 */
export function FiltersButton({ pageTitle, className }: FiltersButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5',
          'text-[11px] font-medium text-muted-foreground transition-colors',
          'hover:bg-muted/50 hover:text-foreground',
          className,
        )}
      >
        <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        {/* `sr-only` e não `hidden`: abaixo de `sm` o `hidden` deixava um botão
            de ícone puro, sem nome acessível nenhum — nem `title` havia. */}
        <span className="sr-only sm:not-sr-only">Ajustes</span>
      </button>
      <FilterPanel open={open} onClose={() => setOpen(false)} pageTitle={pageTitle} />
    </>
  );
}

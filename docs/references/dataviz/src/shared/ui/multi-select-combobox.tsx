'use client';

import { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';

interface MultiSelectComboboxProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /**
   * Rótulo plural usado no trigger quando há múltiplos itens selecionados
   * (ex: "3 bancos"). Default preserva o comportamento original do
   * componente (uso em Empreendimentos).
   */
  itemLabelPlural?: string;
  /** Rótulo do trigger quando todos os itens estão selecionados. Default: "Todos os {itemLabelPlural}". */
  allSelectedLabel?: string;
  /** Rótulo do trigger quando nada está selecionado. Default: "Nenhum selecionado". */
  noneSelectedLabel?: string;
  /**
   * Se true (default), o trigger fica com borda de alerta quando nada está
   * selecionado — comportamento original (Empreendimentos: 0 selecionado é
   * um estado a chamar atenção). Desative para filtros opcionais onde
   * "nada selecionado" é o estado normal (sem filtro = todos os valores).
   */
  warnOnEmpty?: boolean;
}

function getTriggerLabel(
  selected: string[],
  total: number,
  itemLabelPlural: string,
  allSelectedLabel?: string,
  noneSelectedLabel = 'Nenhum selecionado',
): string {
  if (selected.length === 0) return noneSelectedLabel;
  if (selected.length === total) return allSelectedLabel ?? `Todos os ${itemLabelPlural}`;
  if (selected.length === 1) return selected[0];
  return `${selected.length} ${itemLabelPlural}`;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  searchPlaceholder = 'Buscar empreendimentos...',
  itemLabelPlural = 'empreendimentos',
  allSelectedLabel,
  noneSelectedLabel,
  warnOnEmpty = true,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(lower));
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleItem = useCallback(
    (item: string) => {
      const next = selectedSet.has(item)
        ? selected.filter((s) => s !== item)
        : [...selected, item];
      onChange(next);
    },
    [selected, selectedSet, onChange],
  );

  const selectOnly = useCallback(
    (item: string) => {
      onChange([item]);
    },
    [onChange],
  );

  const selectAll = useCallback(() => onChange([...options]), [options, onChange]);
  const selectNone = useCallback(() => onChange([]), [onChange]);

  const triggerLabel = getTriggerLabel(selected, options.length, itemLabelPlural, allSelectedLabel, noneSelectedLabel);
  const isWarning = warnOnEmpty && selected.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-auto min-w-[140px] max-w-[220px] justify-between gap-2 px-3 text-sm font-normal',
            isWarning && 'border-destructive/50 text-destructive',
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3 pb-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="max-h-[200px] overflow-y-auto px-1">
          {filtered.map((item) => {
            const isSelected = selectedSet.has(item);
            return (
              <div
                key={item}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-transparent',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate text-sm">{item}</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectOnly(item)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all md:opacity-0 max-md:opacity-60"
                >
                  somente
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhum resultado
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Nenhum
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

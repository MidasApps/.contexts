'use client';

import { useState, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface MonthRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
  minDate?: string;
  maxDate?: string;
  /**
   * Qualifica QUE período este seletor governa — "comparativo", por exemplo.
   * Vira o começo do nome acessível do gatilho; omitido, ele se chama "Período
   * analisado".
   *
   * Existe porque a `PageToolbar` monta dois destes lado a lado. Visualmente a
   * posição resolve (o segundo vem depois de um "vs"), mas o nome de ambos era
   * só a faixa de datas que exibem — e duas faixas iguais, ou duas vazias,
   * davam dois botões homônimos. A prop era declarada e nunca renderizada.
   */
  label?: string;
  placeholder?: string;
}

/** Returns numeric key YYYYMM for easy comparison */
function toKey(year: number, month: number): number {
  return year * 100 + month;
}

function keyFromStr(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number);
  return y * 100 + (m - 1);
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function formatTriggerLabel(start: string, end: string): string {
  const s = parseYearMonth(start);
  const e = parseYearMonth(end);
  const fmt = (ym: { year: number; month: number }) =>
    `${MONTHS[ym.month].toLowerCase()}/${ym.year}`;
  if (s.year === e.year && s.month === e.month) return fmt(s);
  return `${fmt(s)} — ${fmt(e)}`;
}

export function MonthRangePicker({
  startDate,
  endDate,
  onRangeChange,
  minDate = startDate || '2020-01-01',
  maxDate = endDate || '2030-12-31',
  label,
  placeholder,
}: MonthRangePickerProps) {
  const isEmpty = !startDate || !endDate;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() =>
    isEmpty ? new Date().getFullYear() : parseYearMonth(endDate).year
  );
  // null = hasn't picked start yet; string = picked start, waiting for end
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const minKey = keyFromStr(minDate);
  const maxKey = keyFromStr(maxDate);
  const startKey = isEmpty ? -1 : keyFromStr(startDate);
  const endKey = isEmpty ? -1 : keyFromStr(endDate);

  // Compute visual range
  let rangeMin: number;
  let rangeMax: number;

  if (anchor !== null) {
    // Picking end — show preview from anchor to hovered
    const target = hovered ?? anchor;
    rangeMin = Math.min(anchor, target);
    rangeMax = Math.max(anchor, target);
  } else {
    // Committed range
    rangeMin = startKey;
    rangeMax = endKey;
  }

  const handleMonthClick = useCallback(
    (year: number, month: number) => {
      const key = toKey(year, month);

      if (anchor === null) {
        // First click — set anchor
        setAnchor(key);
      } else {
        // Second click — commit range
        const lo = Math.min(anchor, key);
        const hi = Math.max(anchor, key);
        const loYear = Math.floor(lo / 100);
        const loMonth = lo % 100;
        const hiYear = Math.floor(hi / 100);
        const hiMonth = hi % 100;
        onRangeChange(lastDayOfMonth(loYear, loMonth), lastDayOfMonth(hiYear, hiMonth));
        setAnchor(null);
        setHovered(null);
        setOpen(false);
      }
    },
    [anchor, onRangeChange],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setAnchor(null);
        setHovered(null);
        setViewYear(isEmpty ? new Date().getFullYear() : parseYearMonth(endDate).year);
      }
    },
    [endDate, isEmpty],
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
            'border-border bg-muted/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
          {/* Só para leitor de tela: na tela quem qualifica o seletor é a
              vizinhança (o "vs" antes do comparativo), que não existe no nome
              acessível. `sr-only` e não `aria-label` porque um aria-label
              SUBSTITUI o conteúdo — o nome perderia a faixa selecionada, que é
              a informação principal do botão. */}
          <span className="sr-only">{label ? `Período ${label}: ` : 'Período analisado: '}</span>
          <span className={cn('truncate', isEmpty && 'text-muted-foreground/60')}>{isEmpty ? (placeholder ?? 'Selecionar período') : formatTriggerLabel(startDate, endDate)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 border-border bg-popover"
        align="end"
        sideOffset={8}
      >
        {/* Year navigation */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            disabled={toKey(viewYear - 1, 11) < minKey}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 hover:bg-muted/70 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="text-sm font-semibold text-foreground">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            disabled={toKey(viewYear + 1, 0) > maxKey}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 hover:bg-muted/70 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Hint */}
        <p className="px-4 pb-2 text-[11px] text-muted-foreground/80">
          {anchor === null ? 'Selecione o mês inicial' : 'Selecione o mês final'}
        </p>

        {/* Month grid */}
        <div
          role="grid"
          className="grid grid-cols-4 gap-0 px-2 pb-3"
          onMouseLeave={() => setHovered(null)}
        >
          {MONTHS.map((name, i) => {
            const key = toKey(viewYear, i);
            const isDisabled = key < minKey || key > maxKey;

            const isAnchor = anchor === key;
            const isRangeStart = key === rangeMin;
            const isRangeEnd = key === rangeMax;
            const isInRange = key >= rangeMin && key <= rangeMax;
            const isEndpoint = isRangeStart || isRangeEnd;

            // Position classes for range background stretching
            const isFirstCol = i % 4 === 0;
            const isLastCol = i % 4 === 3;

            return (
              <div
                key={i}
                className="relative flex items-center justify-center"
              >
                {/* Range background bar */}
                {isInRange && !isDisabled && (
                  <div
                    className={cn(
                      'absolute inset-y-0.5 bg-primary/15',
                      isRangeStart && isRangeEnd && 'inset-x-1 rounded-md',
                      isRangeStart && !isRangeEnd && (isLastCol ? 'left-1 right-0 rounded-l-md' : 'left-1 right-0 rounded-l-md'),
                      isRangeEnd && !isRangeStart && (isFirstCol ? 'left-0 right-1 rounded-r-md' : 'left-0 right-1 rounded-r-md'),
                      !isRangeStart && !isRangeEnd && 'inset-x-0',
                    )}
                  />
                )}

                {/* Month button */}
                <button
                  type="button"
                  role="gridcell"
                  disabled={isDisabled}
                  aria-selected={isEndpoint}
                  onClick={() => handleMonthClick(viewYear, i)}
                  onMouseEnter={() => {
                    if (!isDisabled && anchor !== null) {
                      setHovered(key);
                    }
                  }}
                  className={cn(
                    'relative z-10 w-full rounded-md px-2 py-2 text-xs font-medium transition-all',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
                    /*
                     * Indisponível ainda precisa ser LIDO: a 20% de opacidade
                     * o mês virava um borrão, e quem procura "Jan" não sabia
                     * se ele não existe ou se some no fundo.
                     */
                    isDisabled && 'cursor-not-allowed text-muted-foreground/45',
                    !isDisabled && !isEndpoint && 'text-foreground/75 hover:bg-muted/70 hover:text-foreground',
                    // Dentro da faixa: laranja ESCURO (o token de texto), não o
                    // vivo do preenchimento — este dava 2,9:1 sobre a faixa.
                    !isDisabled && isInRange && !isEndpoint && 'text-accent-foreground',
                    /*
                     * Extremos em pílula NEUTRA, e não laranja com texto preto.
                     *
                     * O laranja vivo com preto por cima é legível (5,8:1) mas
                     * lê como fita de advertência, e em dois chips lado a lado
                     * ele rouba a cena de um controle que é secundário. Aqui a
                     * marca fica na FAIXA — que é o que o controle seleciona —
                     * e os extremos ganham o contraste máximo (20:1) de uma
                     * pílula escura. Mesma inversão funciona no tema escuro,
                     * onde `foreground` é claro.
                     */
                    isEndpoint && !isDisabled && 'bg-foreground text-background font-semibold shadow-sm',
                    isAnchor && 'ring-2 ring-primary/40',
                  )}
                >
                  {name}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer: current selection */}
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/80">
            {anchor !== null
              ? `De ${MONTHS[anchor % 100]}/${Math.floor(anchor / 100)}`
              : isEmpty
                ? 'Selecione o período'
                : formatTriggerLabel(startDate, endDate)
            }
          </span>
          {anchor !== null && (
            <button
              onClick={() => { setAnchor(null); setHovered(null); }}
              className="text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { flexRender, type Row, type Table as TanstackTable } from '@tanstack/react-table';
import { ArrowUpDown, Download, Settings2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { EmptyState } from '@/shared/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/ui/table';

/**
 * A tabela em si — cabeçalho ordenável, linhas e a linha de total.
 *
 * Existe porque o diálogo de "Ver detalhes" montava a SUA PRÓPRIA tabela: as
 * mesmas linhas, sem nada em volta. Sumiam a ordenação por coluna, o CSV, a
 * escolha de colunas e o "Total geral" — justamente na tela que existe para
 * examinar o dado com calma. Duas montagens da mesma coisa divergem, e foi o
 * que aconteceu.
 *
 * Quem decide QUAIS linhas passa por `rows`: o card manda as da página, o
 * diálogo manda todas.
 */

/** Primeira coluna fixa na rolagem horizontal. */
const FIXED_COLUMN = 'sticky left-0 z-10 bg-popover shadow-[2px_0_4px_rgba(0,0,0,0.3)]';

export function DataTableBody<TData>({
  table,
  rows,
  loading,
  footerRow,
  stickyFirstColumn,
}: {
  table: TanstackTable<TData>;
  /** As linhas a desenhar — paginadas no card, todas no diálogo. */
  rows: Row<TData>[];
  loading?: boolean;
  footerRow?: Record<string, string | number>;
  stickyFirstColumn?: boolean;
}) {
  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((grupo) => (
          <TableRow key={grupo.id} className="border-b border-border hover:bg-transparent">
            {grupo.headers.map((header, i) => (
              <TableHead
                key={header.id}
                className={cn(
                  'h-10 text-xs font-semibold text-muted-foreground tracking-wider uppercase whitespace-nowrap',
                  stickyFirstColumn && i === 0 && FIXED_COLUMN,
                )}
              >
                {header.isPlaceholder ? null : (
                  <button
                    className={cn(
                      'flex items-center gap-1',
                      header.column.getCanSort()
                        && 'cursor-pointer select-none transition-colors duration-150 hover:text-foreground',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />
                    )}
                  </button>
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>

      <TableBody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i} className="border-b border-border">
              {visibleColumns.map((_c, j) => (
                <TableCell key={j}><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
              ))}
            </TableRow>
          ))
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={visibleColumns.length} className="p-0">
              <EmptyState className="py-8" />
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              className="h-11 border-b border-border transition-colors duration-300 hover:bg-muted/40"
            >
              {row.getVisibleCells().map((cell, i) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'text-sm whitespace-nowrap',
                    stickyFirstColumn && i === 0 && FIXED_COLUMN,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}

        {footerRow && (
          <TableRow className="h-11 border-t border-border bg-muted/50 font-semibold">
            {visibleColumns.map((column, i) => {
              const key = (column.columnDef as { accessorKey?: string }).accessorKey;
              return (
                <TableCell
                  key={column.id}
                  className={cn(
                    'text-sm whitespace-nowrap text-foreground',
                    stickyFirstColumn && i === 0 && FIXED_COLUMN,
                  )}
                >
                  {key ? (footerRow[key] ?? '') : ''}
                </TableCell>
              );
            })}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/**
 * Exportar e escolher colunas — as ações que valem no card E no diálogo.
 *
 * "Ver detalhes" não está aqui de propósito: ele abre o diálogo, e dentro dele
 * não teria para onde levar.
 */
export function TableActions<TData>({
  table,
  exportable,
  onExportCSV,
  visibilityOpen,
  onToggleVisibility,
  dropdownRef,
}: {
  table: TanstackTable<TData>;
  exportable: boolean;
  onExportCSV: () => void;
  visibilityOpen: boolean;
  onToggleVisibility: () => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {exportable && (
        <button
          onClick={onExportCSV}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Exportar CSV"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      )}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={onToggleVisibility}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Colunas visíveis"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        {visibilityOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-popover p-2 shadow-xl">
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Colunas
            </p>
            {table.getAllLeafColumns().map((column) => (
              <label
                key={column.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                  className="h-3.5 w-3.5 rounded border-border bg-transparent accent-primary"
                />
                <span className="truncate">
                  {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

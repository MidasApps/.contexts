'use client';

import {
  type ColumnDef,
  type PaginationState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { cn } from '@/shared/lib/utils';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AISidebar } from '@/widgets/ai-sidebar';
import { DataTableBody, TableActions } from './DataTableBody';

interface DataTableWidgetProps<TData, TValue> {
  title?: string;
  subtitle?: string;
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  className?: string;
  footerRow?: Record<string, string | number>;
  pageSize?: number;
  stickyFirstColumn?: boolean;
  initialHiddenColumns?: string[];
  /** CSV export button — default true */
  exportable?: boolean;
  /** Fields unavailable in client schema — columns with these accessorKeys will be hidden */
  unavailableFields?: string[];
}

export function DataTableWidget<TData, TValue>({
  title,
  subtitle,
  columns,
  data,
  loading,
  className,
  footerRow,
  pageSize,
  stickyFirstColumn,
  initialHiddenColumns,
  exportable = true,
  unavailableFields,
}: DataTableWidgetProps<TData, TValue>) {
  const [expanded, setExpanded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? (data.length || 1),
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (!initialHiddenColumns) return {};
    return initialHiddenColumns.reduce<VisibilityState>((acc, col) => {
      acc[col] = false;
      return acc;
    }, {});
  });
  const visibleColumns = useMemo(() => {
    if (!unavailableFields?.length) return columns;
    const unavailableSet = new Set(unavailableFields);
    return columns.filter(col => {
      const key = (col as { accessorKey?: string }).accessorKey;
      return !key || !unavailableSet.has(key);
    });
  }, [columns, unavailableFields]);

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visibilityOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setVisibilityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visibilityOpen]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is known-incompatible with compiler memoisation; the React Compiler is not enabled
  const table = useReactTable({
    data,
    columns: visibleColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize != null && {
      getPaginationRowModel: getPaginationRowModel(),
      onPaginationChange: setPagination,
    }),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
      ...(pageSize != null && { pagination }),
    },
  });

  function handleExportCSV() {
    const visibleColumns = table.getVisibleLeafColumns();
    const headers = visibleColumns.map((col) => {
      const header = col.columnDef.header;
      return typeof header === 'string' ? header : col.id;
    });

    const rows = table.getPrePaginationRowModel().rows.map((row) =>
      row.getVisibleCells().map((cell) => {
        const value = cell.getValue();
        const str = value == null ? '' : String(value);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
    );

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'dados'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      onClick={title ? (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, select, [role="button"], [data-no-expand]')) return;
        setExpanded(true);
      } : undefined}
      className={cn('group relative h-full', title && 'cursor-pointer [&_*]:!cursor-pointer')}
    >
    {/*
      `h-full` na casca: a linha do relatório é um grid que estica todos os
      itens até a altura do mais alto, e uma tabela de 4/6 ao lado de uma coluna
      com três blocos empilhados recebe uma célula alta. Sem isto o Card ficava
      na altura natural das dez linhas e deixava uma faixa branca embaixo —
      dentro de uma célula que já tinha o tamanho certo.
    */}
    <Card
      // Hover em cinza, igual aos demais cards do relatório — ver `block-shell`.
      className={cn(className, 'h-full transition-colors duration-300 group-hover:border-muted-foreground/40')}
    >
      {title && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                {title}
              </CardTitle>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Ver detalhes
                <ExternalLink className="h-3 w-3" />
              </button>
              <TableActions
                table={table}
                exportable={exportable}
                onExportCSV={handleExportCSV}
                visibilityOpen={visibilityOpen}
                onToggleVisibility={() => setVisibilityOpen((v) => !v)}
                dropdownRef={dropdownRef}
              />
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(!title && 'pt-4')}>
        <div className="overflow-x-auto">
          <DataTableBody
            table={table}
            rows={table.getRowModel().rows}
            loading={loading}
            footerRow={footerRow}
            stickyFirstColumn={stickyFirstColumn}
          />
        </div>

        {pageSize != null && !loading && data.length > 0 && (() => {
          const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
          const totalRows = table.getFilteredRowModel().rows.length;
          const start = pageIndex * currentPageSize + 1;
          const end = Math.min((pageIndex + 1) * currentPageSize, totalRows);

          return (
            <div className="flex items-center justify-between border-t border-border pt-3 mt-3 text-sm text-muted-foreground">
              <span>
                Mostrando {start}&ndash;{end} de {totalRows}
              </span>

              <div className="flex items-center gap-3">
                <select
                  value={currentPageSize}
                  onChange={(e) => {
                    table.setPageSize(Number(e.target.value));
                    table.setPageIndex(0);
                  }}
                  className="h-8 rounded-md border border-border bg-transparent px-2 text-sm text-muted-foreground outline-none hover:bg-muted/50 transition-colors"
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size} value={size} className="bg-popover text-foreground">
                      {size} / página
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </CardContent>

      {/* Expanded modal with AI */}
      {title && (
        <Dialog open={expanded} onOpenChange={() => setExpanded(false)}>
          {/* Tabela e conversa lado a lado, como no gráfico e no KPI: empilhados,
              a tabela ficava espremida em 45% da altura e a conversa começava
              abaixo da dobra — para ler a resposta era preciso perder de vista
              o dado sobre o qual se perguntou. Abaixo de `lg` não cabem duas
              colunas legíveis, então volta a empilhar. */}
          <DialogContent className="w-[94vw] max-w-[1440px] lg:w-[88vw] bg-popover p-0 gap-0 h-[90vh] max-h-[860px]">
            <div className="flex h-full flex-col overflow-hidden lg:flex-row">
              {/* Tabela */}
              <div className="flex h-[45%] min-h-0 min-w-0 shrink-0 flex-col border-b border-border p-5 pb-3 lg:h-full lg:flex-1 lg:shrink lg:border-b-0 lg:border-r">
                <DialogHeader className="shrink-0 pb-3">
                  {/* As acoes vem junto: exportar e escolher colunas valem
                      tanto aqui quanto no card, e era o dialogo — a tela de
                      examinar com calma — que ficava sem elas. `pr-10` abre
                      espaco para o botao de fechar, que e absoluto no canto. */}
                  <div className="flex items-start justify-between gap-2 pr-10">
                    <div className="min-w-0">
                      <DialogTitle className="text-foreground">{title}</DialogTitle>
                      {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <TableActions
                        table={table}
                        exportable={exportable}
                        onExportCSV={handleExportCSV}
                        visibilityOpen={visibilityOpen}
                        onToggleVisibility={() => setVisibilityOpen((v) => !v)}
                        dropdownRef={dropdownRef}
                      />
                    </div>
                  </div>
                </DialogHeader>
                {/* Rola em vez de paginar: aqui o espaco e a tela inteira, e
                    trocar de pagina para comparar duas faixas e pior que rolar. */}
                <div className="min-h-0 flex-1 overflow-auto">
                  <DataTableBody
                    table={table}
                    rows={table.getPrePaginationRowModel().rows}
                    loading={loading}
                    footerRow={footerRow}
                    stickyFirstColumn={stickyFirstColumn}
                  />
                </div>
              </div>

              {/* Conversa. `pt-6` no topo da coluna: o botão de fechar do
                  diálogo é absoluto no canto superior direito, e a primeira
                  mensagem passava por baixo dele. */}
              <div className="flex min-h-0 flex-1 flex-col pt-6 lg:h-full lg:w-[420px] lg:flex-none xl:w-[460px]">
                {expanded && (
                  <AISidebar
                    open={expanded}
                    onClose={() => {}}
                    embedded
                    initialPrompt={`Analise a tabela "${title}"${subtitle ? ` (${subtitle})` : ''}. Cruze com os demais indicadores do dashboard e dê uma interpretação concisa: destaques, correlações, pontos de atenção e o que significa para a carteira.`}
                    /* Como no gráfico: sem isto a pergunta de acompanhamento
                       ("e por quê?") perde de qual tabela se está falando. */
                    focusedIndicator={{ name: title }}
                  />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
    </div>
  );
}

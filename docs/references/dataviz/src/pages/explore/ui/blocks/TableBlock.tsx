'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableWidget } from '@/widgets/data-table-widget';
import { humanizeColumnName, formatCurrency, formatPercent, formatNumber, formatIsoDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { resolveStatusVariant, type StatusVariant } from './status-badge';
import type { TableBlock as TableBlockType } from '@/shared/config/agents/types';

const STATUS_VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  danger: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  neutral: 'bg-muted/50 text-muted-foreground/80 border-border',
};

function renderStatusBadge(value: unknown, statusMap?: Record<string, StatusVariant>) {
  const label = value == null ? '—' : String(value);
  const variant = resolveStatusVariant(label, statusMap);
  return (
    <Badge
      variant="outline"
      data-status-variant={variant}
      className={STATUS_VARIANT_CLASSES[variant]}
    >
      {label}
    </Badge>
  );
}

function formatCell(value: unknown, format?: 'currency' | 'percent' | 'number' | 'date'): string {
  if (value == null) return '—';
  // Objeto na célula é dado composto (STRUCT) que ninguém sabe desenhar numa
  // coluna; `String()` sobre ele escreveria `[object Object]` na tabela.
  if (typeof value === 'object') return '—';
  if (!format) return String(value);

  const num = typeof value === 'number' ? value : Number(value);

  switch (format) {
    case 'currency':
      return isNaN(num) ? String(value) : formatCurrency(num);
    case 'percent':
      // Catálogo emite razão 0–1; ×100 na apresentação (Fase R/B2).
      return isNaN(num) ? String(value) : formatPercent(num * 100);
    case 'number':
      return isNaN(num) ? String(value) : formatNumber(num);
    case 'date':
      // A coluna declara `date` e devolvia a data ISO crua — o formato era
      // aceito e não fazia nada.
      return formatIsoDate(String(value));
    default:
      return String(value);
  }
}

function renderCell(value: unknown, col: TableBlockType['columns'][number]) {
  if (col.format === 'status-badge') {
    return renderStatusBadge(value, col.statusMap);
  }
  return formatCell(value, col.format);
}

function computeFooterRow(
  rows: Record<string, unknown>[],
  columns: TableBlockType['columns'],
  aggregations: NonNullable<TableBlockType['footerAggregations']>,
): Record<string, string> | undefined {
  if (!rows.length) return undefined;

  const out: Record<string, string> = {};
  for (const col of columns) {
    const agg = aggregations[col.accessorKey];
    if (agg === undefined) {
      out[col.accessorKey] = '';
      continue;
    }
    if (agg === 'sum' || agg === 'avg' || agg === 'count') {
      const nums = rows
        .map((r) => Number(r[col.accessorKey]))
        .filter((n) => !isNaN(n));
      let value: number;
      if (agg === 'sum') value = nums.reduce((s, n) => s + n, 0);
      else if (agg === 'avg') value = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      else value = nums.length;
      out[col.accessorKey] =
        col.format === 'currency' ? formatCurrency(value)
        : col.format === 'percent' ? formatPercent(value * 100)
        : col.format === 'number' ? formatNumber(value)
        : String(value);
    } else {
      // Literal string passthrough
      out[col.accessorKey] = agg;
    }
  }
  return out;
}

export function TableBlock({ block }: { block: TableBlockType }) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      block.columns.map((col) => ({
        accessorKey: col.accessorKey,
        header: humanizeColumnName(col.header),
        cell: ({ getValue }) => renderCell(getValue(), col),
      })),
    [block.columns],
  );

  /**
   * Sem linhas ainda é estado normal, não erro: a tabela declara `metricId` e o
   * pipeline preenche depois. Renderiza o cabeçalho vazio em vez de estourar.
   */
  const rows = useMemo(() => block.rows ?? [], [block.rows]);

  const footerRow = useMemo(
    () =>
      block.footerAggregations
        ? computeFooterRow(rows, block.columns, block.footerAggregations)
        : undefined,
    [rows, block.columns, block.footerAggregations],
  );

  /**
   * A nota só é verdade quando houve truncamento de fato.
   *
   * O texto era "Exibindo 100 de N linhas" com o 100 cravado — anunciava cem
   * linhas independentemente de quantas chegaram, e aparecia até quando
   * `totalRows` era igual ao número de linhas recebidas (ou seja, quando nada
   * foi cortado). Quem sabe quantas linhas há na tabela é `linhas`.
   */
  const truncatedTotal =
    block.totalRows != null && block.totalRows > rows.length ? block.totalRows : null;

  return (
    // `h-full` para a tabela acompanhar a altura que a linha lhe deu — ver a
    // nota em `DataTableWidget`.
    <div className="h-full">
      <DataTableWidget
        title={block.title}
        columns={columns}
        data={rows}
        pageSize={10}
        exportable
        footerRow={footerRow}
      />
      {truncatedTotal !== null && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/60 text-right">
          Exibindo {rows.length.toLocaleString('pt-BR')} de{' '}
          {truncatedTotal.toLocaleString('pt-BR')} linhas
        </p>
      )}
    </div>
  );
}

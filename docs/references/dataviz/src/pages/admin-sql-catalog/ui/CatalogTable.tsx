'use client';

import type { SqlCatalogRow } from '@/features/sql-catalog/repository';
import { Badge } from '@/shared/ui/badge';
import { CatalogRowActions } from './CatalogRowActions';

interface Props {
  rows: SqlCatalogRow[];
  onApprove: (row: SqlCatalogRow, qualityScore: number) => void;
  onReject: (row: SqlCatalogRow) => void;
  onEdit: (row: SqlCatalogRow) => void;
  onRevalidate: (row: SqlCatalogRow) => void;
}

function statusVariant(s: SqlCatalogRow['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (s) {
    case 'approved':
      return 'default';
    case 'draft':
      return 'secondary';
    case 'deprecated':
      return 'destructive';
    case 'needs_revalidation':
      return 'outline';
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function CatalogTable({ rows, onApprove, onReject, onEdit, onRevalidate }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma entrada.</p>;
  }
  return (
    <table className="w-full text-sm" role="table">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-2 px-2">Intent</th>
          <th className="py-2 px-2">Cliente</th>
          <th className="py-2 px-2">Persona</th>
          <th className="py-2 px-2">Status</th>
          <th className="py-2 px-2">Use</th>
          <th className="py-2 px-2">Quality</th>
          <th className="py-2 px-2">Curated by</th>
          <th className="py-2 px-2">Updated</th>
          <th className="py-2 px-2 text-right">Ações</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-border text-foreground">
            <td className="py-2 px-2" title={row.intent}>
              {truncate(row.intent, 60)}
            </td>
            <td className="py-2 px-2">{row.client_id}</td>
            <td className="py-2 px-2">{row.persona_id ?? '—'}</td>
            <td className="py-2 px-2">
              <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
            </td>
            <td className="py-2 px-2">{row.use_count}</td>
            <td className="py-2 px-2">{row.quality_score?.toFixed(2) ?? '—'}</td>
            <td className="py-2 px-2">{row.curated_by ?? '—'}</td>
            <td className="py-2 px-2">
              {row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : '—'}
            </td>
            <td className="py-2 px-2 text-right">
              <CatalogRowActions
                row={row}
                onApprove={(qs) => onApprove(row, qs)}
                onReject={() => onReject(row)}
                onEdit={() => onEdit(row)}
                onRevalidate={() => onRevalidate(row)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

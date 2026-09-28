'use client';
import { Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { AiStudioRecordLike } from '../model/api';

interface Props {
  rows: AiStudioRecordLike[];
  loading: boolean;
  onEdit: (row: AiStudioRecordLike) => void;
  onDelete: (row: AiStudioRecordLike) => void;
  onReset: (row: AiStudioRecordLike) => void;
}

export function AiStudioTable({ rows, loading, onEdit, onDelete, onReset }: Props) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum registro.</p>;
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {rows.map((row) => {
        const isSystem = row.origin === 'system';
        return (
          <div key={row.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{String(row.name ?? row.id)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSystem ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {isSystem ? 'Sistema' : 'Custom'}
                </span>
                <span className="text-[10px] text-muted-foreground">{String(row.status ?? '')}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{String(row.description ?? row.id)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onEdit(row)}><Pencil className="size-3.5" /></Button>
              {isSystem
                ? <Button size="sm" variant="ghost" title="Restaurar padrão" onClick={() => onReset(row)}><RotateCcw className="size-3.5" /></Button>
                : <Button size="sm" variant="ghost" title="Excluir" onClick={() => onDelete(row)}><Trash2 className="size-3.5 text-destructive" /></Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';
import { Trash2, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { KbSourceRecordLike } from '../model/api';

const STATUS: Record<string, { icon: React.ReactNode; label: string }> = {
  pending: { icon: <Loader2 className="size-3.5 animate-spin" />, label: 'pendente' },
  processing: { icon: <Loader2 className="size-3.5 animate-spin" />, label: 'processando' },
  ready: { icon: <CheckCircle2 className="size-3.5 text-primary" />, label: 'pronto' },
  error: { icon: <AlertCircle className="size-3.5 text-destructive" />, label: 'erro' },
};

export function KbDocList({ docs, onDelete }: { docs: KbSourceRecordLike[]; onDelete: (d: KbSourceRecordLike) => void }) {
  if (docs.length === 0) return <p className="text-xs text-muted-foreground">Nenhum documento ainda.</p>;
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {docs.map((d) => {
        const s = STATUS[d.status] ?? STATUS.pending;
        return (
          <div key={d.id} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{d.filename}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">{s.icon}{s.label}</span>
              {d.status === 'ready' && <span className="text-[11px] text-muted-foreground">{d.chunkCount} chunks</span>}
              {d.status === 'error' && d.error && <span className="text-[11px] text-destructive truncate">{d.error}</span>}
            </div>
            <Button size="sm" variant="ghost" title="Excluir" onClick={() => onDelete(d)}>
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

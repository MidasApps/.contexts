'use client';

import { LayoutTemplate, Pencil, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';

const STATUS_COLORS: Record<TemplateRecord['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  archived: 'bg-muted/50 text-muted-foreground/80 border-border',
};

interface TemplatesTableProps {
  rows: TemplateRecord[];
  loading?: boolean;
  productNameById: Record<string, string>;
  onEditMeta: (t: TemplateRecord) => void;
  onDuplicate: (id: string) => void;
  onDelete: (t: TemplateRecord) => void;
}

export function TemplatesTable({ rows, loading, productNameById, onEditMeta, onDuplicate, onDelete }: TemplatesTableProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-[40px_1.6fr_.8fr_.5fr_.5fr_.6fr_150px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
        <span />
        <Header>Nome / id</Header>
        <Header>Produto</Header>
        <Header>Blocos</Header>
        <Header>Métricas</Header>
        <Header>Status</Header>
        <Header className="text-right">Ações</Header>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">{loading ? 'Carregando…' : 'Nenhum template.'}</div>
      ) : (
        rows.map((t) => (
          <div key={t.id} className="grid grid-cols-[40px_1.6fr_.8fr_.5fr_.5fr_.6fr_150px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
            <div className="size-7 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-foreground truncate">{t.name}</p>
              <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{t.id}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {(t.productRefs ?? []).map((id) => productNameById[id] ?? id).join(', ') || '—'}
              {t.segment && t.segment !== 'both' ? ` · ${t.segment}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">{Object.keys(t.blockMap ?? {}).length}</p>
            <p className="text-xs text-muted-foreground">{t.metricRefs?.length ?? 0}</p>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border w-fit ${STATUS_COLORS[t.status]}`}>
              {t.status}
            </span>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon-xs" title="Editar metadados" aria-label="Editar metadados" onClick={() => onEditMeta(t)}
                className="text-muted-foreground/80 hover:text-foreground">
                <Pencil className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Duplicar" aria-label="Duplicar" onClick={() => onDuplicate(t.id)}
                className="text-muted-foreground/80 hover:text-foreground">
                <Copy className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Excluir" aria-label="Excluir" onClick={() => onDelete(t)}
                className="text-muted-foreground/80 hover:text-red-400">
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Header({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium ${className}`}>{children}</span>;
}

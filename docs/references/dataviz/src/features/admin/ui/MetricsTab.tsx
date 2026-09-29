'use client';

import { useMemo, useState } from 'react';
import { Activity, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAdminMetrics } from '@/features/admin/model/useAdminMetrics';
import { useAdminContracts } from '@/features/admin/model/useAdminContracts';
import type { Metric } from '@/shared/schemas';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { MetricForm } from './MetricForm';

const STATUS_COLORS: Record<Metric['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  deprecated: 'bg-muted/50 text-muted-foreground/80 border-border',
};

export function MetricsTab() {
  const { metrics, loading, error, save, rename, deprecate, remove } = useAdminMetrics();
  const { contracts } = useAdminContracts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Metric | undefined>();
  const [search, setSearch] = useState('');
  const [confirmDeprecate, setConfirmDeprecate] = useState<Metric | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Metric | null>(null);

  const filtered = useMemo(() => {
    if (!search) return metrics;
    const q = search.toLowerCase();
    return metrics.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q),
    );
  }, [metrics, search]);

  // Métricas requerem pelo menos um contract para popular o picker de requires.
  const hasContracts = contracts.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${filtered.length} of ${metrics.length} metric${metrics.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={!hasContracts}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 disabled:opacity-50"
          title={!hasContracts ? 'Create a Data Contract first' : undefined}
        >
          <Plus className="size-3.5" />
          New metric
        </Button>
      </div>

      {!hasContracts && !loading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Create a Data Contract before adding metrics — metrics must reference existing attributes.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by id or label..."
        className="max-w-md"
      />

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[40px_2fr_1fr_.7fr_140px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span />
          <Header>ID / Label</Header>
          <Header>Requires</Header>
          <Header>Status</Header>
          <Header className="text-right">Actions</Header>
        </div>

        {loading ? (
          <Empty>Loading...</Empty>
        ) : filtered.length === 0 ? (
          <Empty>No metrics found.</Empty>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[40px_2fr_1fr_.7fr_140px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
            >
              <div className="size-7 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
                <Activity className="size-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-foreground font-mono truncate">{m.id}</p>
                <p className="text-[11px] text-muted-foreground/80 truncate">{m.label}</p>
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                {m.requires.length} attr{m.requires.length !== 1 ? 's' : ''}
              </p>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[m.status]} w-fit`}
              >
                {m.status}
              </span>
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditing(m);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
                {m.status === 'active' && (
                  <button
                    onClick={() => setConfirmDeprecate(m)}
                    title="Deprecate (soft)"
                    className="text-[11px] text-muted-foreground/60 hover:text-amber-300 px-1"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setConfirmRemove(m)}
                  title="Delete metric (hard)"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {hasContracts && (
        <MetricForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={save}
          onRename={rename}
          metric={editing}
          contracts={contracts}
          existingIds={metrics.map((m) => m.id)}
        />
      )}

      <ConfirmDialog
        open={confirmDeprecate !== null}
        onOpenChange={(open) => !open && setConfirmDeprecate(null)}
        title="Marcar métrica como deprecated"
        description={
          confirmDeprecate
            ? `Marca "${confirmDeprecate.id}" como deprecated (soft). O documento permanece no Firestore, mas perde o status "active": produtos que têm esta métrica em metricRefs deixarão de exibi-la (o join não retorna mais este indicador). Para reativar, recrie/edite a métrica.`
            : ''
        }
        confirmLabel="Marcar deprecated"
        onConfirm={async () => {
          if (confirmDeprecate) await deprecate(confirmDeprecate.id);
        }}
      />

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        destructive
        title="Apagar métrica"
        description={
          confirmRemove
            ? `Esta ação remove a métrica "${confirmRemove.id}" do Firestore.\n\nProdutos e dashboards que referenciam vão quebrar.\n\nAção irreversível.`
            : ''
        }
        confirmLabel="Apagar"
        onConfirm={async () => {
          if (confirmRemove) await remove(confirmRemove.id);
        }}
      />
    </div>
  );
}

function Header({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium ${className}`}>
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground/80">{children}</div>;
}

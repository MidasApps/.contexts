'use client';

import { useState } from 'react';
import { ChevronLeft, FileCode, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useAdminContracts } from '@/features/admin/model/useAdminContracts';
import type { DataContract } from '@/shared/schemas';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { ContractForm } from './ContractForm';
import { EntityEditor } from './EntityEditor';

const STATUS_COLORS: Record<DataContract['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  deprecated: 'bg-muted/50 text-muted-foreground/80 border-border',
};

export function DataContractsTab() {
  const { contracts, loading, error, save, deprecate, remove, refetch } = useAdminContracts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DataContract | undefined>();
  const [drillContract, setDrillContract] = useState<DataContract | null>(null);
  const [confirmDeprecate, setConfirmDeprecate] = useState<DataContract | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DataContract | null>(null);

  // Drill-down: contract → entities/attributes editor
  if (drillContract) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setDrillContract(null);
            refetch();
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Back to contracts
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{drillContract.name}</h3>
            <p className="text-xs text-muted-foreground/80">
              <span className="font-mono">{drillContract.id}</span> ·{' '}
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[drillContract.status]}`}
              >
                {drillContract.status}
              </span>
            </p>
          </div>
        </div>
        <EntityEditor contractId={drillContract.id} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading...' : `${contracts.length} contract${contracts.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
        >
          <Plus className="size-3.5" />
          New Contract
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[40px_1.5fr_.6fr_1fr_180px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span />
          <Header>Name</Header>
          <Header>Status</Header>
          <Header>Description</Header>
          <Header className="text-right">Actions</Header>
        </div>

        {loading ? (
          <Empty>Loading...</Empty>
        ) : contracts.length === 0 ? (
          <Empty>
            No contracts yet. Create <code className="text-muted-foreground">canonical</code> to get started.
          </Empty>
        ) : (
          contracts.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[40px_1.5fr_.6fr_1fr_180px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
            >
              <div className="size-7 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
                <FileCode className="size-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-foreground">{c.name}</p>
                <p className="text-[11px] text-muted-foreground/60 font-mono">{c.id}</p>
              </div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[c.status]}`}
              >
                {c.status}
              </span>
              <p className="text-xs text-muted-foreground/80 truncate">{c.description ?? '—'}</p>
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setDrillContract(c)}
                >
                  Entities →
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7 px-2 text-muted-foreground/80 hover:text-foreground"
                  onClick={() => {
                    setEditing(c);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
                {c.status !== 'deprecated' && (
                  <button
                    onClick={() => setConfirmDeprecate(c)}
                    title="Deprecate (soft)"
                    className="text-[11px] text-muted-foreground/60 hover:text-amber-300 px-1"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setConfirmDelete(c)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Delete contract (hard, cascade)"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ContractForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={save}
        contract={editing}
      />

      <ConfirmDialog
        open={confirmDeprecate !== null}
        onOpenChange={(open) => !open && setConfirmDeprecate(null)}
        title="Marcar contrato como deprecated"
        description={
          confirmDeprecate
            ? `Marca "${confirmDeprecate.id}" como deprecated (soft). O documento e suas entidades permanecem no Firestore, mas perde o status "active". Para reativar, edite o contrato.`
            : ''
        }
        confirmLabel="Marcar deprecated"
        onConfirm={async () => {
          if (confirmDeprecate) await deprecate(confirmDeprecate.id);
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        destructive
        title="Apagar Data Contract"
        description={
          confirmDelete
            ? `Esta ação remove o contrato "${confirmDelete.id}" e TODAS suas entidades + attributes do Firestore.\n\nMétricas que dependem destes attributes vão falhar até serem migradas.\n\nAção irreversível.`
            : ''
        }
        confirmLabel="Apagar tudo"
        onConfirm={async () => {
          if (confirmDelete) await remove(confirmDelete.id);
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

'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { useAdminClients } from '@/features/admin/model/useAdminClients';
import { useAdminProducts } from '@/features/admin/model/useAdminProducts';
import { ClientForm } from './ClientForm';
import type { Client } from '@/features/admin/model/types';
import type { Product } from '@/shared/schemas';

export function ClientsTab() {
  const { clients, loading, save, remove } = useAdminClients();
  const { products } = useAdminProducts();
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Erro ao excluir cliente.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${clients.length} cliente${clients.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          onClick={() => { setEditingClient(undefined); setFormOpen(true); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
        >
          <Plus className="size-3.5" />
          Adicionar cliente
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[40px_1fr_1.6fr_80px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span />
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Nome</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Produtos / Datasets</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider text-right">Ações</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Carregando...</div>
        ) : clients.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Nenhum cliente cadastrado</div>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              className="grid grid-cols-[40px_1fr_1.6fr_80px] gap-3 px-4 py-3 items-start border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
            >
              {/* Initial circle */}
              <div
                className="mt-0.5 size-7 rounded-full flex items-center justify-center text-[11px] font-bold text-black flex-shrink-0"
                style={{ backgroundColor: client.color }}
              >
                {client.initial}
              </div>

              {/* Name */}
              <div>
                <p className="text-sm text-foreground">{client.name}</p>
                <p className="text-[11px] text-muted-foreground/60 font-mono">{client.id}</p>
              </div>

              {/* Produtos / Datasets */}
              <ClientDatasetsSummary client={client} products={products} />

              {/* Actions */}
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleOpenEdit(client)}
                  className="text-muted-foreground/80 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeleteTarget(client)}
                  className="text-muted-foreground/80 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Client Form */}
      <ClientForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={save}
        client={editingClient}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null); } }}>
        <DialogContent className="bg-popover border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirmar exclusão</DialogTitle>
          </DialogHeader>
          {deleteError && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{deleteError}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o cliente{' '}
            <span className="text-foreground font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500/80 hover:bg-red-500 text-destructive-foreground"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── sub-componente ───────────────────────────────────────────────

interface ClientDatasetsSummaryProps {
  client: Client;
  products: Product[];
}

function ClientDatasetsSummary({ client, products }: ClientDatasetsSummaryProps) {
  const bindings = client.productBindings ?? [];

  // Cliente legado (sem bindings): mostra o dataset único
  if (bindings.length === 0) {
    if (!client.dataset) {
      return <span className="text-[11px] text-muted-foreground/40">—</span>;
    }
    return (
      <span className="text-[11px] font-mono text-muted-foreground truncate" title={client.dataset}>
        {client.dataset}
      </span>
    );
  }

  // Cliente multi-produto: uma linha por produto, datasets aninhados
  return (
    <div className="space-y-2">
      {bindings.map((binding) => {
        const product = products.find((p) => p.id === binding.productId);
        const productName = product?.name ?? binding.productId;
        const productColor = product?.color ?? '#888';

        return (
          <div key={binding.productId}>
            {/* Badge do produto */}
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="size-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: productColor }}
              />
              <span className="text-[11px] font-medium text-foreground">{productName}</span>
            </div>

            {/* Datasets deste binding */}
            <div className="flex flex-col gap-0.5 pl-3">
              {binding.datasets.length === 0 ? (
                <span className="text-[11px] text-muted-foreground/40 italic">sem dataset</span>
              ) : (
                binding.datasets.map((ds, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {ds.isPrimary && (
                      <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider flex-shrink-0">
                        primary
                      </span>
                    )}
                    <span
                      className="text-[11px] font-mono text-muted-foreground truncate"
                      title={`${ds.dataSourceId} / ${ds.datasetId}`}
                    >
                      {ds.dataSourceId && (
                        <span className="text-muted-foreground/60">{ds.dataSourceId}/</span>
                      )}
                      {ds.datasetId || <span className="text-muted-foreground/40 italic">sem id</span>}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

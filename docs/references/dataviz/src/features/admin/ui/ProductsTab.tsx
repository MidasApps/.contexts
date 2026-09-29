'use client';

import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useAdminProducts } from '@/features/admin/model/useAdminProducts';
import { useAdminClients } from '@/features/admin/model/useAdminClients';
import { useAdminDataSources } from '@/features/admin/model/useAdminDataSources';
import type { Product, DataSource } from '@/shared/schemas';
import type { Client } from '@/features/admin/model/types';
import { ProductForm } from './ProductForm';

const STATUS_COLORS: Record<Product['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  archived: 'bg-muted/50 text-muted-foreground/80 border-border',
};

interface DatasetLabel { name: string; count: number; }
type DatasetStatsByProduct = Record<string, { total: number; labels: DatasetLabel[] }>;

/** Computa stats de datasets para todos os produtos de uma vez, a partir de dados já carregados. */
function computeDatasetStats(
  clients: Client[],
  dataSources: DataSource[],
): DatasetStatsByProduct {
  const byProduct: Record<string, Record<string, number>> = {};

  for (const client of clients) {
    for (const binding of client.productBindings ?? []) {
      if (!byProduct[binding.productId]) byProduct[binding.productId] = {};
      for (const ds of binding.datasets) {
        if (!ds.dataSourceId) continue;
        byProduct[binding.productId][ds.dataSourceId] =
          (byProduct[binding.productId][ds.dataSourceId] ?? 0) + 1;
      }
    }
  }

  const result: DatasetStatsByProduct = {};
  for (const [productId, bySource] of Object.entries(byProduct)) {
    const labels = Object.entries(bySource).map(([id, count]) => ({
      name: dataSources.find((d) => d.id === id)?.name ?? id,
      count,
    }));
    result[productId] = { total: labels.reduce((s, l) => s + l.count, 0), labels };
  }
  return result;
}

export function ProductsTab() {
  const { products, loading, error, save, remove } = useAdminProducts();
  const { clients } = useAdminClients();
  const { dataSources } = useAdminDataSources();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const datasetStats = useMemo(
    () => computeDatasetStats(clients, dataSources),
    [clients, dataSources],
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${products.length} produto${products.length !== 1 ? 's' : ''}`}
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
          Adicionar produto
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[40px_1.4fr_.7fr_.6fr_.6fr_1fr_80px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span />
          <Header>Nome</Header>
          <Header>Status</Header>
          <Header>Entities</Header>
          <Header>Métricas</Header>
          <Header>Datasets</Header>
          <Header className="text-right">Ações</Header>
        </div>

        {loading ? (
          <Empty>Carregando...</Empty>
        ) : products.length === 0 ? (
          <Empty>Nenhum produto cadastrado</Empty>
        ) : (
          products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              stats={datasetStats[p.id] ?? { total: 0, labels: [] }}
              onEdit={() => { setEditing(p); setFormOpen(true); }}
              onDelete={() => setDeleteTarget(p)}
            />
          ))
        )}
      </div>

      <ProductForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={save}
        product={editing}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="bg-popover border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir produto{' '}
            <span className="text-foreground font-medium">{deleteTarget?.name}</span>? Clientes
            vinculados a este produto perderão acesso.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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

interface ProductRowProps {
  product: Product;
  stats: { total: number; labels: DatasetLabel[] };
  onEdit: () => void;
  onDelete: () => void;
}

function ProductRow({ product: p, stats: { total, labels }, onEdit, onDelete }: ProductRowProps) {

  return (
    <div className="grid grid-cols-[40px_1.4fr_.7fr_.6fr_.6fr_1fr_80px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
      <div
        className="size-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${p.color}22` }}
      >
        <Package className="size-3.5" style={{ color: p.color }} />
      </div>

      <div>
        <p className="text-sm text-foreground">{p.name}</p>
        <p className="text-[11px] text-muted-foreground/60 font-mono">{p.id}</p>
      </div>

      <span
        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_COLORS[p.status]}`}
      >
        {p.status}
      </span>

      <p className="text-xs text-muted-foreground">
        {p.entityRefs?.length ?? 0}
      </p>

      <p className="text-xs text-muted-foreground">
        {(p.metricRefs?.length ?? 0) || p.indicators.length}
      </p>

      {/* Datasets por DataSource */}
      <div className="flex flex-wrap gap-1">
        {total === 0 ? (
          <span className="text-[11px] text-muted-foreground/40">—</span>
        ) : (
          labels.map(({ name, count }) => (
            <span
              key={name}
              title={`${count} dataset${count !== 1 ? 's' : ''} em ${name}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <span className="font-mono truncate max-w-[80px]">{name}</span>
              <span className="text-muted-foreground/60">×{count}</span>
            </span>
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          className="text-muted-foreground/80 hover:text-foreground"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          className="text-muted-foreground/80 hover:text-red-400"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function Header({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] text-muted-foreground/80 uppercase tracking-wider ${className}`}>
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">{children}</div>;
}

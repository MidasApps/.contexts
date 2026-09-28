'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AppBar } from '@/widgets/app-bar';
import { Button } from '@/shared/ui/button';
import { useSqlCatalog, sqlCatalogApi } from '@/shared/hooks/useSqlCatalog';
import { useAdminClients } from '@/features/admin/model/useAdminClients';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';
import { CatalogFilters, type CatalogFiltersValue } from './CatalogFilters';
import { CatalogTable } from './CatalogTable';
import { CatalogEditDialog } from './CatalogEditDialog';

const PAGE_SIZE = 50;

export function AdminSqlCatalogPage() {
  const { clients } = useAdminClients();
  const [filters, setFilters] = useState<CatalogFiltersValue>({ clientId: '' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SqlCatalogRow | null>(null);

  /**
   * Cliente vigente = o escolhido, ou o primeiro do cadastro enquanto ninguém
   * escolheu. DERIVADO, não copiado para o estado por um efeito: copiar
   * custaria uma renderização a mais e abriria a janela em que o filtro exibe
   * um cliente e a consulta usa outro. Enquanto o cadastro não chega fica
   * vazio, e `useSqlCatalog` não consulta sem clientId.
   */
  const activeFilters: CatalogFiltersValue = {
    ...filters,
    clientId: filters.clientId || clients[0]?.id || '',
  };

  const { data, loading, error, refetch } = useSqlCatalog({
    ...activeFilters,
    page,
    pageSize: PAGE_SIZE,
  });

  async function handleApprove(row: SqlCatalogRow, qualityScore: number) {
    const res = await sqlCatalogApi.approve({
      id: row.id,
      qualityScore,
      clientId: row.client_id,
    });
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error === 'dry_run failed' ? 'dry_run falhou' : body.error || 'Aprovação rejeitada');
      return;
    }
    if (!res.ok) {
      toast.error('Erro ao aprovar');
      return;
    }
    toast.success('Aprovado');
    void refetch();
  }

  async function handleReject(row: SqlCatalogRow) {
    const res = await sqlCatalogApi.reject(row.id);
    if (!res.ok) toast.error('Erro ao rejeitar');
    else toast.success('Rejeitado');
    void refetch();
  }

  async function handleRevalidate(row: SqlCatalogRow) {
    const res = await sqlCatalogApi.revalidate(row.id);
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error === 'dry_run failed' ? 'dry_run falhou' : body.error || 'Revalidação falhou');
      return;
    }
    if (!res.ok) toast.error('Erro ao revalidar');
    else toast.success('Revalidado');
    void refetch();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      <AppBar pageTitle="Catálogo de SQL Validado" />
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-4">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Catálogo de SQL Validado</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Curadoria de queries aprovadas (ADR-0009). Apenas entradas com
              <code className="text-xs px-1 mx-1 rounded bg-muted/50">quality_score ≥ 0.7</code>
              + dry-run válido + bytes ≤ 5GB podem ser aprovadas.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </header>

        <CatalogFilters
          value={activeFilters}
          clients={clients}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />

        {error === 'Acesso negado' ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Acesso negado. Você precisa ter o papel admin para usar esta página.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Falha: {error}
          </div>
        ) : null}

        <CatalogTable
          rows={data?.items ?? []}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={(row) => setEditing(row)}
          onRevalidate={handleRevalidate}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {data?.total ?? 0} entradas — página {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>

        <CatalogEditDialog
          row={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refetch()}
        />
      </div>
    </div>
  );
}

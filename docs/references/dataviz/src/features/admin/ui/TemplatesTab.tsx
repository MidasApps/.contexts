'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/shared/ui/input';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAdminTemplates } from '@/features/admin/model/useAdminTemplates';
import { useAdminProducts } from '@/features/admin/model/useAdminProducts';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { TemplatesTable } from './TemplatesTable';
import { TemplateForm, type TemplateMetadata } from './TemplateForm';

/**
 * O catálogo de Dashboard Templates — prateleira, não oficina.
 *
 * Criar e editar CONTEÚDO de template saiu daqui: um template nasce de uma
 * página que já funciona, pelo "Salvar como template" no menu dela, com dado
 * real e com o assistente por perto. Montar a mesma página duas vezes — uma
 * para usar, outra para virar template — era o trabalho que este aba pedia.
 *
 * O que sobrou é governança: metadados, status (é o `active` que põe o
 * template na galeria), duplicar e excluir.
 */
export function TemplatesTab() {
  const { templates, loading, error, patch, remove, duplicate } = useAdminTemplates();
  const { products } = useAdminProducts();
  const productNameById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);
  const activeProducts = useMemo(() => products.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name })), [products]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateMetadata | undefined>();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TemplateRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [templates, search]);

  function toMeta(t: TemplateRecord): TemplateMetadata {
    return { id: t.id, name: t.name, description: t.description, category: t.category, productRefs: t.productRefs ?? [], segment: t.segment, status: t.status };
  }

  async function handleSave(data: TemplateMetadata) {
    await patch(data.id, data);
  }

  async function handleDuplicate(id: string) {
    setActionError(null);
    try { await duplicate(id); } catch (e) { setActionError(e instanceof Error ? e.message : 'Falha ao duplicar'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${filtered.length} de ${templates.length} template${templates.length !== 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-muted-foreground/70">
          Template novo nasce de uma página: abra a página, menu ⋯ → “Salvar como template”.
        </p>
      </div>

      {(error || actionError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error || actionError}</div>
      )}

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por id ou nome..." className="max-w-md" />

      <TemplatesTable
        rows={filtered}
        loading={loading}
        productNameById={productNameById}
        onEditMeta={(t) => { setEditing(toMeta(t)); setFormOpen(true); }}
        onDuplicate={handleDuplicate}
        onDelete={(t) => setConfirmDelete(t)}
      />

      <TemplateForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        existingIds={templates.map((t) => t.id)}
        template={editing}
        products={activeProducts}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        destructive
        title="Excluir template"
        description={confirmDelete
          ? `Excluir "${confirmDelete.name}"?\n\nA galeria "Importar template" deixará de oferecê-lo. Ação irreversível.`
          : ''}
        confirmLabel="Excluir"
        onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }}
      />
    </div>
  );
}

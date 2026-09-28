'use client';
import { useMemo, useState } from 'react';
import { useFetchResource } from '@/shared/hooks/useFetchResource';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { type AiStudioRecordLike, listKbDocs, uploadKbDoc, deleteKbDoc, type KbSourceRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';
import { KbDocUploader } from './KbDocUploader';
import { KbDocList } from './KbDocList';
import { slugify } from '@/shared/lib/slug';

interface Draft { id: string; name: string; description: string; clientId: string; status: string; origin?: string }
const EMPTY: Draft = { id: '', name: '', description: '', clientId: '', status: 'active' };
const NO_DOCS: KbSourceRecordLike[] = [];

export function KnowledgeBasesTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('kb');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);
  const editingExisting = Boolean(draft.origin) || rows.some((r) => r.id === draft.id);

  // Documentos só da KB aberta no diálogo. Trocar de KB (ou fechar) aborta o
  // GET anterior, e a resposta atrasada de outra KB nunca entra na lista. Erro
  // de listagem mantém a lista que estava (o `error` do hook é ignorado aqui).
  const dialogKb = open && editingExisting && draft.id ? draft.id : null;
  const docsFetcher = useMemo(
    () => (dialogKb ? (signal: AbortSignal) => listKbDocs(dialogKb, signal) : null),
    [dialogKb],
  );
  const { data: docs, refetch: refreshDocs } = useFetchResource(docsFetcher, NO_DOCS);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      clientId: row.clientId ? String(row.clientId) : '', status: String(row.status ?? 'active'), origin: row.origin as string });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    // clientId é travado em system; em user, '' → global (null)
    const payload: Record<string, unknown> = { name: draft.name, description: draft.description, status: draft.status };
    if (!exists) payload.clientId = draft.clientId.trim() || null;
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Nova KB" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Nova Knowledge Base'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {!draft.origin && <Input placeholder="clientId (vazio = global)" value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} />}
            {editingExisting && draft.id && (
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-xs font-medium">Documentos</label>
                <KbDocUploader onUpload={async (file) => { await uploadKbDoc(draft.id, file); await refreshDocs(); }} />
                <KbDocList docs={docs} onDelete={async (d) => { await deleteKbDoc(draft.id, d.id); await refreshDocs(); }} />
              </div>
            )}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir KB" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}

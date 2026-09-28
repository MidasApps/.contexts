'use client';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';
import { slugify } from '@/shared/lib/slug';

interface Draft { id: string; name: string; description: string; instruction: string; status: string; isDefault: boolean; origin?: string }
const EMPTY: Draft = { id: '', name: '', description: '', instruction: '', status: 'active', isDefault: false };

export function AiWorkflowsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('workflows');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      instruction: String(row.instruction ?? ''), status: String(row.status ?? 'active'),
      isDefault: Boolean(row.isDefault), origin: row.origin as string });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    const payload = { name: draft.name, description: draft.description, instruction: draft.instruction, status: draft.status, isDefault: draft.isDefault };
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Novo workflow" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Novo workflow'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div><label className="text-xs font-medium">Quando usar (descrição p/ o roteador)</label>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div><label className="text-xs font-medium">Instrução de orquestração</label>
              <Textarea rows={10} value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              Workflow default (fallback do roteador)
            </label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir workflow" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}

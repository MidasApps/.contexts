'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { makeAiStudioApi, fetchTools, type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';
import { MultiRefSelect } from './MultiRefSelect';
import { slugify } from '@/shared/lib/slug';

const kbApi = makeAiStudioApi('kb');
interface Draft { id: string; name: string; description: string; playbook: string; status: string; origin?: string; toolRefs: string[]; knowledgeBaseRefs: string[] }
const EMPTY: Draft = { id: '', name: '', description: '', playbook: '', status: 'active', toolRefs: [], knowledgeBaseRefs: [] };

export function AiSkillsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('skills');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);
  const [tools, setTools] = useState<{ id: string; label: string }[]>([]);
  const [kbs, setKbs] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    fetchTools().then((t) => setTools(t.map((x) => ({ id: x.key, label: x.name })))).catch(() => {});
    kbApi.list().then((k) => setKbs(k.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      playbook: String(row.playbook ?? ''), status: String(row.status ?? 'active'), origin: row.origin as string,
      toolRefs: (row.toolRefs as string[]) ?? [], knowledgeBaseRefs: (row.knowledgeBaseRefs as string[]) ?? [] });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    const payload = { name: draft.name, description: draft.description, playbook: draft.playbook, status: draft.status, toolRefs: draft.toolRefs, knowledgeBaseRefs: draft.knowledgeBaseRefs };
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Nova skill" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Nova skill'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição (quando usar)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div><label className="text-xs font-medium">Playbook</label>
              <Textarea rows={10} value={draft.playbook} onChange={(e) => setDraft({ ...draft, playbook: e.target.value })} /></div>
            <MultiRefSelect label="Tools" options={tools} value={draft.toolRefs} onChange={(v) => setDraft({ ...draft, toolRefs: v })} />
            <MultiRefSelect label="Knowledge Bases" options={kbs} value={draft.knowledgeBaseRefs} onChange={(v) => setDraft({ ...draft, knowledgeBaseRefs: v })} />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir skill" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}

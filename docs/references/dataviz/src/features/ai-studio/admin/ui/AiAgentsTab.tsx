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

const MODELS = ['router', 'fast', 'flash', 'reasoning'] as const;
const skillsApi = makeAiStudioApi('skills');
const kbApi = makeAiStudioApi('kb');

interface Draft { id: string; name: string; description: string; instructions: string; model: string; status: string; kind?: string; origin?: string; skillRefs: string[]; toolRefs: string[]; knowledgeBaseRefs: string[] }
const EMPTY: Draft = { id: '', name: '', description: '', instructions: '', model: 'fast', status: 'active', skillRefs: [], toolRefs: [], knowledgeBaseRefs: [] };

export function AiAgentsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('agents');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);
  const [tools, setTools] = useState<{ id: string; label: string }[]>([]);
  const [skills, setSkills] = useState<{ id: string; label: string }[]>([]);
  const [kbs, setKbs] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    fetchTools().then((t) => setTools(t.map((x) => ({ id: x.key, label: x.name })))).catch(() => {});
    skillsApi.list().then((s) => setSkills(s.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
    kbApi.list().then((k) => setKbs(k.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openCreate() { setDraft(EMPTY); setOpen(true); }
  function openEdit(row: AiStudioRecordLike) {
    setDraft({
      id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      instructions: String(row.instructions ?? ''), model: String(row.model ?? 'fast'),
      status: String(row.status ?? 'active'), kind: row.kind as string, origin: row.origin as string,
      skillRefs: (row.skillRefs as string[]) ?? [], toolRefs: (row.toolRefs as string[]) ?? [],
      knowledgeBaseRefs: (row.knowledgeBaseRefs as string[]) ?? [],
    });
    setOpen(true);
  }


  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    const payload = {
      name: draft.name, description: draft.description, instructions: draft.instructions,
      model: draft.model, status: draft.status, skillRefs: draft.skillRefs,
      toolRefs: draft.toolRefs, knowledgeBaseRefs: draft.knowledgeBaseRefs,
    };
    if (exists) await patch(draft.id, payload);
    else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  const isSystem = draft.origin === 'system';
  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Novo agente" onCreate={openCreate} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit}
        onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Novo agente'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug, gerado do nome se vazio)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div>
              <label className="text-xs font-medium">Instruções (system prompt)</label>
              <Textarea rows={8} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs font-medium">Model</label>
              <select className="text-sm border border-border rounded-md bg-background px-2 py-1" value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {isSystem && <span className="text-[11px] text-muted-foreground">(kind travado: {draft.kind})</span>}
            </div>
            <MultiRefSelect label="Skills" options={skills} value={draft.skillRefs} onChange={(v) => setDraft({ ...draft, skillRefs: v })} />
            <MultiRefSelect label="Tools" options={tools} value={draft.toolRefs} onChange={(v) => setDraft({ ...draft, toolRefs: v })} />
            <MultiRefSelect label="Knowledge Bases" options={kbs} value={draft.knowledgeBaseRefs} onChange={(v) => setDraft({ ...draft, knowledgeBaseRefs: v })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir agente" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"? Ação irreversível.` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}

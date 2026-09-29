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
import { useAdminGroups } from '@/features/admin/model/useAdminGroups';
import { useAdminUsers } from '@/features/admin/model/useAdminUsers';
import { GroupForm } from './GroupForm';
import type { Group } from '@/features/admin/model/types';

export function GroupsTab() {
  const { groups, loading, create, update, remove } = useAdminGroups();
  const { users } = useAdminUsers();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingGroup(undefined);
    setFormOpen(true);
  };

  const handleOpenEdit = (group: Group) => {
    setEditingGroup(group);
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
      setDeleteError(error instanceof Error ? error.message : 'Erro ao excluir grupo.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${groups.length} grupo${groups.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          onClick={handleOpenAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
        >
          <Plus className="size-3.5" />
          Adicionar grupo
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1fr_80px_80px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Nome</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Descrição</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Rotas</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider text-right">Ações</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Carregando...</div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Nenhum grupo cadastrado</div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="grid grid-cols-[1fr_1fr_80px_80px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
            >
              {/* Name */}
              <div>
                <p className="text-sm text-foreground">{group.name}</p>
                <p className="text-[11px] text-muted-foreground/60 font-mono">{group.id}</p>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground truncate">{group.description || '—'}</p>

              {/* Routes count */}
              <div>
                <span className="inline-flex items-center rounded-full bg-muted/50 border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {group.routes.length} rota{group.routes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleOpenEdit(group)}
                  className="text-muted-foreground/80 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeleteTarget(group)}
                  className="text-muted-foreground/80 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Group Form */}
      <GroupForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreate={create}
        onUpdate={update}
        group={editingGroup}
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
          {(() => {
            const assignedCount = deleteTarget ? users.filter((u) => u.groups.includes(deleteTarget.id)).length : 0;
            return (
              <>
                {assignedCount > 0 && (
                  <p className="text-xs text-amber-400/80 bg-amber-400/10 rounded-lg px-3 py-2 mb-2">
                    Este grupo tem {assignedCount} usuário{assignedCount > 1 ? 's' : ''} atribuído{assignedCount > 1 ? 's' : ''}.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Tem certeza que deseja excluir o grupo{' '}
                  <span className="text-foreground font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
                </p>
              </>
            );
          })()}
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

'use client';

import { useState, useMemo } from 'react';
import { Pencil, Trash2, Plus, Search } from 'lucide-react';
import { getFirebaseAuth } from '@/shared/lib/firebase/config';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { useAdminUsers } from '@/features/admin/model/useAdminUsers';
import { useAdminGroups } from '@/features/admin/model/useAdminGroups';
import { useAdminClients } from '@/features/admin/model/useAdminClients';
import { UserForm } from './UserForm';
import type { AppUser, SaveUserInput } from '@/features/admin/model/types';

export function UsersTab() {
  const { users, loading, save, remove } = useAdminUsers();
  const { groups } = useAdminGroups();
  const { clients } = useAdminClients();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  }, [users, search]);

  const groupsById = useMemo(() => {
    return Object.fromEntries(groups.map((g) => [g.id, g]));
  }, [groups]);

  const clientsById = useMemo(() => {
    return Object.fromEntries(clients.map((c) => [c.id, c]));
  }, [clients]);

  const handleOpenAdd = () => {
    setEditingUser(undefined);
    setFormOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const handleSave = async (id: string, data: SaveUserInput) => {
    return save(id, data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    const currentUserEmail = getFirebaseAuth().currentUser?.email;
    if (currentUserEmail && deleteTarget.email === currentUserEmail) {
      setDeleteError('Você não pode excluir seu próprio usuário.');
      return;
    }
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email ou nome..."
            className="pl-9 bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40 h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={handleOpenAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
        >
          <Plus className="size-3.5" />
          Adicionar usuário
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/60">
        {loading ? 'Carregando...' : `${filteredUsers.length} de ${users.length} usuário${users.length !== 1 ? 's' : ''}`}
      </p>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_80px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Email</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Nome</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Grupos</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider">Clientes</span>
          <span className="text-[11px] text-muted-foreground/80 uppercase tracking-wider text-right">Ações</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Carregando...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
            {search ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_80px] gap-3 px-4 py-3 items-start border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
            >
              {/* Email */}
              <div>
                <p className="text-sm text-foreground truncate">{user.email}</p>
                <p className="text-[11px] text-muted-foreground/60 font-mono">{user.id}</p>
              </div>

              {/* Display name */}
              <p className="text-sm text-muted-foreground truncate">{user.displayName || '—'}</p>

              {/* Groups */}
              <div className="flex flex-wrap gap-1">
                {user.groups.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground/40">—</span>
                ) : (
                  user.groups.map((gid) => {
                    const group = groupsById[gid];
                    return (
                      <span
                        key={gid}
                        className="inline-flex items-center rounded-full bg-muted/50 border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {group?.name ?? gid}
                      </span>
                    );
                  })
                )}
              </div>

              {/* Clients */}
              <div className="flex flex-wrap gap-1">
                {user.clientAccess.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground/40">—</span>
                ) : (
                  user.clientAccess.map((ca) => {
                    const client = clientsById[ca.clientId];
                    const isOrphaned = !client;
                    return (
                      <span
                        key={ca.clientId}
                        title={isOrphaned ? 'Cliente removido' : undefined}
                        className={
                          isOrphaned
                            ? 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border border-amber-400/40 bg-amber-400/10 text-amber-400'
                            : 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-black font-medium'
                        }
                        style={isOrphaned ? undefined : { backgroundColor: client.color, opacity: 0.9 }}
                      >
                        {isOrphaned ? `⚠ ${ca.clientId}` : `${client.initial} ${client.name}`}
                      </span>
                    );
                  })
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleOpenEdit(user)}
                  className="text-muted-foreground/80 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setDeleteTarget(user)}
                  className="text-muted-foreground/80 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* User Form */}
      <UserForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        user={editingUser}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteError(null); } }}>
        <DialogContent className="bg-popover border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o usuário{' '}
            <span className="text-foreground font-medium">{deleteTarget?.email}</span>? Esta ação não pode ser desfeita.
          </p>
          {deleteError && (
            <p className="text-sm text-red-400">{deleteError}</p>
          )}
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

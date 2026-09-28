'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { RouteCheckboxGrid } from './RouteCheckboxGrid';
import { ALL_ROUTES } from '@/features/admin/model/types';
import type { Group, GroupDoc } from '@/features/admin/model/types';

interface GroupFormProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Omit<GroupDoc, 'createdAt'>) => Promise<void>;
  onUpdate: (id: string, data: Partial<Omit<GroupDoc, 'createdAt'>>) => Promise<void>;
  group?: Group;
}

export function GroupForm({ open, onClose, onCreate, onUpdate, group }: GroupFormProps) {
  const isEdit = !!group;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [routes, setRoutes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (group) {
        setName(group.name);
        setDescription(group.description);
        setRoutes(group.routes.filter((r) => ALL_ROUTES.some((ar) => ar.path === r)));
      } else {
        setName('');
        setDescription('');
        setRoutes([]);
      }
      setError('');
    }
  }, [open, group]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome é obrigatório'); return; }

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await onUpdate(group!.id, {
          name: name.trim(),
          description: description.trim(),
          routes,
        });
      } else {
        await onCreate({
          name: name.trim(),
          description: description.trim(),
          routes,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-2xl w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? 'Editar Grupo' : 'Adicionar Grupo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do grupo"
              disabled={saving}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Descrição</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do grupo"
              disabled={saving}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Routes */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3 block">
              Rotas permitidas ({routes.length} selecionadas)
            </label>
            <RouteCheckboxGrid selected={routes} onChange={setRoutes} />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

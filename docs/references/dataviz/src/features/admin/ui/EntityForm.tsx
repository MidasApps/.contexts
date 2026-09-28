'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import type { Entity } from '@/shared/schemas';

interface EntityFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Entity, 'createdAt' | 'updatedAt'>) => Promise<void>;
  entity?: Entity;
  contractId: string;
}

export function EntityForm({ open, onClose, onSave, entity, contractId }: EntityFormProps) {
  const isEdit = !!entity;
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setId(entity?.id ?? '');
      setLabel(entity?.label ?? '');
      setDescription(entity?.description ?? '');
      setError(null);
    }
  }, [open, entity]);

  async function handleSave() {
    if (!id.trim()) return setError('ID is required (SqlIdentifier)');
    if (!label.trim()) return setError('Label is required');
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: id.trim(),
        label: label.trim(),
        description: description.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Entity' : 'New Entity'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            contract: {contractId}
          </p>
          <Field label="ID (SqlIdentifier — immutable after creation)">
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="contratos"
              disabled={isEdit || saving}
              className="bg-muted/40 border-border text-foreground font-mono placeholder:text-muted-foreground/40"
            />
          </Field>
          <Field label="Label">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Contratos"
              disabled={saving}
              className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contratos de financiamento imobiliário..."
              rows={3}
              disabled={saving}
              className="w-full rounded-md bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground/40 text-sm px-3 py-2"
            />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

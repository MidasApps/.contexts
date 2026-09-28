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
import type { DataContract } from '@/shared/schemas';

interface ContractFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Omit<DataContract, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  contract?: DataContract;
}

export function ContractForm({ open, onClose, onSave, contract }: ContractFormProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<DataContract['status']>('draft');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setId(contract?.id ?? '');
      setName(contract?.name ?? '');
      setStatus(contract?.status ?? 'draft');
      setDescription(contract?.description ?? '');
      setError(null);
    }
  }, [open, contract]);

  async function handleSave() {
    if (!id.trim()) return setError('ID is required (kebab-case)');
    if (!name.trim()) return setError('Name is required');
    setSaving(true);
    setError(null);
    try {
      await onSave(id, {
        name: name.trim(),
        version: contract?.version ?? '1.0.0',
        status,
        description: description.trim() || null,
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
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-2xl w-[90vw]">
        <DialogHeader>
          <DialogTitle>{contract ? 'Edit Contract' : 'New Contract'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_160px] gap-3">
            <Field label="ID (kebab-case)">
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="canonical"
                disabled={!!contract || saving}
                className="bg-muted/40 border-border text-foreground font-mono placeholder:text-muted-foreground/40"
              />
            </Field>
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Liquid Canonical Contract"
                disabled={saving}
                className="bg-muted/40 border-border text-foreground placeholder:text-muted-foreground/40"
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DataContract['status'])}
                disabled={saving}
                className="w-full h-9 rounded-md bg-muted/40 border border-border text-foreground text-sm px-3"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="deprecated">deprecated</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Canonical vocabulary for real estate credit data..."
              rows={4}
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

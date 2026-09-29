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
import { Textarea } from '@/shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import type { Attribute } from '@/shared/schemas';

const FIELD_TYPES = [
  'STRING',
  'INT64',
  'NUMERIC',
  'BIGNUMERIC',
  'FLOAT64',
  'BOOL',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIME',
  'BYTES',
  'GEOGRAPHY',
  'JSON',
] as const;

interface AttributeFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Attribute, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onRename: (oldId: string, data: Omit<Attribute, 'createdAt' | 'updatedAt'>) => Promise<void>;
  attribute?: Attribute;
  entityId: string;
  existingIds: string[];
}

export function AttributeForm({
  open,
  onClose,
  onSave,
  onRename,
  attribute,
  entityId,
  existingIds,
}: AttributeFormProps) {
  const isEdit = !!attribute;
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Attribute['type']>('STRING');
  const [unit, setUnit] = useState('');
  const [isKey, setIsKey] = useState(false);
  const [required, setRequired] = useState(false);
  const [deprecated, setDeprecated] = useState(false);
  const [deprecatedReason, setDeprecatedReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setId(attribute?.id ?? '');
      setLabel(attribute?.label ?? '');
      setDescription(attribute?.description ?? '');
      setType(attribute?.type ?? 'STRING');
      setUnit(attribute?.unit ?? '');
      setIsKey(attribute?.isKey ?? false);
      setRequired(attribute?.required ?? false);
      setDeprecated(attribute?.deprecated ?? false);
      setDeprecatedReason(attribute?.deprecatedReason ?? '');
      setError(null);
    }
  }, [open, attribute]);

  const trimmedId = id.trim();
  const isRename = isEdit && !!attribute && trimmedId !== attribute.id;
  const duplicateId =
    trimmedId.length > 0 &&
    trimmedId !== attribute?.id &&
    existingIds.includes(trimmedId);

  async function handleSave() {
    if (!trimmedId) return setError('ID is required (SqlIdentifier)');
    if (duplicateId) return setError(`Já existe um attribute com id "${trimmedId}" nesta entity`);
    if (!label.trim()) return setError('Label is required');
    if (deprecated && !deprecatedReason.trim()) {
      return setError('Deprecation reason is required when marking as deprecated');
    }
    setSaving(true);
    setError(null);
    try {
      const data = {
        id: trimmedId,
        entityId,
        label: label.trim(),
        description: description.trim(),
        type,
        unit: unit.trim() || null,
        isKey,
        required,
        deprecated,
        deprecatedReason: deprecated ? deprecatedReason.trim() : null,
      };
      if (isRename && attribute) {
        await onRename(attribute.id, data);
      } else {
        await onSave(data);
      }
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
          <DialogTitle>{isEdit ? 'Edit Attribute' : 'New Attribute'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            entity: {entityId}
          </p>
          {isRename && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200 leading-snug">
              <strong className="text-amber-300">Renaming attribute id</strong>
              {' — '}
              <span className="font-mono">{attribute?.id}</span>
              {' → '}
              <span className="font-mono">{trimmedId || '?'}</span>
              <br />
              Métricas, products ou SQL que referenciam o id antigo precisarão
              ser migrados manualmente. O doc antigo será removido após salvar.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="ID (SqlIdentifier)">
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="saldo_devedor"
                disabled={saving}
                aria-invalid={duplicateId}
                className="font-mono"
              />
              {duplicateId && (
                <p className="text-[10px] text-destructive mt-1">
                  Já existe um attribute com esse id nesta entity.
                </p>
              )}
            </Field>
            <Field label="Label">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Saldo Devedor"
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Saldo devedor atualizado em BRL..."
              rows={3}
              disabled={saving}
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 md:items-end">
            <Field label="Type">
              <Select
                value={type}
                onValueChange={(v) => setType(v as Attribute['type'])}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="font-mono">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit (optional)">
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="BRL"
                disabled={saving}
              />
            </Field>
            <div className="flex items-center gap-4 h-10">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Switch checked={isKey} onCheckedChange={setIsKey} disabled={saving} />
                isKey
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Switch checked={required} onCheckedChange={setRequired} disabled={saving} />
                required
              </label>
            </div>
          </div>

          {/* Deprecation section — destacada porque é decisão pesada */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 space-y-3">
            <label className="flex items-center gap-2 text-xs text-amber-300">
              <Switch
                checked={deprecated}
                onCheckedChange={setDeprecated}
                disabled={saving}
              />
              Mark as deprecated
            </label>
            {deprecated && (
              <Field label="Deprecation reason (required)">
                <Input
                  value={deprecatedReason}
                  onChange={(e) => setDeprecatedReason(e.target.value)}
                  placeholder="Substituído por ltv_originacao em 2026-04"
                  disabled={saving}
                />
              </Field>
            )}
            {!deprecated && attribute?.deprecated && (
              <p className="text-[10px] text-emerald-300/80">
                Reactivating this attribute — metrics depending on it become available again.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || duplicateId}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Saving...' : isRename ? 'Save & Rename' : 'Save'}
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

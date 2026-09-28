'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
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
import { useAdminEntities } from '@/features/admin/model/useAdminEntities';
import { useAdminAttributes } from '@/features/admin/model/useAdminAttributes';
import type { DataContract, Metric } from '@/shared/schemas';
import { MetricRecipe } from '@/shared/schemas/metric';

interface MetricFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Metric, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onRename: (oldId: string, data: Omit<Metric, 'createdAt' | 'updatedAt'>) => Promise<void>;
  metric?: Metric;
  /** Contracts available — picker permite cross-contract refs. */
  contracts: DataContract[];
  /** All existing metric ids (used for duplicate validation on rename). */
  existingIds: string[];
}

export function MetricForm({
  open,
  onClose,
  onSave,
  onRename,
  metric,
  contracts,
  existingIds,
}: MetricFormProps) {
  const isEdit = !!metric;
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [requires, setRequires] = useState<string[]>([]);
  const [status, setStatus] = useState<Metric['status']>('active');
  const [recipeJson, setRecipeJson] = useState('');
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picker em 3 passos: contract → entity → attribute.
  const defaultContractId =
    contracts.find((c) => c.id === 'canonical')?.id ?? contracts[0]?.id ?? '';
  const [pickContract, setPickContract] = useState<string>(defaultContractId);
  const [pickEntity, setPickEntity] = useState<string>('');
  const { entities } = useAdminEntities(pickContract || null);
  const { attributes } = useAdminAttributes(
    pickContract || null,
    pickEntity || null,
  );

  useEffect(() => {
    if (open) {
      setId(metric?.id ?? '');
      setLabel(metric?.label ?? '');
      setDescription(metric?.description ?? '');
      setRequires(metric?.requires ?? []);
      setStatus(metric?.status ?? 'active');
      setRecipeJson(metric?.recipe ? JSON.stringify(metric.recipe, null, 2) : '');
      setRecipeError(null);
      setError(null);
      setPickContract(defaultContractId);
      setPickEntity('');
    }
  }, [open, metric, defaultContractId]);

  function addRef(contractId: string, entityId: string, attributeId: string) {
    const ref = `${contractId}.${entityId}.${attributeId}`;
    if (requires.includes(ref)) return;
    setRequires([...requires, ref]);
  }

  function removeRef(ref: string) {
    setRequires(requires.filter((r) => r !== ref));
  }

  const availableAttrs = useMemo(() => {
    if (!pickContract || !pickEntity) return [];
    return attributes.filter(
      (a) => !requires.includes(`${pickContract}.${pickEntity}.${a.id}`),
    );
  }, [attributes, requires, pickContract, pickEntity]);

  const trimmedId = id.trim();
  const isRename = isEdit && !!metric && trimmedId !== metric.id;
  const duplicateId =
    trimmedId.length > 0 &&
    trimmedId !== metric?.id &&
    existingIds.includes(trimmedId);

  async function handleSave() {
    if (!trimmedId) return setError('ID is required (format "domain.slug")');
    if (duplicateId) return setError(`Já existe uma metric com id "${trimmedId}"`);
    if (!label.trim()) return setError('Label is required');
    if (requires.length === 0) return setError('Add at least 1 attribute to requires');

    let recipe: Metric['recipe'] | undefined;
    if (recipeJson.trim()) {
      try {
        const parsed = JSON.parse(recipeJson);
        const result = MetricRecipe.safeParse(parsed);
        if (!result.success) {
          setRecipeError(result.error.issues.map((i) => i.message).join('; '));
          return;
        }
        recipe = result.data;
      } catch (e) {
        setRecipeError(e instanceof Error ? e.message : 'JSON inválido');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const data = {
        id: trimmedId,
        label: label.trim(),
        description: description.trim() || null,
        // type/category/unit/version persistidos via defaults do schema.
        type: metric?.type ?? 'kpi',
        category: metric?.category ?? null,
        unit: metric?.unit ?? null,
        requires,
        ...(recipe ? { recipe } : {}),
        version: metric?.version ?? '1.0.0',
        status,
        // Preserva o dono ao editar; novas métricas da Admin nascem globais (null).
        ownerClientId: metric?.ownerClientId ?? null,
      };
      if (isRename && metric) {
        await onRename(metric.id, data);
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
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-3xl w-[92vw]">
        <DialogHeader>
          <DialogTitle>{metric ? 'Edit Metric' : 'New Metric'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {isRename && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200 leading-snug">
              <strong className="text-amber-300">Renaming metric id</strong>
              {' — '}
              <span className="font-mono">{metric?.id}</span>
              {' → '}
              <span className="font-mono">{trimmedId || '?'}</span>
              <br />
              Products ou SQL que referenciam o id antigo precisarão ser
              migrados manualmente. O doc antigo será removido após salvar.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_180px] gap-3">
            <Field label='ID (format "domain.slug")'>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="pdd.total"
                disabled={saving}
                aria-invalid={duplicateId}
                className="font-mono"
              />
              {duplicateId && (
                <p className="text-[10px] text-destructive mt-1">
                  Já existe uma metric com esse id.
                </p>
              )}
            </Field>
            <Field label="Label">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="PDD Total"
                disabled={saving}
              />
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Metric['status'])}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="deprecated">deprecated</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provisão para devedores duvidosos..."
              rows={3}
              disabled={saving}
            />
          </Field>

          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Requires (attributes from data contracts)
            </label>
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
              {requires.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {requires.map((ref) => (
                    <div
                      key={ref}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/40 border border-border px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono text-foreground truncate">{ref}</span>
                      <button
                        onClick={() => removeRef(ref)}
                        className="text-muted-foreground/80 hover:text-destructive transition-colors"
                        aria-label={`Remove ${ref}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 px-1">No attributes referenced yet.</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-3 border-t border-border">
                <Select
                  value={pickContract || undefined}
                  onValueChange={(v) => {
                    setPickContract(v);
                    setPickEntity('');
                  }}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Contract…" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={pickEntity || undefined}
                  onValueChange={setPickEntity}
                  disabled={!pickContract || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Entity…" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && pickContract && pickEntity) {
                      addRef(pickContract, pickEntity, v);
                    }
                  }}
                  disabled={!pickEntity || saving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Add attribute…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAttrs.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.id} {a.deprecated ? '(deprec.)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Recipe (JSON — opcional)
            </label>
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                Define como a métrica é calculada. <code>kind:&nbsp;&quot;aggregation&quot;</code> para
                sum/count/avg estruturados (com timeAttribute, groupBy, filters),
                ou <code>kind:&nbsp;&quot;sql&quot;</code> para template com placeholders{' '}
                <code>{'{entity.attribute}'}</code>,{' '}
                <code>{'{entity}'}</code>,{' '}
                <code>{'{filter.X}'}</code>.
              </p>
              <Textarea
                value={recipeJson}
                onChange={(e) => {
                  setRecipeJson(e.target.value);
                  setRecipeError(null);
                }}
                placeholder={`{\n  "kind": "aggregation",\n  "primaryEntity": "contratos",\n  "aggregation": "sum",\n  "valueAttribute": "contratos.saldo_devedor",\n  "filters": [\n    { "attribute": "contratos.data_base_report", "op": "=", "value": "filter.snapshot" }\n  ]\n}`}
                rows={10}
                disabled={saving}
                className="font-mono text-xs"
                aria-invalid={!!recipeError}
              />
              {recipeError && (
                <p className="text-[11px] text-destructive">{recipeError}</p>
              )}
            </div>
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

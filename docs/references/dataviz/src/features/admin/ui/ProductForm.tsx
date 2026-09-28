'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import type { Product, ProductStatus } from '@/shared/schemas';
import { EntityRefsPicker } from './EntityRefsPicker';
import { MetricRefsPicker } from './MetricRefsPicker';
import { useEntityContractCatalog } from '@/features/admin/model/useEntityContractCatalog';
import { deriveContractRefs } from '@/shared/lib/semantic/derive-contract-refs';
import { slugify } from '@/shared/lib/slug';

type ProductFormData = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

const STATUSES: ProductStatus[] = ['active', 'draft', 'archived'];
const PRESET_COLORS = ['#F3A169', '#6B8AFF', '#4ECDC4', '#FF6B6B', '#A78BFA', '#34D399'];

export interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: ProductFormData) => Promise<void>;
  product?: Product;
}

export function ProductForm({ open, onClose, onSave, product }: ProductFormProps) {
  const isEdit = !!product;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('Package');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [description, setDescription] = useState('');
  const [entityRefs, setEntityRefs] = useState<string[]>([]);
  const [metricRefs, setMetricRefs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { catalog } = useEntityContractCatalog();

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setSlug(product.slug);
      setIcon(product.icon);
      setColor(product.color);
      setStatus(product.status);
      setDescription(product.description ?? '');
      setEntityRefs(product.entityRefs ?? []);
      setMetricRefs(product.metricRefs ?? []);
    } else {
      setName('');
      setSlug('');
      setIcon('Package');
      setColor(PRESET_COLORS[0]);
      setStatus('draft');
      setDescription('');
      setEntityRefs([]);
      setMetricRefs([]);
    }
    setError(null);
  }, [open, product?.id]);

  const id = product ? product.id : slugify(slug || name);

  async function handleSave() {
    if (!name.trim()) return setError('Nome obrigatório');
    if (!id) return setError('ID obrigatório');
    if (entityRefs.length === 0) {
      return setError('Selecione ao menos uma entity do catálogo');
    }
    // contractRefs DERIVADOS dos contratos das entities selecionadas — nunca o
    // literal 'canonical' (G2). Se nenhum contrato casou (catálogo carregando
    // ou entities órfãs), falha-cedo em vez de gravar produto sem contrato.
    const contractRefs = deriveContractRefs(entityRefs, catalog);
    if (contractRefs.length === 0) {
      return setError(
        'Não foi possível derivar o contrato das entities selecionadas (catálogo carregando ou entities órfãs). Aguarde e tente novamente.',
      );
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(id, {
        name: name.trim(),
        slug: id,
        icon: icon.trim() || 'Package',
        color,
        status,
        description: description.trim() || null,
        contractRefs,
        entityRefs,
        metricRefs,
        // Legado zerado — produto novo nasce 100% canônico.
        indicators: [],
        // Routes preservadas se já existirem (Covenants legado); ProductForm
        // não cria mais routes — navegação é dinâmica via groups/reports.
        routes: product?.routes ?? [],
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Produto' : 'Adicionar Produto'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_180px] gap-3">
            <Field label="Nome">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do produto"
                disabled={saving}
              />
            </Field>
            <Field label="Slug (kebab-case)">
              <Input
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="nome-do-produto"
                disabled={saving || isEdit}
                className="font-mono"
              />
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProductStatus)}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
            <Field label="ID">
              <div className="rounded-lg border border-border bg-muted/40 px-4 h-10 flex items-center text-sm text-muted-foreground/80 font-mono">
                {id || '—'}
              </div>
            </Field>
            <Field label="Icon (Lucide name)">
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="ShieldCheck"
                disabled={saving}
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Cor">
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`size-8 rounded-full border-2 transition-all ${
                    color === c
                      ? 'border-white scale-110'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </Field>

          <Field label="Descrição">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descrição do produto"
              disabled={saving}
            />
          </Field>

          <Divider />

          <EntityRefsPicker value={entityRefs} onChange={setEntityRefs} />

          <Divider />

          <MetricRefsPicker
            value={metricRefs}
            onChange={setMetricRefs}
            availableEntityIds={entityRefs}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
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

function Divider() {
  return <hr className="border-border" />;
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

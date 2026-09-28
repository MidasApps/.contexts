'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { slugify } from '@/shared/lib/slug';
import {
  TemplateMetaFields,
  EMPTY_TEMPLATE_META,
  type TemplateMeta,
} from '@/features/templates/ui/TemplateMetaFields';

export interface TemplateMetadata extends TemplateMeta {
  id: string;
}

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: TemplateMetadata) => Promise<void>;
  existingIds: string[];
  products: Array<{ id: string; name: string }>;
  /** Quando presente = modo edição (id imutável). */
  template?: TemplateMetadata;
}

/**
 * Metadados de catálogo de um template. Os CAMPOS moram em
 * `TemplateMetaFields`, compartilhados com o diálogo que publica uma página
 * como template — este formulário é só a moldura do admin.
 */
export function TemplateForm({ open, onClose, onSave, existingIds, products, template }: TemplateFormProps) {
  const editing = !!template;
  const [meta, setMeta] = useState<TemplateMeta>(EMPTY_TEMPLATE_META);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMeta(template ? { ...template } : EMPTY_TEMPLATE_META);
    setError(null);
  }, [open, template]);

  async function handleSave() {
    const id = editing ? template!.id : slugify(meta.name);
    if (!id) { setError('Nome inválido'); return; }
    if (meta.name.trim().length < 2) { setError('Nome muito curto'); return; }
    if (!editing && existingIds.includes(id)) { setError(`Já existe um template "${id}"`); return; }
    if (meta.productRefs.length === 0) { setError('Selecione ao menos um produto'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...meta,
        id,
        name: meta.name.trim(),
        description: meta.description.trim(),
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
      {/* Acompanha o diálogo de salvar template: os dois montam os MESMOS
          campos, que agora vêm em duas colunas. */}
      <DialogContent className="border-border bg-popover text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar template' : 'Novo template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <TemplateMetaFields
            value={meta}
            onChange={(patch) => setMeta((cur) => ({ ...cur, ...patch }))}
            products={products}
            disabled={saving}
            nameHint={
              !editing && meta.name ? (
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  id: {slugify(meta.name)}
                </span>
              ) : null
            }
          />

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

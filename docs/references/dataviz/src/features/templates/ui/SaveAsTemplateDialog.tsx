'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { slugify } from '@/shared/lib/slug';
import { deriveMetricRefs } from '@/shared/config/agents/template-blocks';
import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { TemplateMetaFields, type TemplateMeta } from './TemplateMetaFields';

/** O que de uma página vira template: o conteúdo, não a rota nem os dados. */
export interface PageForTemplate {
  name: string;
  description?: string;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  queries?: TemplateQueryConfig[];
  /** Template de origem, quando a página nasceu de um import. */
  templateId?: string;
  productRefs?: string[];
}

export interface SaveAsTemplateSubmit {
  mode: 'create' | 'update';
  record: TemplateRecord;
}

interface SaveAsTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  page: PageForTemplate;
  /** Candidatos a sobrescrever, e também os ids já ocupados. */
  templates: TemplateRecord[];
  products: Array<{ id: string; name: string }>;
  /**
   * A página tem edições abertas no canvas. O template sai do DOCUMENTO
   * salvo, então gerar agora produziria um template sem as mudanças que estão
   * na tela — silenciosamente. Bloqueia e manda salvar antes.
   */
  pendingDraft?: boolean;
  onSubmit: (submit: SaveAsTemplateSubmit) => Promise<void>;
}

function pageMeta(page: PageForTemplate): TemplateMeta {
  return {
    name: page.name,
    description: page.description ?? '',
    category: 'Carteira',
    productRefs: page.productRefs ?? [],
    status: 'active',
  };
}

function metaDoTemplate(t: TemplateRecord): TemplateMeta {
  return {
    name: t.name,
    description: t.description ?? '',
    category: t.category,
    productRefs: t.productRefs ?? [],
    segment: t.segment,
    status: t.status,
  };
}

/**
 * Gera um Dashboard Template a partir de uma página que já existe.
 *
 * Substitui o editor de templates do admin: em vez de montar a página de novo
 * num canvas sem dado e sem assistente, publica-se a página que já funciona.
 * Editar um template é, portanto, importá-lo, mexer na página e salvar por
 * cima — daí o modo "atualizar existente".
 */
export function SaveAsTemplateDialog({
  open,
  onClose,
  page,
  templates,
  products,
  pendingDraft,
  onSubmit,
}: SaveAsTemplateDialogProps) {
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [targetId, setTargetId] = useState<string>('');
  const [meta, setMeta] = useState<TemplateMeta>(() => pageMeta(page));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * O template de origem da página, quando já existe no catálogo.
   *
   * As dependências do reset abaixo são ESTE id e `open` — dois primitivos —
   * e não `page`/`templates`. O pai monta o objeto `page` inline, então ele
   * troca de identidade a cada render dele; um efeito que observasse a
   * identidade apagaria o formulário no meio do preenchimento. Ainda assim o
   * reset precisa rodar quando o catálogo CHEGA (ele vem por fetch, e no
   * primeiro render está vazio) — é o que `origemId: null → 'pdd'` captura.
   */
  const sourceId = templates.find((t) => t.id === page.templateId)?.id ?? null;

  useEffect(() => {
    if (!open) return;
    // Página importada de template abre já apontando para ele: publicar de
    // volta é o caminho comum, criar um irmão é a exceção.
    const origem = sourceId ? templates.find((t) => t.id === sourceId) : undefined;
    if (origem) {
      setMode('update');
      setTargetId(origem.id);
      setMeta(metaDoTemplate(origem));
    } else {
      setMode('create');
      setTargetId('');
      setMeta(pageMeta(page));
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentário acima
  }, [open, sourceId]);

  function switchMode(isNew: 'create' | 'update') {
    setError(null);
    setMode(isNew);
    if (isNew === 'create') {
      setTargetId('');
      setMeta(pageMeta(page));
      return;
    }
    const target = templates.find((t) => t.id === targetId) ?? templates[0];
    if (target) {
      setTargetId(target.id);
      setMeta(metaDoTemplate(target));
    }
  }

  function chooseTarget(id: string) {
    setError(null);
    setTargetId(id);
    const target = templates.find((t) => t.id === id);
    if (target) setMeta(metaDoTemplate(target));
  }

  async function handleSubmit() {
    if (pendingDraft) return;

    const id = mode === 'update' ? targetId : slugify(meta.name);
    if (mode === 'update' && !id) { setError('Escolha o template a atualizar'); return; }
    if (mode === 'create') {
      if (meta.name.trim().length < 2) { setError('Nome muito curto'); return; }
      if (!id) { setError('Nome inválido'); return; }
      if (templates.some((t) => t.id === id)) {
        setError(`Já existe um template "${id}" — escolha atualizar se a intenção é sobrescrever`);
        return;
      }
    }
    if (meta.productRefs.length === 0) { setError('Selecione ao menos um produto'); return; }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        mode,
        record: {
          id,
          name: meta.name.trim(),
          description: meta.description.trim(),
          category: meta.category,
          productRefs: meta.productRefs,
          segment: meta.segment,
          status: meta.status,
          blockMap: page.blockMap,
          layout: page.layout,
          filters: page.filters,
          queries: page.queries,
          metricRefs: deriveMetricRefs(page.blockMap),
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  const totalBlocks = Object.keys(page.blockMap).length;
  const hasNoTemplates = templates.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* `2xl` e não `md`: os campos passaram a duas colunas, e em 448px cada
          uma ficaria com ~200px — estreito demais para um nome de template. */}
      <DialogContent className="border-border bg-popover text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Salvar como template</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-[11px] text-muted-foreground/70">
            {totalBlocks} bloco{totalBlocks === 1 ? '' : 's'} de “{page.name}” — os blocos, o layout e
            os filtros da página, sem os dados.
          </p>

          {pendingDraft && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              Salve a página antes de gerar o template: o template sai do documento salvo, e as
              edições abertas no canvas ficariam de fora.
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="sr-only">Destino</legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="destino-do-template"
                aria-label="Criar template novo"
                checked={mode === 'create'}
                onChange={() => switchMode('create')}
                className="size-3 accent-primary"
              />
              Criar template novo
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name="destino-do-template"
                aria-label="Atualizar template existente"
                checked={mode === 'update'}
                disabled={hasNoTemplates}
                onChange={() => switchMode('update')}
                className="size-3 accent-primary"
              />
              Atualizar template existente
            </label>
          </fieldset>

          {mode === 'update' && (
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Template a atualizar</span>
              <select
                aria-label="Template a atualizar"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={targetId}
                disabled={saving}
                onChange={(e) => chooseTarget(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}

          <TemplateMetaFields
            value={meta}
            onChange={(patch) => setMeta((cur) => ({ ...cur, ...patch }))}
            products={products}
            disabled={saving}
            nameHint={
              mode === 'create' && meta.name ? (
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
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || pendingDraft}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? 'Salvando…' : 'Salvar template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

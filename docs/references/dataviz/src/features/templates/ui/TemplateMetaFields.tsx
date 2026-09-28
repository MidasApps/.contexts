'use client';

import type { ReactNode } from 'react';
import { Input } from '@/shared/ui/input';

/**
 * Os metadados de catálogo de um Dashboard Template — o que a galeria usa
 * para filtrar e descrever, separado do conteúdo (blocos e layout).
 *
 * Mora aqui, e não dentro do admin, porque dois lugares editam os MESMOS
 * campos: o formulário do catálogo (`TemplateForm`) e o diálogo que gera
 * template a partir de uma página (`SaveAsTemplateDialog`). Duplicar a
 * marcação faria os dois divergirem no primeiro campo novo.
 */
export interface TemplateMeta {
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional' | 'Covenants' | 'Imobiliária';
  productRefs: string[];
  segment?: 'sbpe' | 'mcmv' | 'both';
  status: 'active' | 'draft' | 'archived';
}

export const EMPTY_TEMPLATE_META: TemplateMeta = {
  name: '',
  description: '',
  category: 'Carteira',
  productRefs: [],
  status: 'active',
};

const CATEGORIES = ['Carteira', 'Risco', 'Operacional', 'Covenants', 'Imobiliária'] as const;
const SEGMENTS = ['', 'sbpe', 'mcmv', 'both'] as const;
const STATUSES = ['active', 'draft', 'archived'] as const;

const selectCls =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground';

interface TemplateMetaFieldsProps {
  value: TemplateMeta;
  onChange: (patch: Partial<TemplateMeta>) => void;
  products: Array<{ id: string; name: string }>;
  disabled?: boolean;
  /** Linha auxiliar abaixo do nome — usada para mostrar o id derivado. */
  nameHint?: ReactNode;
}

export function TemplateMetaFields({
  value,
  onChange,
  products,
  disabled,
  nameHint,
}: TemplateMetaFieldsProps) {
  return (
    /*
     * Duas colunas a partir de `sm`, e não uma pilha.
     *
     * Em coluna única os seis campos somavam mais que a tela: o diálogo de
     * salvar template media 676px numa viewport de 662px e saía cortado nas
     * duas pontas. Em duas colunas são três fileiras — Nome|Descrição,
     * Categoria|Segmento, Status|Produtos — e a altura cai pela metade.
     *
     * A grade é uma só, plana. Categoria, Segmento e Status viviam numa
     * sub-grade `grid-cols-2` própria, que deixava um buraco ao lado do Status
     * por ser o terceiro de dois. Achatar resolve o buraco de graça.
     *
     * Abaixo de `sm` volta a ser uma coluna: em 400px de largura, duas colunas
     * dariam campos de 180px.
     */
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Nome</span>
        <Input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Nome"
          disabled={disabled}
        />
        {nameHint}
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Descrição</span>
        <Input
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          aria-label="Descrição"
          disabled={disabled}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Categoria</span>
        <select
          aria-label="Categoria"
          className={selectCls}
          value={value.category}
          disabled={disabled}
          onChange={(e) => onChange({ category: e.target.value as TemplateMeta['category'] })}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Segmento</span>
        <select
          aria-label="Segmento"
          className={selectCls}
          value={value.segment ?? ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ segment: (e.target.value || undefined) as TemplateMeta['segment'] })
          }
        >
          {SEGMENTS.map((s) => <option key={s || 'none'} value={s}>{s || '—'}</option>)}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <select
          aria-label="Status"
          className={selectCls}
          value={value.status}
          disabled={disabled}
          onChange={(e) => onChange({ status: e.target.value as TemplateMeta['status'] })}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Produtos</span>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
          {products.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-muted-foreground/60">Nenhum produto disponível.</p>
          ) : (
            products.map((p) => {
              const checked = value.productRefs.includes(p.id);
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    aria-label={p.name}
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      onChange({
                        productRefs: checked
                          ? value.productRefs.filter((id) => id !== p.id)
                          : [...value.productRefs, p.id],
                      })
                    }
                    className="size-3 accent-primary"
                  />
                  {p.name}
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

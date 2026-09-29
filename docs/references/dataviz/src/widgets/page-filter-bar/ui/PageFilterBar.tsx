'use client';

import { useEffect, useState } from 'react';
import { MultiSelectCombobox } from '@/shared/ui/multi-select-combobox';
import { fetchFilterValues, type FilterValueOption } from '@/shared/lib/metrics/fetch-filter-values';
import type { CanvasPageFilters } from '@/shared/config/agents/types';

interface PageFilterBarProps {
  filters?: CanvasPageFilters;
  clientId?: string;
  productId?: string;
  /** Seleção atual por key de `metricPageFilters` (G3). */
  values: Record<string, string[]>;
  onChange: (key: string, selected: string[]) => void;
}

interface DropdownState {
  options: FilterValueOption[];
  loading: boolean;
  error: string | null;
}

/**
 * Barra de filtros locais por atributo (G3): um `MultiSelectCombobox` para
 * cada entrada de `metricPageFilters` com `control: 'dropdown'`. Opções vêm
 * de `POST /api/metrics/filter-values`; a seleção é repassada ao chamador
 * (que injeta em `useReportData`'s `pageFilterValues`).
 *
 * Sem entradas dropdown declaradas → não renderiza nada (retrocompat com
 * templates/reports existentes).
 */
export function PageFilterBar({ filters, clientId, productId, values, onChange }: PageFilterBarProps) {
  const dropdownEntries = Object.entries(filters?.metricPageFilters ?? {}).filter(
    ([, cfg]) => cfg.kind === 'in' && cfg.control === 'dropdown',
  );
  // A assinatura precisa cobrir os DOIS modos: dois filtros por campo do
  // indicador têm `attribute` indefinido, e sem a origem na assinatura trocar a
  // métrica de um deles não refaria a busca.
  const dropdownSignature = dropdownEntries
    .map(([key, cfg]) => [
      key,
      cfg.attribute ?? '',
      cfg.labelAttribute ?? '',
      cfg.source ? `${cfg.source.metricId}#${cfg.source.field}` : '',
    ].join(':'))
    .join(',');

  const [state, setState] = useState<Record<string, DropdownState>>({});

  /*
   * ─── Por que não há mais uma trava de "já busquei esta assinatura" ────────
   *
   * Havia um `fetchedSignatureRef` para evitar buscar duas vezes. Ele
   * conversava mal com o `cancelled` da limpeza, e a combinação dos dois
   * ESVAZIAVA o dropdown: em desenvolvimento o React monta o efeito, limpa e
   * monta de novo (StrictMode). A primeira passada gravava a assinatura e
   * disparava a busca; a limpeza marcava `cancelled`; a segunda passada via a
   * assinatura igual e desistia — e aí a resposta da primeira chegava e era
   * descartada. Resultado: requisição 200 com os valores certos no Network e
   * "Nenhum resultado" na tela, para sempre.
   *
   * As dependências já são a trava correta: o efeito só roda de novo quando
   * cliente, produto ou a lista de dropdowns muda — exatamente quando se QUER
   * buscar de novo. Em StrictMode ele busca duas vezes; a segunda resposta
   * vence, e o custo é uma leitura de valores distintos.
   */
  useEffect(() => {
    if (!clientId || !productId || dropdownEntries.length === 0) return;

    let cancelled = false;
    for (const [key, cfg] of dropdownEntries) {
      // Sem origem declarada não há o que buscar — e mandar `attribute:
      // undefined` levaria a rota a devolver 400 para cada render.
      if (!cfg.source && !cfg.attribute) continue;
      setState((prev) => ({ ...prev, [key]: { options: prev[key]?.options ?? [], loading: true, error: null } }));
      const origem = cfg.source
        ? { metricId: cfg.source.metricId, field: cfg.source.field }
        : { attribute: cfg.attribute!, labelAttribute: cfg.labelAttribute };
      fetchFilterValues({ clientId, productId, ...origem })
        .then((options) => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, [key]: { options, loading: false, error: null } }));
        })
        .catch((err) => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            [key]: { options: [], loading: false, error: err instanceof Error ? err.message : 'Erro ao carregar filtro' },
          }));
        });
    }
    return () => {
      cancelled = true;
    };
    // dropdownEntries é derivado de `filters` a cada render; `dropdownSignature`
    // já captura toda mudança relevante (key/attribute/labelAttribute).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, productId, dropdownSignature]);

  if (dropdownEntries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      {dropdownEntries.map(([key, cfg]) => {
        const entry = state[key];
        const options = entry?.options ?? [];
        const labelByValue = new Map(options.map((o) => [o.value, o.label ?? o.value]));
        const valueByLabel = new Map(options.map((o) => [o.label ?? o.value, o.value]));
        const displayOptions = options.map((o) => o.label ?? o.value);
        const selectedValues = values[key] ?? [];
        const selectedLabels = selectedValues.map((v) => labelByValue.get(v) ?? v);
        const label = cfg.label ?? key;

        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">
              {label}
            </span>
            <MultiSelectCombobox
              options={displayOptions}
              selected={selectedLabels}
              onChange={(labels) => onChange(key, labels.map((l) => valueByLabel.get(l) ?? l))}
              itemLabelPlural="itens"
              noneSelectedLabel="Todos"
              warnOnEmpty={false}
              searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
            />
            {entry?.error && (
              <span className="text-[10px] text-destructive">{entry.error}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

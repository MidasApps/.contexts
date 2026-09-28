'use client';

/**
 * Picker de Data Metrics do catálogo para um Product.
 *
 * Substitui a declaração embedded de `indicators` (ADR-0015). Lista métricas
 * do catálogo `metrics/*`. Filtra automaticamente para métricas cujas
 * `requires` referenciem entities já selecionadas no produto — assim impede
 * métricas órfãs (dependentes de entity que o produto não consome).
 */

import { useMemo } from 'react';
import { Activity, Search } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { useAdminMetrics } from '@/features/admin/model/useAdminMetrics';
import { useState } from 'react';

interface MetricRefsPickerProps {
  /** IDs de métricas selecionadas. */
  value: string[];
  onChange: (metricIds: string[]) => void;
  /** Entity IDs disponíveis no produto — restringe métricas elegíveis. */
  availableEntityIds: string[];
}

export function MetricRefsPicker({
  value,
  onChange,
  availableEntityIds,
}: MetricRefsPickerProps) {
  const { metrics, loading } = useAdminMetrics();
  const [search, setSearch] = useState('');
  const selected = new Set(value);
  const availableEntities = useMemo(
    () => new Set(availableEntityIds),
    [availableEntityIds],
  );

  function toggle(metricId: string) {
    const next = new Set(selected);
    if (next.has(metricId)) next.delete(metricId);
    else next.add(metricId);
    onChange(Array.from(next));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics
      .filter((m) => m.status === 'active')
      .filter((m) => {
        if (availableEntities.size === 0) return true;
        // Métrica é elegível se TODAS as entities que ela requer estão no produto.
        return m.requires.every((ref) => {
          const entityId = ref.split('.')[1];
          return entityId && availableEntities.has(entityId);
        });
      })
      .filter((m) => {
        if (!q) return true;
        return (
          m.id.toLowerCase().includes(q) ||
          m.label.toLowerCase().includes(q)
        );
      });
  }, [metrics, search, availableEntities]);

  const blockedByEntity = availableEntities.size === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Data Metrics oferecidas
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {value.length} selecionada{value.length !== 1 ? 's' : ''}
        </span>
      </div>

      {blockedByEntity ? (
        <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.04] px-4 py-6 text-center text-xs text-amber-300">
          Selecione ao menos uma entity acima para listar métricas
          compatíveis.
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by id or label…"
              className="pl-9"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="text-[11px] text-muted-foreground/60 px-3 py-4 text-center">
                Loading metrics…
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 px-3 py-4 text-center">
                {metrics.length === 0
                  ? 'Nenhuma métrica no catálogo ainda.'
                  : 'Nenhuma métrica compatível com as entities selecionadas.'}
              </p>
            ) : (
              filtered.map((m) => {
                const isSelected = selected.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-b border-border last:border-b-0 transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(m.id)}
                      className="size-3 accent-primary"
                    />
                    <Activity className="size-3.5 text-muted-foreground/80" />
                    <span className="font-mono text-foreground">{m.id}</span>
                    <span className="text-muted-foreground/80 truncate flex-1">
                      — {m.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                      {m.requires.length} attr
                      {m.requires.length !== 1 ? 's' : ''}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

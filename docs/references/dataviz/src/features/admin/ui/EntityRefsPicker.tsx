'use client';

/**
 * Picker de Entities do catálogo canônico para um Product.
 *
 * Substitui a declaração embedded de `expectedTables` (ADR-0015). Lista
 * entities agrupadas por contract; o usuário escolhe quais o produto consome.
 *
 * Output: array de entity IDs. `contractRefs` é derivado da lista de
 * contracts cujas entities foram selecionadas.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import { useAdminContracts } from '@/features/admin/model/useAdminContracts';
import type { DataContract, Entity } from '@/shared/schemas';

interface EntityRefsPickerProps {
  /** IDs de entities selecionadas. */
  value: string[];
  onChange: (entityIds: string[]) => void;
}

export function EntityRefsPicker({ value, onChange }: EntityRefsPickerProps) {
  const { contracts, loading } = useAdminContracts();
  const selected = new Set(value);

  function toggle(entityId: string) {
    const next = new Set(selected);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Entities consumidas
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {value.length} selecionada{value.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground/80">
          Loading contracts…
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.04] px-4 py-6 text-center text-xs text-amber-300">
          Nenhum Data Contract criado. Crie um contract com entities antes de
          vincular a um produto.
        </div>
      ) : (
        contracts.map((contract) => (
          <ContractGroup
            key={contract.id}
            contract={contract}
            selected={selected}
            onToggle={toggle}
          />
        ))
      )}
    </div>
  );
}

interface ContractGroupProps {
  contract: DataContract;
  selected: Set<string>;
  onToggle: (entityId: string) => void;
}

function ContractGroup({ contract, selected, onToggle }: ContractGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
        const user = getFirebaseAuth().currentUser;
        const token = user ? await user.getIdToken() : null;
        const res = await window.fetch(
          `/api/data-contracts/${encodeURIComponent(contract.id)}/entities`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setEntities((body.data ?? []) as Entity[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contract.id]);

  const selectedCount = entities.filter((e) => selected.has(e.id)).length;

  return (
    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground/80" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground/80" />
        )}
        <Database className="size-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">{contract.name}</span>
        <span className="text-[11px] text-muted-foreground/60 font-mono">{contract.id}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/80">
          {selectedCount}/{entities.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border bg-black/20 px-3 py-2">
          {loading ? (
            <p className="text-[11px] text-muted-foreground/60 py-1">Loading entities…</p>
          ) : entities.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 py-1">
              Sem entities neste contract.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {entities.map((entity) => {
                const isSelected = selected.has(entity.id);
                return (
                  <label
                    key={entity.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/30'
                        : 'border border-transparent hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(entity.id)}
                      className="size-3 accent-primary"
                    />
                    <span className="font-mono text-foreground">{entity.id}</span>
                    <span className="text-muted-foreground/80 truncate">— {entity.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

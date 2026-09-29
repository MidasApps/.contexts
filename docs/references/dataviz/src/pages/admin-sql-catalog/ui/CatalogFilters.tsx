'use client';

import type { SqlCatalogStatus } from '@/features/sql-catalog/repository';
import { Input } from '@/shared/ui/input';

export interface CatalogFiltersValue {
  clientId: string;
  status?: SqlCatalogStatus;
  personaId?: string;
  search?: string;
}

const STATUSES: SqlCatalogStatus[] = ['draft', 'approved', 'deprecated', 'needs_revalidation'];

interface Props {
  value: CatalogFiltersValue;
  onChange: (next: CatalogFiltersValue) => void;
  /**
   * Clientes vindos do cadastro (`/api/clients`), não de lista no código.
   *
   * Já foi um array literal com os acrônimos legados, e o sintoma foi o
   * previsível: quando eles saíram e o Vila Rosa entrou, o filtro ficou
   * oferecendo clientes que não existiam e escondendo o único que existia.
   */
  clients: { id: string; name: string }[];
}

export function CatalogFilters({ value, onChange, clients }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cliente
        <select
          aria-label="clientId"
          className="rounded border border-border bg-muted/40 px-2 py-1 text-sm text-foreground"
          value={value.clientId}
          onChange={(e) => onChange({ ...value, clientId: e.target.value })}
        >
          {clients.length === 0 && <option value="">(nenhum cliente cadastrado)</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.id}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Status
        <select
          aria-label="status"
          className="rounded border border-border bg-muted/40 px-2 py-1 text-sm text-foreground"
          value={value.status ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...value, status: v ? (v as SqlCatalogStatus) : undefined });
          }}
        >
          <option value="">Todos</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Persona
        <Input
          aria-label="personaId"
          value={value.personaId ?? ''}
          onChange={(e) => onChange({ ...value, personaId: e.target.value || undefined })}
          placeholder="(opcional)"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Busca
        <Input
          aria-label="search"
          value={value.search ?? ''}
          onChange={(e) => onChange({ ...value, search: e.target.value || undefined })}
          placeholder="intent..."
        />
      </label>
    </div>
  );
}

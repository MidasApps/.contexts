'use client';

import { useMemo } from 'react';
import { useFetchResource } from './useFetchResource';
import type { SqlCatalogRow, SqlCatalogStatus } from '@/features/sql-catalog/repository';

export interface SqlCatalogListResponse {
  items: SqlCatalogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SqlCatalogFilters {
  clientId: string;
  status?: SqlCatalogStatus;
  personaId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const user = getFirebaseAuth().currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/** 403 não é falha de rede: vira "Acesso negado" e esvazia a tela. */
type CatalogLoad =
  | { kind: 'ok'; page: SqlCatalogListResponse }
  | { kind: 'forbidden' };

async function loadCatalogPage(
  filters: SqlCatalogFilters,
  signal: AbortSignal,
): Promise<CatalogLoad> {
  const params = new URLSearchParams();
  params.set('clientId', filters.clientId);
  if (filters.status) params.set('status', filters.status);
  if (filters.personaId) params.set('personaId', filters.personaId);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  const headers = await authHeaders();
  const res = await fetch(`/api/admin/sql-catalog?${params.toString()}`, { headers, signal });
  if (res.status === 403) return { kind: 'forbidden' };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as SqlCatalogListResponse;
  // search é client-side (busca por intent)
  if (filters.search) {
    const q = filters.search.toLowerCase();
    json.items = json.items.filter((r) => r.intent.toLowerCase().includes(q));
  }
  return { kind: 'ok', page: json };
}

/**
 * Sprint 3.C — Task 9 — hook centralizado para a UI de curadoria.
 *
 * Estado local + refetch manual após mutações. NÃO usa o cache global de
 * `useQuery` para evitar leaks entre clientes filtrados. Carrega via
 * `useFetchResource`: trocar filtro (ou digitar na busca) aborta o GET
 * anterior, e uma resposta atrasada nunca sobrescreve a do filtro atual.
 */
export function useSqlCatalog(filters: SqlCatalogFilters) {
  const { clientId, status, personaId, search, page, pageSize } = filters;
  const fetcher = useMemo(
    () =>
      clientId
        ? (signal: AbortSignal) =>
            loadCatalogPage({ clientId, status, personaId, search, page, pageSize }, signal)
        : null,
    [clientId, status, personaId, search, page, pageSize],
  );
  const { data: load, loading, error, refetch } = useFetchResource<CatalogLoad | null>(fetcher, null);
  const denied = load?.kind === 'forbidden';
  return {
    data: load?.kind === 'ok' ? load.page : null,
    loading,
    error: error ?? (denied ? 'Acesso negado' : null),
    refetch,
  };
}

export interface ApproveArgs {
  id: string;
  qualityScore: number;
  clientId?: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  const headers = await authHeaders();
  return fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const sqlCatalogApi = {
  approve(args: ApproveArgs): Promise<Response> {
    return postJson(`/api/admin/sql-catalog/${args.id}/approve`, {
      qualityScore: args.qualityScore,
      clientId: args.clientId,
    });
  },
  reject(id: string): Promise<Response> {
    return postJson(`/api/admin/sql-catalog/${id}/reject`, {});
  },
  revalidate(id: string): Promise<Response> {
    return postJson(`/api/admin/sql-catalog/${id}/revalidate`, {});
  },
  async dryRun(sql: string, clientId: string): Promise<Response> {
    const headers = await authHeaders();
    return fetch('/api/admin/sql-catalog/dry-run', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, clientId }),
    });
  },
  async update(id: string, body: Record<string, unknown>): Promise<Response> {
    const headers = await authHeaders();
    return fetch(`/api/admin/sql-catalog/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};

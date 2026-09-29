'use client';
import { useCallback, useMemo } from 'react';
import { useFetchResource } from '@/shared/hooks/useFetchResource';
import type { Entity } from '@/shared/schemas';

type EntityInput = Omit<Entity, 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

const NO_ENTITIES: Entity[] = [];

async function loadEntities(contractId: string, signal: AbortSignal): Promise<Entity[]> {
  const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities`;
  const res = await window.fetch(url, { headers: await authHeaders(), signal });
  // Detecta resposta HTML (rota não registrada — comum quando dev server
  // foi iniciado antes do arquivo de rota dinâmica existir).
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Route returned ${contentType || 'no content-type'} instead of JSON. ` +
      `If you just added/edited route files, restart the dev server.`,
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return (body.data ?? []) as Entity[];
}

export function useAdminEntities(contractId: string | null) {
  // Novo contrato = novo fetcher: o GET anterior é abortado e, se ainda
  // responder, é ignorado (useFetchResource).
  const fetcher = useMemo(
    () => (contractId ? (signal: AbortSignal) => loadEntities(contractId, signal) : null),
    [contractId],
  );
  const { data: entities, loading, error, refetch } = useFetchResource(fetcher, NO_ENTITIES);

  const save = useCallback(async (data: EntityInput) => {
    if (!contractId) throw new Error('Contract ID ausente');
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch(
      `/api/data-contracts/${encodeURIComponent(contractId)}/entities`,
      { method: 'POST', headers, body: JSON.stringify(data) },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [contractId, refetch]);

  const remove = useCallback(async (entityId: string) => {
    if (!contractId) throw new Error('Contract ID ausente');
    const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}`;
    const res = await window.fetch(url, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [contractId, refetch]);

  return { entities, loading, error, save, remove, refetch };
}

'use client';
import { useCallback, useMemo } from 'react';
import { useFetchResource } from '@/shared/hooks/useFetchResource';
import type { Attribute } from '@/shared/schemas';

type AttributeInput = Omit<Attribute, 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

const NO_ATTRIBUTES: Attribute[] = [];

async function loadAttributes(
  contractId: string,
  entityId: string,
  signal: AbortSignal,
): Promise<Attribute[]> {
  const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}/attributes`;
  const res = await window.fetch(url, { headers: await authHeaders(), signal });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Route returned ${contentType || 'no content-type'} instead of JSON. ` +
      `If you just added/edited route files, restart the dev server.`,
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return (body.data ?? []) as Attribute[];
}

export function useAdminAttributes(contractId: string | null, entityId: string | null) {
  // Novo contrato/entidade = novo fetcher: o GET anterior é abortado e, se
  // ainda responder, é ignorado (useFetchResource).
  const fetcher = useMemo(
    () =>
      contractId && entityId
        ? (signal: AbortSignal) => loadAttributes(contractId, entityId, signal)
        : null,
    [contractId, entityId],
  );
  const { data: attributes, loading, error, refetch } = useFetchResource(fetcher, NO_ATTRIBUTES);

  const save = useCallback(async (data: AttributeInput) => {
    if (!contractId || !entityId) throw new Error('Contract/Entity ausente');
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch(
      `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}/attributes`,
      { method: 'POST', headers, body: JSON.stringify(data) },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [contractId, entityId, refetch]);

  const rename = useCallback(async (oldId: string, data: AttributeInput) => {
    if (!contractId || !entityId) throw new Error('Contract/Entity ausente');
    if (oldId === data.id) {
      // No-op rename — só salva normal.
      return save(data);
    }
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const base = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}/attributes`;

    // 1. Cria doc com novo id.
    const postRes = await window.fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!postRes.ok) {
      const body = await postRes.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${postRes.status} ao criar novo id`);
    }

    // 2. Hard-delete do doc antigo.
    const delRes = await window.fetch(
      `${base}?attributeId=${encodeURIComponent(oldId)}&hard=true`,
      { method: 'DELETE', headers: await authHeaders() },
    );
    if (!delRes.ok) {
      const body = await delRes.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${delRes.status} ao remover id antigo`);
    }
    await refetch();
  }, [contractId, entityId, refetch, save]);

  const deprecate = useCallback(async (attributeId: string, reason: string) => {
    if (!contractId || !entityId) throw new Error('Contract/Entity ausente');
    const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}/attributes?attributeId=${encodeURIComponent(attributeId)}&reason=${encodeURIComponent(reason)}`;
    const res = await window.fetch(url, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [contractId, entityId, refetch]);

  const remove = useCallback(async (attributeId: string) => {
    if (!contractId || !entityId) throw new Error('Contract/Entity ausente');
    const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entityId)}/attributes?attributeId=${encodeURIComponent(attributeId)}&hard=true`;
    const res = await window.fetch(url, { method: 'DELETE', headers: await authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [contractId, entityId, refetch]);

  return { attributes, loading, error, save, rename, deprecate, remove, refetch };
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DataSource } from '@/shared/schemas';

type DataSourceInput = Omit<DataSource, 'id' | 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function useAdminDataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch('/api/data-sources', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setDataSources((body.data ?? []) as DataSource[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (id: string, data: DataSourceInput) => {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch('/api/data-sources', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  const rename = useCallback(async (oldId: string, newId: string, data: DataSourceInput) => {
    if (oldId === newId) return save(newId, data);
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };

    // 1. Cria doc com novo id.
    const postRes = await window.fetch('/api/data-sources', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: newId, ...data }),
    });
    if (!postRes.ok) {
      const body = await postRes.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${postRes.status} ao criar novo id`);
    }

    // 2. Hard-delete do doc antigo (DELETE já é hard nesta API).
    const delRes = await window.fetch(
      `/api/data-sources?id=${encodeURIComponent(oldId)}`,
      { method: 'DELETE', headers: await authHeaders() },
    );
    if (!delRes.ok) {
      const body = await delRes.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${delRes.status} ao remover id antigo`);
    }
    await refetch();
  }, [refetch, save]);

  const remove = useCallback(async (id: string) => {
    const res = await window.fetch(`/api/data-sources?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { dataSources, loading, error, save, rename, remove, refetch };
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DataContract } from '@/shared/schemas';

type ContractInput = Omit<DataContract, 'id' | 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function useAdminContracts() {
  const [contracts, setContracts] = useState<DataContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch('/api/data-contracts', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setContracts((body.data ?? []) as DataContract[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (id: string, data: ContractInput) => {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch('/api/data-contracts', {
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

  const deprecate = useCallback(async (id: string) => {
    const res = await window.fetch(`/api/data-contracts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  const remove = useCallback(async (id: string) => {
    const res = await window.fetch(
      `/api/data-contracts?id=${encodeURIComponent(id)}&hard=true`,
      { method: 'DELETE', headers: await authHeaders() },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  useEffect(() => { refetch(); }, [refetch]);

  return { contracts, loading, error, save, deprecate, remove, refetch };
}

'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Client, ClientDoc } from './types';

export function useAdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const user = getFirebaseAuth().currentUser;
    if (!user) return {};
    const token = await user.getIdToken(true);
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch('/api/clients', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Erro ${res.status}`);
      }
      const rawClients = (Array.isArray(body.data) ? body.data : []) as Array<Record<string, unknown>>;
      const result: Client[] = rawClients.map((data) => {
        return {
          id: data.id as string,
          name: data.name as string,
          dataset: (data.dataset as string | undefined) ?? undefined,
          color: data.color as string,
          initial: data.initial as string,
          schema: (data.schema as Client['schema']) ?? null,
          lastSchemaSync: (data.lastSchemaSync as Client['lastSchemaSync']) ?? undefined,
          productBindings: (data.productBindings as Client['productBindings']) ?? [],
        };
      });
      setClients(result);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const save = useCallback(
    async (id: string, data: Omit<ClientDoc, 'createdAt' | 'updatedAt'>) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await window.fetch('/api/clients', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetchClients();
    },
    [fetchClients, getAuthHeaders]
  );

  const remove = useCallback(
    async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/clients?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetchClients();
    },
    [fetchClients, getAuthHeaders]
  );

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return { clients, loading, save, remove, refetch: fetchClients };
}

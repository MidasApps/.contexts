'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Group, GroupDoc } from './types';

export function useAdminGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const user = getFirebaseAuth().currentUser;
    if (!user) return {};
    const token = await user.getIdToken(true);
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch('/api/groups', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      const rawGroups = (Array.isArray(body.data) ? body.data : []) as Array<Record<string, unknown>>;
      const result: Group[] = rawGroups.map((data) => ({
        id: data.id as string,
        name: data.name as string,
        description: data.description as string,
        routes: Array.isArray(data.routes) ? data.routes : [],
      }));
      setGroups(result);
    } catch (error) {
      console.error('[useAdminGroups] Falha ao buscar grupos:', error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const create = useCallback(
    async (data: Omit<GroupDoc, 'createdAt'>) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await window.fetch('/api/groups', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetch();
    },
    [fetch, getAuthHeaders]
  );

  const update = useCallback(
    async (id: string, data: Partial<Omit<GroupDoc, 'createdAt'>>) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await window.fetch('/api/groups', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetch();
    },
    [fetch, getAuthHeaders]
  );

  const remove = useCallback(
    async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/groups?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetch();
    },
    [fetch, getAuthHeaders]
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { groups, loading, create, update, remove, refetch: fetch };
}

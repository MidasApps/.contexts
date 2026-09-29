'use client';
import { useState, useEffect, useCallback } from 'react';
import type { AppUser, SaveUserInput, SaveUserResult } from './types';

export function useAdminUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
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
      const res = await window.fetch('/api/users', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      const rawUsers = (Array.isArray(body.data) ? body.data : []) as Array<Record<string, unknown>>;
      const result: AppUser[] = rawUsers.map((data) => ({
        id: data.id as string,
        email: data.email as string ?? '',
        displayName: data.displayName as string ?? '',
        groups: Array.isArray(data.groups) ? data.groups : [],
        clientAccess: Array.isArray(data.clientAccess) ? data.clientAccess : [],
        adminClientIds: Array.isArray(data.adminClientIds) ? (data.adminClientIds as string[]) : [],
      }));
      setUsers(result);
    } catch (error) {
      console.warn('[useAdminUsers] Falha ao buscar usuários:', error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const save = useCallback(
    async (id: string, data: SaveUserInput): Promise<SaveUserResult> => {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await window.fetch('/api/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, ...data }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetch();
      return body as SaveUserResult;
    },
    [fetch, getAuthHeaders]
  );

  const remove = useCallback(
    async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/users?id=${encodeURIComponent(id)}`, {
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

  return { users, loading, save, remove, refetch: fetch };
}

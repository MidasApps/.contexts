'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Metric } from '@/shared/schemas';

type MetricInput = Omit<Metric, 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function useAdminMetrics() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch('/api/metrics', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setMetrics((body.data ?? []) as Metric[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (data: MetricInput) => {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch('/api/metrics', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body.invalidRefs
        ? `${body.error}: ${body.invalidRefs.join(', ')}`
        : body.error || `Erro ${res.status}`;
      throw new Error(err);
    }
    // Referenciar attribute deprecated é permitido — vira aviso não-bloqueante.
    if (Array.isArray(body.warnings) && body.warnings.length > 0) {
      toast.warning('Métrica salva com avisos', { description: body.warnings.join('\n') });
    }
    await refetch();
  }, [refetch]);

  const rename = useCallback(async (oldId: string, data: MetricInput) => {
    if (oldId === data.id) return save(data);
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };

    // Rename atômico server-side: o endpoint cria o novo doc, re-aponta os
    // metricRefs de products + dashboardTemplates e remove o doc antigo numa
    // única transação Firestore (sem janela de refs órfãs, com rollback).
    const { id: newId, ...doc } = data;
    const res = await window.fetch('/api/metrics/rename', {
      method: 'POST',
      headers,
      body: JSON.stringify({ oldId, newId, doc }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = body.invalidRefs
        ? `${body.error}: ${body.invalidRefs.join(', ')}`
        : body.error || `Erro ${res.status} ao renomear`;
      throw new Error(err);
    }
    await refetch();
  }, [refetch, save]);

  const deprecate = useCallback(async (id: string) => {
    const res = await window.fetch(`/api/metrics?id=${encodeURIComponent(id)}`, {
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
      `/api/metrics?id=${encodeURIComponent(id)}&hard=true`,
      { method: 'DELETE', headers: await authHeaders() },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  useEffect(() => { refetch(); }, [refetch]);

  return { metrics, loading, error, save, rename, deprecate, remove, refetch };
}

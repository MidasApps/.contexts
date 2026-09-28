'use client';

import { useCallback } from 'react';
import { useFetchResource } from './useFetchResource';
import type { JudgeDriftResponse } from '@app/api/admin/judge-drift/route';

export interface UseJudgeDriftResult {
  data: JudgeDriftResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function loadJudgeDrift(days: number, signal: AbortSignal): Promise<JudgeDriftResponse> {
  let headers: Record<string, string> = {};
  try {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const user = getFirebaseAuth().currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers = { Authorization: `Bearer ${token}` };
    }
  } catch {
    // ignore
  }
  const res = await fetch(`/api/admin/judge-drift?days=${days}`, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as JudgeDriftResponse;
}

/**
 * Sprint 3.D Task 15 — fetches active judge-drift alerts.
 * Trocar a janela de dias aborta o GET anterior (useFetchResource).
 */
export function useJudgeDrift(days = 30): UseJudgeDriftResult {
  const fetcher = useCallback((signal: AbortSignal) => loadJudgeDrift(days, signal), [days]);
  const { data, loading, error, refetch } = useFetchResource<JudgeDriftResponse | null>(fetcher, null);
  return { data, loading, error, refetch };
}

'use client';

import { useCallback } from 'react';
import { useFetchResource } from './useFetchResource';
import type { EvalRunsResponse } from '@app/api/admin/eval-runs/route';

export interface UseEvalRunsOptions {
  suite?: 'smoke' | 'full' | 'gold';
  days?: number;
  judgeModelVersion?: string;
}

export interface UseEvalRunsResult {
  data: EvalRunsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function loadEvalRuns(
  suite: NonNullable<UseEvalRunsOptions['suite']>,
  days: number,
  judgeModelVersion: string | undefined,
  signal: AbortSignal,
): Promise<EvalRunsResponse> {
  let headers: Record<string, string> = {};
  try {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const user = getFirebaseAuth().currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers = { Authorization: `Bearer ${token}` };
    }
  } catch {
    // ignore — endpoint will reject if auth required
  }
  const params = new URLSearchParams({ suite, days: String(days) });
  if (judgeModelVersion) params.set('judgeModelVersion', judgeModelVersion);
  const res = await fetch(`/api/admin/eval-runs?${params.toString()}`, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as EvalRunsResponse;
}

/**
 * Sprint 3.D Task 15 — fetches admin eval runs aggregates.
 * Backend retorna `stub: true` quando a leitura do Firestore falha.
 * Trocar suite/dias/modelo aborta o GET anterior (useFetchResource).
 */
export function useEvalRuns(options: UseEvalRunsOptions = {}): UseEvalRunsResult {
  const { suite = 'smoke', days = 30, judgeModelVersion } = options;
  const fetcher = useCallback(
    (signal: AbortSignal) => loadEvalRuns(suite, days, judgeModelVersion, signal),
    [suite, days, judgeModelVersion],
  );
  const { data, loading, error, refetch } = useFetchResource<EvalRunsResponse | null>(fetcher, null);
  return { data, loading, error, refetch };
}

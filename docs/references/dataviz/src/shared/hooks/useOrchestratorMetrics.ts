'use client';

import { useEffect, useState, useCallback } from 'react';
import type { OrchestratorMetricsResponse } from '@app/api/admin/orchestrator-metrics/route';

interface UseOrchestratorMetricsResult {
  data: OrchestratorMetricsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Sprint 3.B Task 12 — fetches orchestrator/sub-agent metrics from
 * `/api/admin/orchestrator-metrics`. Returns mock-shaped empty data
 * while the persistence layer is not yet wired (see ADR roadmap).
 */
export function useOrchestratorMetrics(): UseOrchestratorMetricsResult {
  const [data, setData] = useState<OrchestratorMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let headers: Record<string, string> = {};
      try {
        const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
        const user = getFirebaseAuth().currentUser;
        if (user) {
          const token = await user.getIdToken();
          headers = { Authorization: `Bearer ${token}` };
        }
      } catch {
        // ignore — endpoint will reject if auth is required
      }

      const res = await fetch('/api/admin/orchestrator-metrics', { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as OrchestratorMetricsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}

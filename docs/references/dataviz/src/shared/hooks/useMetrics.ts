'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import type { Metric } from '@/shared/schemas';

/**
 * Carrega as métricas cadastradas no Firestore (ADR-0015) e alimenta o
 * `app-store`. Filtra apenas métricas com status `active` — depreciadas
 * não devem aparecer em listas de consumo runtime.
 *
 * Monta listener em `onAuthStateChanged`, mesmo padrão de `useProducts`.
 */
export function useMetrics() {
  // Recarga pedida pelo chat (métrica criada/alterada). A primeira carga é a
  // versão 0; as seguintes não passam por "carregando" nem apagam o catálogo
  // se falharem — a página segue com o que já tinha.
  const catalogVersion = useAppStore((s) => s.metricsCatalogVersion);
  useEffect(() => {
    const isReload = catalogVersion > 0;
    let cancelled = false;

    async function setup() {
      const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
      const { onAuthStateChanged } = await import('firebase/auth');
      const auth = getFirebaseAuth();

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          useAppStore.getState().setMetricsLoading();
          return;
        }

        if (!isReload) useAppStore.getState().setMetricsLoading();

        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/metrics', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;

          if (!res.ok) {
            throw new Error(body.error || `Erro ${res.status}`);
          }

          const metrics = (Array.isArray(body.data) ? body.data : []) as Metric[];
          const activeMetrics = metrics.filter((m) => m.status === 'active');
          useAppStore.getState().setMetrics(activeMetrics);
        } catch (error) {
          if (cancelled) return;
          const msg = error instanceof Error ? error.message : 'Erro ao carregar métricas';
          if (isReload) {
            console.warn('[useMetrics] recarga do catálogo falhou; mantido o anterior:', msg);
            return;
          }
          useAppStore.getState().setMetricsError(msg);
        }
      });

      return unsubscribe;
    }

    let unsubscribe: (() => void) | undefined;
    setup().then((unsub) => { unsubscribe = unsub; });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [catalogVersion]);
}

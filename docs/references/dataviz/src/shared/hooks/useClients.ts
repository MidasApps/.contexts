'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import { clearQueryCache } from '@/shared/hooks/useQuery';

export function useClients() {
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function fetchClients(user?: import('firebase/auth').User | null) {
      if (cancelled || document.hidden) return;

      try {
        const { getExternalToken } = await import('@/shared/lib/external-token');
        const externalToken = getExternalToken();
        const token = externalToken || (user ? await user.getIdToken() : null);
        console.log('[useClients] fetchClients - hasExtToken:', !!externalToken, 'hasUser:', !!user, 'hasToken:', !!token);
        if (!token) { console.log('[useClients] no token, skipping'); return; }
        const res = await fetch('/api/clients', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        console.log('[useClients] API response:', res.status, body);
        if (!res.ok) {
          throw new Error(body.error || `Erro ${res.status}`);
        }

        const clients = (Array.isArray(body.data) ? body.data : []) as Array<Record<string, unknown>>;

        if (clients.length > 0) {
          const mapped = clients.map((data) => ({
            id: data.id as string,
            name: data.name as string,
            dataset: (data.dataset as string) ?? '',
            color: data.color as string,
            initial: data.initial as string,
            schema: (data.schema as Record<string, Record<string, string | null>> | undefined) ?? null,
            productBindings: (data.productBindings as Array<unknown> | undefined) as
              | import('@/shared/schemas').ClientProductBinding[]
              | undefined,
          }));
          // Só re-seta (e limpa o cache de queries) quando os dados de fato mudaram.
          // setClients() chama clearQueryCache() incondicionalmente; sem este guard,
          // cada poll de 30s esvaziava todo o cache e forçava refetch global mesmo
          // sem nenhuma alteração nos clientes.
          const current = useAppStore.getState().clients;
          const unchanged =
            current.length === mapped.length &&
            JSON.stringify(current) === JSON.stringify(mapped);
          if (unchanged) {
            useAppStore.setState({ clientsStatus: 'ready', clientsError: null });
          } else {
            useAppStore.getState().setClients(mapped);
            clearQueryCache();
          }
        } else {
          useAppStore.getState().setClientsError('Nenhum cliente configurado no Firestore.');
        }
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : 'Erro ao carregar clientes';
        useAppStore.getState().setClientsError(msg);
      }
    }

    async function setup() {
      const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
      const { onAuthStateChanged } = await import('firebase/auth');
      const { hasExternalToken } = await import('@/shared/lib/external-token');
      const auth = getFirebaseAuth();

      // Embedded mode: fetch with external token
      async function startEmbeddedPolling() {
        if (cancelled) return;
        console.log('[useClients] startEmbeddedPolling called');
        useAppStore.getState().setClientsLoading();
        await fetchClients();
        if (intervalId !== undefined) clearInterval(intervalId);
        intervalId = setInterval(() => fetchClients(), 30_000);
      }

      // Listen for external token from parent shell (embedded mode)
      const messageHandler = async (event: MessageEvent) => {
        console.log('[useClients] message received:', event.data?.type, 'hasToken:', hasExternalToken());
        if (event.data?.type === 'AUTH_TOKEN' && hasExternalToken()) {
          await startEmbeddedPolling();
        }
      };
      window.addEventListener('message', messageHandler);

      // If external token was already received before setup() completed, fetch now
      console.log('[useClients] setup complete, hasExternalToken:', hasExternalToken());
      if (hasExternalToken()) {
        await startEmbeddedPolling();
      }

      // Listen continuously — re-fetches clients every time auth state changes
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;
        if (hasExternalToken()) return; // Skip Firebase auth flow in embedded mode

        // Clear any existing polling interval when auth state changes
        if (intervalId !== undefined) {
          clearInterval(intervalId);
          intervalId = undefined;
        }

        if (!user) {
          useAppStore.getState().setClientsLoading();
          return;
        }

        // User is authenticated — fetch clients immediately
        useAppStore.getState().setClientsLoading();
        await fetchClients(user);

        // Start polling every 30 seconds while user is authenticated
        intervalId = setInterval(() => {
          fetchClients(user);
        }, 30_000);
      });

      return () => {
        unsubscribe();
        window.removeEventListener('message', messageHandler);
      };
    }

    let cleanup: (() => void) | undefined;
    setup().then((fn) => { cleanup = fn; });

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
      cleanup?.();
    };
  }, []);
}

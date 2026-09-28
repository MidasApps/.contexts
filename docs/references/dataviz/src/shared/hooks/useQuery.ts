'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface UseQueryOptions<T> {
  /** Function that performs the fetch */
  queryFn: () => Promise<T>;
  /** Unique key for SWR-style caching */
  queryKey: string;
  /** Fallback data if fetch fails or env not configured */
  fallbackData?: T;
  /** Whether to auto-fetch on mount */
  enabled?: boolean;
}

interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Clears all entries from the query cache. Call when client config changes. */
export function clearQueryCache(): void {
  cache.clear();
}
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // ms — exponential backoff

// Debounce error toasts — show max 1 every 5 seconds
let lastToastTime = 0;
function showErrorToast() {
  const now = Date.now();
  if (now - lastToastTime > 5000) {
    lastToastTime = now;
    toast.error('Não foi possível conectar à base de dados.', {
      description: 'Exibindo dados locais.',
      id: 'bigquery-error', // dedup by id
    });
  }
}

export function useQuery<T>({
  queryFn,
  queryKey,
  fallbackData,
  enabled = true,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const [data, setData] = useState<T | undefined>(() => {
    const cached = cache.get(queryKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T;
    }
    return fallbackData;
  });
  const [loading, setLoading] = useState(enabled && !cache.has(queryKey));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // Rastreia a queryKey atual para descartar respostas de fetches obsoletos
  // (ex.: filtros mudam e uma resposta antiga, mais lenta, chega depois da nova).
  const latestKeyRef = useRef(queryKey);

  // Use a ref for fallbackData so it never triggers re-fetches
  // (callers often pass inline literals like [] which change identity each render).
  // "Latest value" ref: lido só dentro de fetchData (após await), nunca na render.
  const fallbackRef = useRef(fallbackData);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref lido apenas async (dentro de fetchData, após await)
  fallbackRef.current = fallbackData;

  const fetchData = useCallback(async () => {
    const myKey = queryKey;
    // Verdadeiro quando esta execução ainda corresponde à queryKey vigente.
    const isCurrent = () => mountedRef.current && latestKeyRef.current === myKey;

    setLoading(true);
    setError(null);

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await queryFn();
        // Cacheia mesmo se obsoleto (o dado é válido para myKey), mas só
        // atualiza o estado se este fetch ainda for o mais recente.
        cache.set(myKey, { data: result, timestamp: Date.now() });
        if (isCurrent()) {
          setData(result);
          setLoading(false);
        }
        return;
      } catch (err) {
        lastError = err;
        // Don't retry 4xx errors (auth, validation)
        if (err instanceof Error && /4\d{2}/.test(err.message)) break;
        // Wait before retrying (skip wait on last attempt)
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        }
        if (!isCurrent()) return;
      }
    }

    // All retries exhausted
    if (isCurrent()) {
      console.warn('[useQuery] Error after retries:', lastError instanceof Error ? lastError.message : lastError);
      setError('Erro ao carregar dados');
      showErrorToast();
      if (fallbackRef.current !== undefined) {
        setData(fallbackRef.current);
      }
      setLoading(false);
    }
  }, [queryFn, queryKey]);

  useEffect(() => {
    mountedRef.current = true;
    latestKeyRef.current = queryKey;
    if (enabled) {
      // fetch-on-mount/refetch: fetchData seta loading de forma síncrona — padrão
      // esperado deste hook SWR-like (loading já é inicializado de forma coerente).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- disparo de fetch on mount/key-change é intencional
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData, queryKey]);

  return { data, loading, error, refetch: fetchData };
}

async function getAuthToken(): Promise<string | null> {
  try {
    // If running embedded with external token from parent shell, use it
    const { getExternalToken } = await import('@/shared/lib/external-token');
    const externalToken = getExternalToken();
    if (externalToken) return externalToken;

    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const { onAuthStateChanged } = await import('firebase/auth');
    const auth = getFirebaseAuth();
    let user = auth.currentUser;
    if (!user) {
      user = await new Promise<typeof auth.currentUser>((resolve) => {
        const timeout = window.setTimeout(() => {
          unsubscribe();
          resolve(auth.currentUser);
        }, 3000);
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          window.clearTimeout(timeout);
          unsubscribe();
          resolve(nextUser);
        });
      });
    }
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function fetchFilterOptions<T = unknown>(dataset: string): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/filter-options', {
    method: 'POST',
    headers,
    body: JSON.stringify({ dataset }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }

  const json = await res.json();

  // Store unavailable fields globally
  if (json.unavailableFields && json.unavailableFields.length > 0) {
    (globalThis as Record<string, unknown>).__unavailableFields = new Set(json.unavailableFields);
  }

  return json.data as T;
}

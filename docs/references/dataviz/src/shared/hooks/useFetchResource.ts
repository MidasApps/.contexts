'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** Loads the resource. Pass `signal` to `fetch` so a superseded request is cancelled. */
export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

export interface FetchResource<T> {
  data: T;
  /** Replaces the data locally (optimistic edit, save echo). Does not fetch. */
  setData: Dispatch<SetStateAction<T>>;
  loading: boolean;
  error: string | null;
  /** Reloads with the current fetcher. Never rejects: failures land in `error`. */
  refetch: () => Promise<void>;
}

export interface FetchResourceOptions {
  /**
   * On a params change (new fetcher), drop the previous data and show
   * `initialData` while the next load runs. Default `false`: admin lists keep
   * the old rows on screen while the next ones load. Use it when effects keyed
   * on `data` must never see the previous params' data under the new params.
   * `refetch` of the same params keeps the data either way.
   */
  resetOnChange?: boolean;
}

interface State<T> {
  data: T;
  error: string | null;
  loading: boolean;
}

/**
 * Dev-only guard. A fetcher recreated on every render (inline arrow, no
 * `useCallback`/`useMemo`) makes the render-phase adjustment below loop until
 * React gives up with a generic "Too many re-renders". Legitimate param changes
 * happen at most once per commit (twice under StrictMode's double render), so
 * a long run of changes with no commit in between can only be that mistake.
 * React's own limit is 25; this fires well before it, with a message that
 * names the fix.
 */
const MAX_SWAPS_WITHOUT_COMMIT = 10;

function watchUnstableFetcher(swapsWithoutCommit: { current: number }): void {
  if (process.env.NODE_ENV === 'production') return;
  swapsWithoutCommit.current += 1;
  if (swapsWithoutCommit.current > MAX_SWAPS_WITHOUT_COMMIT) {
    throw new Error(
      'useFetchResource: the fetcher changed identity on ' +
        `${swapsWithoutCommit.current} renders in a row without a commit. ` +
        'Wrap it in useCallback (or useMemo) keyed on its params, and pass ' +
        'null instead of a new function when a param is missing.',
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fetch-in-effect for data that depends on params (contract, filters, id).
 *
 * The caller memoises `fetcher` on its params (`useCallback`) and passes `null`
 * when a required param is missing. A new fetcher identity means new params:
 * the in-flight request is aborted and its response, if it still arrives, is
 * ignored — so a slow old response can never overwrite a newer one. The same
 * happens on unmount.
 *
 * Why not `useQuery`: that hook is SWR-like for BigQuery data (global cache,
 * retries, a "base de dados" toast, fallback data). Admin and observability
 * screens want none of that — `useSqlCatalog` already avoided its cache so
 * one client's rows never leak into another's.
 *
 * `loading` flips during render when the fetcher changes (React's "adjust
 * state on prop change" pattern), and the effect only starts the request.
 * Nothing sets state synchronously inside the effect.
 *
 * **The fetcher MUST be memoised** (`useCallback`/`useMemo` on its params). An
 * inline arrow changes identity every render and loops; in development this
 * throws a message saying so, in production React stops with "Too many
 * re-renders".
 *
 * Without a fetcher, `data` goes back to `initialData` and `loading` is false.
 * On error, the previous `data` is kept and `error` is set.
 */
export function useFetchResource<T>(
  fetcher: Fetcher<T> | null,
  initialData: T,
  { resetOnChange = false }: FetchResourceOptions = {},
): FetchResource<T> {
  const [state, setState] = useState<State<T>>(() => ({
    data: initialData,
    error: null,
    loading: fetcher !== null,
  }));

  // Wrapped in a thunk: useState would call a bare function as an initializer.
  const [seenFetcher, setSeenFetcher] = useState(() => fetcher);
  // Diagnostic counter only (see watchUnstableFetcher); never drives output.
  const swapsWithoutCommitRef = useRef(0);
  if (fetcher !== seenFetcher) {
    // Dev-only loop detector: counts render-phase changes between commits.
    watchUnstableFetcher(swapsWithoutCommitRef);
    setSeenFetcher(() => fetcher);
    setState((s) => {
      if (!fetcher) return { data: initialData, error: null, loading: false };
      return { data: resetOnChange ? initialData : s.data, error: null, loading: true };
    });
  }

  // The request whose answer still counts. Anything else is stale.
  const inFlightRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  const initialRef = useRef(initialData);

  const run = useCallback(async (f: Fetcher<T>) => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const data = await f(controller.signal);
      if (inFlightRef.current !== controller) return;
      setState({ data, error: null, loading: false });
    } catch (err) {
      if (inFlightRef.current !== controller) return;
      setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetcherRef.current = fetcher;
    initialRef.current = initialData;
    swapsWithoutCommitRef.current = 0;
  });

  useEffect(() => {
    if (fetcher) void run(fetcher);
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [fetcher, run]);

  const refetch = useCallback(async () => {
    const f = fetcherRef.current;
    if (!f) {
      setState({ data: initialRef.current, error: null, loading: false });
      return;
    }
    setState((s) => ({ ...s, error: null, loading: true }));
    await run(f);
  }, [run]);

  const setData = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setState((s) => ({
      ...s,
      data: typeof next === 'function' ? (next as (prev: T) => T)(s.data) : next,
    }));
  }, []);

  return { data: state.data, setData, loading: state.loading, error: state.error, refetch };
}

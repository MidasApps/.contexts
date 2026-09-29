/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fetchTripwire, stubControlledFetch } from '@/test-stubs/controlled-fetch';

/**
 * Filtro trocado rápido (digitar na busca do catálogo, mudar suite/dias do
 * painel de qualidade) dispara GETs em sequência. A resposta de um filtro
 * antigo que chegasse por último sobrescrevia a do filtro atual.
 */

vi.mock('@/shared/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
}));

import { useSqlCatalog, type SqlCatalogFilters } from '../useSqlCatalog';
import { useEvalRuns } from '../useEvalRuns';
import { useJudgeDrift } from '../useJudgeDrift';

let net: ReturnType<typeof stubControlledFetch>;
// Nenhum pedido pode sair da suíte: o que chegar ao `fetch` depois do fim de um
// teste cai na armadilha em vez de ir para a rede de verdade.
const trap = fetchTripwire();
beforeEach(() => { net = stubControlledFetch(); });
afterEach(() => { trap.arm(); });
afterAll(async () => {
  // Dá tempo ao import dinâmico do token de resolver e ao hook de chamar fetch.
  await new Promise((r) => setTimeout(r, 50));
  vi.unstubAllGlobals();
  expect(trap.leaks).toEqual([]);
});

const FILTERS: SqlCatalogFilters = { clientId: 'vila-rosa', page: 1, pageSize: 20 };
const page = (intents: string[]) => ({
  items: intents.map((intent, i) => ({ id: `r${i}`, intent })),
  total: intents.length,
  page: 1,
  pageSize: 20,
});

describe('useSqlCatalog', () => {
  it('keeps the page of the current filters when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ f }) => useSqlCatalog(f), {
      initialProps: { f: { ...FILTERS, status: 'draft' } as SqlCatalogFilters },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ f: { ...FILTERS, status: 'approved' } });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);
    expect(net.calls[1].url).toContain('status=approved');

    await act(async () => net.calls[1].respond(page(['aprovada'])));
    await act(async () => net.calls[0].respond(page(['rascunho'])));

    expect(result.current.data?.items.map((r) => r.intent)).toEqual(['aprovada']);
    expect(result.current.loading).toBe(false);
  });

  it('filters by search client-side, as before', async () => {
    const { result } = renderHook(() => useSqlCatalog({ ...FILTERS, search: 'SALDO' }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    await act(async () => net.calls[0].respond(page(['saldo devedor', 'inadimplência'])));
    expect(result.current.data?.items.map((r) => r.intent)).toEqual(['saldo devedor']);
  });

  it('on 403 reports "Acesso negado" and clears the data', async () => {
    const { result } = renderHook(() => useSqlCatalog(FILTERS));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    await act(async () => net.calls[0].respond({}, 403));
    expect(result.current.error).toBe('Acesso negado');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('keeps its public shape; no client means no data and no fetch', () => {
    const { result } = renderHook(() => useSqlCatalog({ ...FILTERS, clientId: '' }));
    expect(Object.keys(result.current).sort()).toEqual(['data', 'error', 'loading', 'refetch']);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(net.calls).toHaveLength(0);
  });
});

describe('useEvalRuns', () => {
  it('keeps the runs of the current suite when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ suite }) => useEvalRuns({ suite }), {
      initialProps: { suite: 'smoke' as 'smoke' | 'full' },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ suite: 'full' });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);

    await act(async () => net.calls[1].respond({ marker: 'full' }));
    await act(async () => net.calls[0].respond({ marker: 'smoke' }));

    expect(result.current.data).toEqual({ marker: 'full' });
  });

  it('keeps its public shape and starts loading', async () => {
    const { result, unmount } = renderHook(() => useEvalRuns());
    expect(Object.keys(result.current).sort()).toEqual(['data', 'error', 'loading', 'refetch']);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    // Espera o pedido sair para o fetch controlado antes de encerrar: terminar
    // antes deixava o GET escapar para a rede depois do teardown.
    await waitFor(() => expect(net.calls).toHaveLength(1));
    unmount();
  });

  it('surfaces an HTTP error', async () => {
    const { result } = renderHook(() => useEvalRuns());
    await waitFor(() => expect(net.calls).toHaveLength(1));
    await act(async () => net.calls[0].respond({}, 500));
    expect(result.current.error).toBe('HTTP 500');
  });
});

describe('useJudgeDrift', () => {
  it('keeps the drift of the current window when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ days }) => useJudgeDrift(days), {
      initialProps: { days: 30 },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ days: 7 });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);
    expect(net.calls[1].url).toContain('days=7');

    await act(async () => net.calls[1].respond({ marker: 7 }));
    await act(async () => net.calls[0].respond({ marker: 30 }));

    expect(result.current.data).toEqual({ marker: 7 });
  });

  it('keeps its public shape and starts loading', async () => {
    const { result, unmount } = renderHook(() => useJudgeDrift());
    expect(Object.keys(result.current).sort()).toEqual(['data', 'error', 'loading', 'refetch']);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(net.calls).toHaveLength(1));
    unmount();
  });
});

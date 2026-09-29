/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * Foco do teste: `useReportData` escopa o fetch pelo produto EFETIVO —
 * `reportProductId` (produto do report) quando presente, com fallback ao
 * produto globalmente ativo. Mockamos os hooks de contexto (store/filtros/
 * cliente/produto) e os módulos de token (importados dinamicamente), e
 * espionamos o `fetch` global para inspecionar o `productId` enviado.
 */

// --- Mocks dos hooks de contexto ---
vi.mock('@/shared/hooks/useActiveClient', () => ({
  useActiveDataset: () => 'proj.dataset',
}));

const ACTIVE_PRODUCT = { id: 'credit' };
vi.mock('@/shared/hooks/useActiveProduct', () => ({
  useActiveProduct: () => ACTIVE_PRODUCT,
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: { activeClientId: string }) => unknown) =>
    selector({ activeClientId: 'om' }),
}));

const h = vi.hoisted(() => ({
  filters: {
    dataBase: '2026-01-01',
    dateRange: { start: '2025-01-01', end: '2026-01-01' },
  },
}));
vi.mock('@/shared/providers/DataProvider', () => ({
  useDataFilters: () => h.filters,
}));

// --- Mocks dos módulos de token (importados dinamicamente no hook) ---
vi.mock('@/shared/lib/external-token', () => ({
  getExternalToken: () => 'tok-test',
}));
vi.mock('@/shared/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
}));

import { useReportData } from '../useReportData';

function kpiBlock(): Record<string, CanvasBlock> {
  return {
    b1: {
      id: 'b1',
      type: 'kpi',
      metricId: 'pdd.total',
      label: 'PDD',
      value: '—',
    } as unknown as CanvasBlock,
  };
}

/** Lê o `productId` do body da última chamada ao fetch espionado. */
function lastProductId(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const calls = fetchMock.mock.calls;
  const last = calls[calls.length - 1];
  const body = JSON.parse((last[1] as { body: string }).body);
  return body.productId;
}

describe('useReportData — escopo por produto efetivo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) {
        results[id] = { ok: true, metricId: id, data: [{ value: 42 }], sql: '', outputColumns: ['value'] };
      }
      return { ok: true, json: async () => ({ results }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa reportProductId quando presente (escopa pelo produto do report)', async () => {
    renderHook(() => useReportData(kpiBlock(), undefined, undefined, 'covenants'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastProductId(fetchMock)).toBe('covenants');
  });

  it('cai no produto ativo quando reportProductId é ausente (retrocompat)', async () => {
    renderHook(() => useReportData(kpiBlock(), undefined, undefined));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastProductId(fetchMock)).toBe('credit');
  });

  it('cacheKeys distintos não colidem entre produtos diferentes', async () => {
    // Mesmo blockMap/cliente/filtros, produtos diferentes → fetch refeito
    // (cacheKey inclui o produto efetivo). Verifica que ambos os produtos
    // chegaram ao fetch, provando que o cache não colidiu.
    const withReportProduct = renderHook(() =>
      useReportData(kpiBlock(), undefined, undefined, 'covenants'),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastProductId(fetchMock)).toBe('covenants');
    withReportProduct.unmount();

    fetchMock.mockClear();

    renderHook(() => useReportData(kpiBlock(), undefined, undefined));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastProductId(fetchMock)).toBe('credit');
  });

  it('faz 1 chamada bulk para N métricas (N→1) em /api/metrics/batch', async () => {
    const twoBlocks = {
      b1: { id: 'b1', type: 'kpi', metricId: 'pdd.total', label: 'PDD', value: '—' },
      b2: { id: 'b2', type: 'kpi', metricId: 'carteira.saldo', label: 'Saldo', value: '—' },
    } as unknown as Record<string, CanvasBlock>;

    renderHook(() => useReportData(twoBlocks, undefined, undefined, 'covenants'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/metrics/batch');
    const sent = JSON.parse((init as { body: string }).body).metricIds as string[];
    expect(new Set(sent)).toEqual(new Set(['pdd.total', 'carteira.saldo']));
  });

  it('falha por-métrica vira rows vazias, sem erro de página', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: { 'pdd.total': { ok: false, metricId: 'pdd.total', status: 422, error: 'lacuna' } } }),
    });

    const { result } = renderHook(() => useReportData(kpiBlock(), undefined, undefined));

    await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect((result.current.populatedBlockMap!.b1 as { value: string }).value).toBe('—');
  });

  /**
   * O canal *ambient* segue existindo no resolver, mas ninguém o alimenta: os
   * controles que o faziam (empreendimentos e as seis faixas de carteira)
   * saíram, porque nenhuma métrica do catálogo os aplicava.
   */
  it('não manda ambientFilters — nada mais os alimenta', async () => {
    renderHook(() => useReportData(kpiBlock(), undefined, undefined, 'play'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
    expect(body.ambientFilters).toEqual([]);
  });

  it('KPI format percent: razão 0–1 do catálogo → ×100 na apresentação (B2)', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) {
        results[id] = { ok: true, metricId: id, data: [{ value: 0.0049 }], sql: '', outputColumns: ['value'] };
      }
      return { ok: true, json: async () => ({ results }) };
    });
    const block = {
      p: { id: 'p', type: 'kpi', metricId: 'play.inadimplencia', label: 'Inad', value: '—', format: 'percent' },
    } as unknown as Record<string, CanvasBlock>;
    const { result } = renderHook(() => useReportData(block, undefined, undefined, 'play'));
    await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());
    expect((result.current.populatedBlockMap!.p as { value: string }).value).toContain('0,49');
  });

  describe('awaitingFirstData — nada de valor de template na tela', () => {
    /**
     * O defeito: `loading` é estado e só virava `true` DENTRO do efeito, um
     * render depois de o blockMap existir. Nesse intervalo a página pintava o
     * template cru — gauge de covenant nasce `value: 0`, e zero num mínimo de
     * 1,20x aparece em vermelho como se o covenant estivesse rompido. Por isso
     * o flag tem de valer já no PRIMEIRO render, antes de qualquer efeito.
     */
    it('já é true no primeiro render, antes de qualquer efeito', () => {
      const perRender: boolean[] = [];
      renderHook(() => {
        const r = useReportData(kpiBlock(), undefined, undefined, 'covenants');
        perRender.push(r.awaitingFirstData);
        return r;
      });
      expect(perRender[0]).toBe(true);
    });

    it('vira false quando o dado destes blocos chega', async () => {
      const { result } = renderHook(() =>
        useReportData(kpiBlock(), undefined, undefined, 'covenants'),
      );
      await waitFor(() => expect(result.current.awaitingFirstData).toBe(false));
      expect(result.current.populatedBlockMap).not.toBeNull();
    });

    it('report sem métrica nenhuma não fica esperando dado', () => {
      const withoutMetric = {
        t1: { id: 't1', type: 'text', content: 'Nota' },
      } as unknown as Record<string, CanvasBlock>;
      const { result } = renderHook(() => useReportData(withoutMetric, undefined, undefined, 'covenants'));
      expect(result.current.awaitingFirstData).toBe(false);
    });

    /**
     * App Router não remonta a página na troca de params, então o mapa
     * populado da página anterior continua no estado. Ids colidem entre
     * templates (`donut-recebiveis` existe na Visão Executiva E em
     * Recebíveis): sem guarda, o bloco homônimo da página nova aparecia com o
     * número da página velha.
     */
    it('mapa populado de outro report não vaza para o report seguinte', async () => {
      const otherReport = {
        b9: { id: 'b9', type: 'kpi', metricId: 'carteira.saldo', label: 'Saldo', value: '—' },
      } as unknown as Record<string, CanvasBlock>;

      const { result, rerender } = renderHook(
        ({ bm }: { bm: Record<string, CanvasBlock> }) =>
          useReportData(bm, undefined, undefined, 'covenants'),
        { initialProps: { bm: kpiBlock() } },
      );
      await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());

      rerender({ bm: otherReport });
      expect(result.current.populatedBlockMap).toBeNull();
      expect(result.current.awaitingFirstData).toBe(true);

      await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());
      expect(Object.keys(result.current.populatedBlockMap!)).toEqual(['b9']);
    });
  });

  describe('pageFilterValues — dropdown de página (G3)', () => {
    const filtersWithDropdown = {
      metricPageFilters: {
        banco: { kind: 'in' as const, attribute: 'transacoes.banco_codigo', control: 'dropdown' as const },
      },
    };

    it('injeta os valores selecionados no pageFilters da key dropdown', async () => {
      renderHook(() =>
        useReportData(kpiBlock(), undefined, filtersWithDropdown, 'play', { banco: ['001', '341'] }),
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
      expect(body.pageFilters.banco).toEqual({
        kind: 'in',
        values: ['001', '341'],
        attribute: 'transacoes.banco_codigo',
      });
    });

    it('sem seleção do usuário → values vazio (no-op no resolver)', async () => {
      renderHook(() => useReportData(kpiBlock(), undefined, filtersWithDropdown, 'play'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
      expect(body.pageFilters.banco).toEqual({
        kind: 'in',
        values: [],
        attribute: 'transacoes.banco_codigo',
      });
    });

    /**
     * Antes, filtro `in` sem `control` era alimentado pelo seletor global de
     * empreendimentos. Esse seletor não existe mais — e nenhum template
     * declarava um filtro assim. Sem seleção, vira no-op (`1=1`) no resolver.
     */
    it('kind "in" sem seleção vai vazio — filtro que ninguém preencheu não recorta', async () => {
      const filtersWithProjects = {
        metricPageFilters: {
          projetos: { kind: 'in' as const, attribute: 'contratos.projeto' },
        },
      };
      renderHook(() => useReportData(kpiBlock(), undefined, filtersWithProjects, 'play'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
      expect(body.pageFilters.projetos).toEqual({
        kind: 'in',
        values: [],
        attribute: 'contratos.projeto',
      });
    });
  });
});

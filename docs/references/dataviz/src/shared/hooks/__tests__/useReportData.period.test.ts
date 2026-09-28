/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * O período, o modo e o comparativo chegando à CONSULTA.
 *
 * Os três controles existiam na tela e não chegavam ao dado: o seletor de
 * período tinha sumido das páginas de relatório, e o modo "Último mês" e o
 * comparativo eram lidos apenas pelo assistente e pelo badge de filtros
 * ativos — nenhum bloco mudava. Este arquivo tranca o caminho inteiro, que é
 * onde o defeito morava: não adianta o controle existir se o `pageFilters`
 * sai igual.
 */

vi.mock('@/shared/hooks/useActiveClient', () => ({ useActiveDataset: () => 'proj.dataset' }));
vi.mock('@/shared/hooks/useActiveProduct', () => ({ useActiveProduct: () => ({ id: 'covenants' }) }));

const h = vi.hoisted(() => ({
  filters: {
    dataBase: '2026-07-01',
    dateRange: { start: '2026-05-01', end: '2026-07-01' },
    projetos: [] as string[],
    projeto: '' as string | string[],
    advancedFilters: {
      ratings: [] as string[], elegibilidade: [] as string[], faixaLtv: [] as string[],
      faixaAtraso: [] as string[], tipoProponente: [] as string[], gruposRepasse: [] as string[],
    },
    viewMode: 'accumulated' as 'snapshot' | 'accumulated',
    compareEnabled: false,
    comparePeriod: null as { start: string; end: string } | null,
  },
  // O catálogo é quem diz se a métrica reage ao período e se é série.
  metrics: [
    {
      id: 'm.escalar', shape: 'scalar',
      recipe: { kind: 'sql', template: 'SELECT 1 AS value FROM {t} WHERE {filter.date_range:t.d}' },
    },
    {
      id: 'm.serie', shape: 'timeseries',
      recipe: { kind: 'sql', template: 'SELECT d, v FROM {t} WHERE {filter.date_range:t.d}' },
    },
    /*
     * Posição: o pin calcula o `MAX` DENTRO da faixa (`{filter.ate}`), então
     * trocar o fim do período troca o mês — e o comparativo tem o que comparar.
     * É a forma de 45 das 66 métricas do catálogo real.
     */
    {
      id: 'm.pin', shape: 'scalar',
      recipe: {
        kind: 'sql',
        template: 'SELECT AVG(v) AS value FROM {t} WHERE {t.d} = '
          + '(SELECT MAX({t.d}) FROM {t} WHERE {filter.ate:t.d})',
      },
    },
  ],
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeClientId: 'vila-rosa', metrics: h.metrics }),
}));
vi.mock('@/shared/providers/DataProvider', () => ({ useDataFilters: () => h.filters }));
vi.mock('@/shared/lib/external-token', () => ({ getExternalToken: () => 'tok-test' }));
vi.mock('@/shared/lib/firebase/config', () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));

import { useReportData } from '../useReportData';

function blocks(): Record<string, CanvasBlock> {
  return {
    kpi: { id: 'kpi', type: 'kpi', metricId: 'm.escalar', label: 'KPI', value: '—' } as unknown as CanvasBlock,
    serie: {
      id: 'serie', type: 'chart', metricId: 'm.serie', chartType: 'line',
      xAxisKey: 'mes', dataKeys: ['v'],
    } as unknown as CanvasBlock,
  };
}

/** Todos os corpos enviados ao batch, já desserializados. */
function bodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
}

/** O filtro de data de um corpo — o que de fato vira `WHERE` no resolver. */
function dateFilterOf(body: { pageFilters: Record<string, { kind: string; start?: string; end?: string; value?: string }> }) {
  return Object.values(body.pageFilters).find((f) => f.kind === 'date_range' || f.kind === 'snapshot');
}

describe('useReportData — período, modo e comparativo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    h.filters.dateRange = { start: '2026-05-01', end: '2026-07-01' };
    h.filters.viewMode = 'accumulated';
    h.filters.compareEnabled = false;
    h.filters.comparePeriod = null;
    fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) {
        results[id] = { ok: true, data: [{ value: 100 }] };
      }
      return { ok: true, json: async () => ({ results }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  /**
   * Projeção não é dado histórico recortado — é o oposto: a linha do futuro é
   * exatamente o que cai fora do filtro. Um gráfico que vai até 2027 chegava
   * truncado em jul/26 sem nada na tela dizendo por quê, e a leitura natural
   * era "faltou dado".
   */
  it('bloco de projeção consulta com o período escancarado', async () => {
    const withProjection = {
      ...blocks(),
      projecao: {
        id: 'projecao', type: 'chart', metricId: 'm.projetada', chartType: 'line',
        xAxisKey: 'mes', dataKeys: ['v'], ignorePeriodFilter: true,
      } as unknown as CanvasBlock,
    };
    renderHook(() => useReportData(withProjection, undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const projectionBody = bodies(fetchMock).find((c) => c.metricIds.includes('m.projetada'));
    expect(projectionBody.metricIds).toEqual(['m.projetada']);
    expect(dateFilterOf(projectionBody)).toMatchObject({ kind: 'date_range', start: '1900-01-01', end: '2999-12-31' });

    // E as demais seguem recortadas pelo filtro — a isenção é do bloco, não da página.
    const otherBodies = bodies(fetchMock).find((c) => !c.metricIds.includes('m.projetada'));
    expect(dateFilterOf(otherBodies)).toMatchObject({ start: '2026-05-01', end: '2026-07-01' });
  });

  // Comparar uma curva de futuro com "o mesmo período do ano passado" não
  // significa nada — e pagaria uma segunda consulta para o mesmo resultado.
  it('projeção fica fora da consulta comparativa', async () => {
    h.filters.compareEnabled = true;
    h.filters.comparePeriod = { start: '2025-05-01', end: '2025-07-01' };
    const withProjection = {
      ...blocks(),
      projecao: {
        id: 'projecao', type: 'chart', metricId: 'm.projetada', chartType: 'line',
        xAxisKey: 'mes', dataKeys: ['v'], ignorePeriodFilter: true,
      } as unknown as CanvasBlock,
    };
    renderHook(() => useReportData(withProjection, undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const comparisonBlocks = bodies(fetchMock).filter(
      (c) => dateFilterOf(c)?.start === '2025-05-01',
    );
    expect(comparisonBlocks.length).toBeGreaterThan(0);
    for (const c of comparisonBlocks) expect(c.metricIds).not.toContain('m.projetada');
  });

  it('acumulado manda a FAIXA do período, para todas as métricas', async () => {
    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(bodies(fetchMock)).toHaveLength(1);
    expect(dateFilterOf(bodies(fetchMock)[0])).toMatchObject({
      kind: 'date_range', start: '2026-05-01', end: '2026-07-01',
    });
  });

  /**
   * "Último mês" é o mês calendário do fim do período — a faixa, não o dia.
   * Era `coluna = @fim`: numa tabela de eventos, "leads do mês" virava "leads
   * do último dia". Numa foto mensal a faixa devolve o mesmo que o `=`.
   */
  it('último mês manda o mês calendário do fim do período para o escalar', async () => {
    h.filters.viewMode = 'snapshot';
    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const scalarBody = bodies(fetchMock).find((c) => c.metricIds.includes('m.escalar'));
    expect(dateFilterOf(scalarBody)).toMatchObject({ kind: 'date_range', start: '2026-07-01', end: '2026-07-01' });
  });

  it('com o período fechando em 31/08, o escalar recebe agosto inteiro', async () => {
    h.filters.viewMode = 'snapshot';
    h.filters.dateRange = { start: '2025-09-30', end: '2026-08-31' };
    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const scalarBody = bodies(fetchMock).find((c) => c.metricIds.includes('m.escalar'));
    expect(dateFilterOf(scalarBody)).toMatchObject({ kind: 'date_range', start: '2026-08-01', end: '2026-08-31' });
  });

  /**
   * O ponto do desenho: uma série recortada a um mês vira um ponto solto. O
   * modo fala do número, não do eixo do tempo — por isso a partição.
   */
  it('último mês NÃO recorta a série: ela segue com a faixa', async () => {
    h.filters.viewMode = 'snapshot';
    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const seriesBody = bodies(fetchMock).find((c) => c.metricIds.includes('m.serie'));
    expect(dateFilterOf(seriesBody)).toMatchObject({ kind: 'date_range', start: '2026-05-01' });
  });

  it('sem comparação, uma consulta só', async () => {
    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * O switch não disparava consulta nenhuma: o "vs anterior" vinha do
   * penúltimo ponto da própria série, então escolher jan–mar não mexia em
   * número algum.
   */
  it('comparação busca o período ESCOLHIDO, numa segunda consulta', async () => {
    h.filters.compareEnabled = true;
    h.filters.comparePeriod = { start: '2026-01-01', end: '2026-03-01' };

    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const ranges = bodies(fetchMock).map((c) => dateFilterOf(c));
    expect(ranges).toContainEqual(expect.objectContaining({ start: '2026-05-01', end: '2026-07-01' }));
    expect(ranges).toContainEqual(expect.objectContaining({ start: '2026-01-01', end: '2026-03-01' }));
  });

  it('comparação ligada sem período escolhido não busca duas vezes', async () => {
    h.filters.compareEnabled = true;
    h.filters.comparePeriod = null;

    renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A comparação é secundária: falhar nela é ficar sem a sobreposição, não sem
   * o relatório. Dentro de um `Promise.all` sem `catch` próprio, a rejeição da
   * segunda consulta derrubava a primeira — o usuário perdia os números do
   * período que estava olhando por causa de um extra que acabara de ligar.
   */
  it('falha do período comparativo NÃO derruba o dado principal', async () => {
    h.filters.compareEnabled = true;
    h.filters.comparePeriod = { start: '2026-01-01', end: '2026-03-01' };

    let call = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      call += 1;
      // A 1ª leva do período atual passa; a do comparativo explode.
      if (call > 1) throw new Error('rede caiu no comparativo');
      const body = JSON.parse(init.body) as { metricIds: string[] };
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) results[id] = { ok: true, data: [{ value: 100 }] };
      return { ok: true, json: async () => ({ results }) };
    });

    const { result } = renderHook(() => useReportData(blocks(), undefined, undefined, 'covenants'));
    await waitFor(() => expect(result.current.populatedBlockMap).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  /**
   * O comparativo alcança o KPI de POSIÇÃO — que é todo KPI do produto.
   *
   * A guarda de `applyComparisonToBlock` perguntava `reactsToPeriod`, que só
   * procura `{filter.date_range}`. Os 46 KPIs e os 4 medidores do Vila Rosa são
   * pins com `{filter.ate}`: reprovavam na guarda, e o selo de variação — que
   * só esses blocos sabem desenhar — nunca aparecia em lugar nenhum. A segunda
   * consulta saía, voltava com o número do outro mês, e era descartada.
   */
  it('KPI de posição recebe o selo de variação contra o período comparativo', async () => {
    h.filters.compareEnabled = true;
    h.filters.comparePeriod = { start: '2026-01-01', end: '2026-03-01' };
    // Cada recorte devolve o número do SEU mês final — é o que o pin faz.
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        metricIds: string[]; pageFilters: Record<string, { value?: string }>;
      };
      const value = body.pageFilters.ate?.value === '2026-03-01' ? 100 : 120;
      const results: Record<string, unknown> = {};
      for (const id of body.metricIds) results[id] = { ok: true, data: [{ value }] };
      return { ok: true, json: async () => ({ results }) };
    });

    const withPin = {
      kpiPin: {
        id: 'kpiPin', type: 'kpi', metricId: 'm.pin', label: 'Índice de Recebível', value: '—',
      } as unknown as CanvasBlock,
    };
    const { result } = renderHook(() => useReportData(withPin, undefined, undefined, 'covenants'));

    await waitFor(() => expect(result.current.populatedBlockMap?.kpiPin).toBeDefined());
    await waitFor(() => {
      const block = result.current.populatedBlockMap!.kpiPin as unknown as {
        deltaPercent?: string; deltaDirection?: string;
      };
      expect(block.deltaPercent).toBe('20,0%');
      expect(block.deltaDirection).toBe('up');
    });
  });
});

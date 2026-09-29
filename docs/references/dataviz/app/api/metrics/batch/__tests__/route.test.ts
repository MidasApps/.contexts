/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  loadBindings: vi.fn(),
  execMetric: vi.fn(),
  getAll: vi.fn(),
  relationsGet: vi.fn(async () => ({ docs: [] as unknown[] })),
}));

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: (...a: unknown[]) => h.verifyAuth(...a) }));
vi.mock('@/shared/lib/runtime-config', () => ({ DATAVIZ_DATABASE_ID: 'test-db' }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({ doc: (id: string) => ({ id }), get: () => h.relationsGet() }),
    getAll: (...refs: Array<{ id: string }>) => h.getAll(refs),
  }),
}));
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: (...a: unknown[]) => h.loadBindings(...a),
  executeMetric: (...a: unknown[]) => h.execMetric(...a),
  newMetricExecCaches: () => ({ dataSources: new Map(), accessChecked: new Map() }),
}));

import { POST } from '../route';

function req(body: unknown) {
  return { json: async () => body } as never;
}

// Doc Firestore de métrica válida (aggregation → não dispara load de relations).
function snap(id: string, exists = true) {
  return {
    id,
    exists,
    data: () => ({
      label: id,
      requires: ['canonical.carteira.saldo'],
      recipe: { kind: 'aggregation', primaryEntity: 'carteira', aggregation: 'sum', valueAttribute: 'carteira.saldo', groupByAttributes: [], filters: [] },
      type: 'kpi',
      version: '1.0.0',
      status: 'active',
      ownerClientId: null,
      createdAt: null,
      updatedAt: null,
    }),
  };
}

beforeEach(() => {
  h.verifyAuth.mockReset().mockResolvedValue('u@e.com');
  h.loadBindings.mockReset().mockResolvedValue({ ok: true, bindings: [{ productId: 'p', datasets: [] }] });
  h.execMetric.mockReset();
  h.getAll.mockReset();
  h.relationsGet.mockReset().mockResolvedValue({ docs: [] });
});

describe('POST /api/metrics/batch', () => {
  it('mix ok + fail numa chamada → 200 com results misto', async () => {
    h.getAll.mockResolvedValue([snap('carteira.good'), snap('carteira.bad')]);
    h.execMetric.mockImplementation(async ({ metric }: { metric: { id: string } }) =>
      metric.id === 'carteira.bad'
        ? { ok: false, metricId: 'carteira.bad', status: 422, error: 'lacuna' }
        : { ok: true, metricId: metric.id, data: [{ value: 1 }], sql: 's', outputColumns: ['value'] },
    );
    const res = await POST(req({ clientId: 'c', metricIds: ['carteira.good', 'carteira.bad'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results['carteira.good'].ok).toBe(true);
    expect(body.results['carteira.bad']).toMatchObject({ ok: false, status: 422 });
  });

  it('deduplica metricIds repetidos (1 entrada, 1 getAll ref)', async () => {
    h.getAll.mockResolvedValue([snap('carteira.good')]);
    h.execMetric.mockResolvedValue({ ok: true, metricId: 'carteira.good', data: [], sql: '', outputColumns: [] });
    const res = await POST(req({ clientId: 'c', metricIds: ['carteira.good', 'carteira.good'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.results)).toEqual(['carteira.good']);
    expect(h.getAll.mock.calls[0][0]).toHaveLength(1);
    expect(h.execMetric).toHaveBeenCalledTimes(1);
  });

  it('metricId inexistente → results[id] ok:false 404', async () => {
    h.getAll.mockResolvedValue([snap('carteira.missing', false)]);
    const res = await POST(req({ clientId: 'c', metricIds: ['carteira.missing'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results['carteira.missing']).toMatchObject({ ok: false, status: 404 });
    expect(h.execMetric).not.toHaveBeenCalled();
  });

  it('sem token → 401', async () => {
    h.verifyAuth.mockResolvedValue(null);
    const res = await POST(req({ clientId: 'c', metricIds: ['a'] }));
    expect(res.status).toBe(401);
  });

  it('metricIds vazio → 400', async () => {
    const res = await POST(req({ clientId: 'c', metricIds: [] }));
    expect(res.status).toBe(400);
  });

  it('acima do cap (51) → 400', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `m${i}`);
    const res = await POST(req({ clientId: 'c', metricIds: ids }));
    expect(res.status).toBe(400);
  });

  it('repassa ambientFilters do body para executeMetric', async () => {
    h.getAll.mockResolvedValue([snap('carteira.good')]);
    h.execMetric.mockResolvedValue({ ok: true, metricId: 'carteira.good', data: [], sql: '', outputColumns: [] });
    const ambientFilters = [{ op: 'in', attribute: 'contratos.rating_liquid', values: ['A'] }];
    await POST(req({ clientId: 'c', metricIds: ['carteira.good'], ambientFilters }));
    expect(h.execMetric).toHaveBeenCalledWith(expect.objectContaining({ ambientFilters }));
  });

  it('cliente sem bindings → erro de topo (não-200)', async () => {
    h.loadBindings.mockResolvedValue({ ok: false, status: 422, error: 'sem bindings' });
    h.getAll.mockResolvedValue([snap('good')]);
    const res = await POST(req({ clientId: 'c', metricIds: ['good'] }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('sem bindings');
  });
});

/**
 * ADR-0026 — filtro `in` declarado sobre o campo do indicador não manda
 * `attribute`: quem diz o que comparar é a métrica, em `filterFields`.
 *
 * Exigi-lo aqui rejeitava o lote inteiro com 400 — a página não carregaria
 * NENHUM bloco por causa de um seletor.
 */
describe('POST /api/metrics/batch — filtro in sem attribute', () => {
  it('aceita a seleção do seletor e a repassa ao executeMetric', async () => {
    h.getAll.mockResolvedValue([snap('carteira.good')]);

    const res = await POST(req({
      clientId: 'c',
      metricIds: ['carteira.good'],
      pageFilters: { banco: { kind: 'in', values: ['BANCO INTER'] } },
    }));

    expect(res.status).toBe(200);
    expect(h.execMetric).toHaveBeenCalledWith(expect.objectContaining({
      pageFilters: { banco: { kind: 'in', values: ['BANCO INTER'] } },
    }));
  });
});

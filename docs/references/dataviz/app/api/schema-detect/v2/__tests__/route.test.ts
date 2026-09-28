/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  genObjMock: vi.fn(),
  getProductMock: vi.fn(),
  bqQueryMock: vi.fn(),
  contracts: {} as Record<string, Record<string, Record<string, Record<string, unknown>>>>,
  metrics: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('ai', () => ({ generateObject: h.genObjMock }));
vi.mock('@ai-sdk/google-vertex', () => ({ vertex: () => 'model' }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async () => ({ email: 'a@b.com' }) }) }));
vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: () => true, isDevAuthBypassEnabled: () => true, DEV_BYPASS_EMAIL: 'a@b.com',
}));
vi.mock('@/shared/repositories/product-repo', () => ({ getProduct: h.getProductMock }));
vi.mock('@/shared/lib/bigquery/client', () => ({ getBigQueryClientFor: async () => ({ query: h.bqQueryMock }) }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: vi.fn(),
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'metrics') return { doc: (id: string) => ({ get: async () => ({ exists: !!h.metrics[id], data: () => h.metrics[id] }) }) };
      if (name === 'dataContracts') return {
        doc: (c: string) => ({ collection: () => ({
          get: async () => ({ docs: Object.keys(h.contracts[c] ?? {}).map((id) => ({ id, data: () => ({}) })) }),
          doc: (eid: string) => ({ collection: () => ({
            get: async () => ({ docs: Object.entries(h.contracts[c]?.[eid] ?? {}).map(([aid, d]) => ({ id: aid, data: () => d })) }),
          }) }),
        }) }),
      };
      throw new Error(`unexpected collection ${name}`);
    },
  }),
}));

import { POST } from '../route';

function req(body: unknown) {
  return { headers: { get: () => 'Bearer x' }, json: async () => body } as never;
}

beforeEach(() => {
  h.genObjMock.mockReset(); h.getProductMock.mockReset(); h.bqQueryMock.mockReset();
  h.contracts = {}; h.metrics = {};
  h.getProductMock.mockResolvedValue({ id: 'prod', name: 'Prod', metricRefs: [] });
  h.bqQueryMock.mockResolvedValue([[
    { table_name: 'contratos', column_name: 'vl_saldo', data_type: 'FLOAT64' },
  ]]);
  h.genObjMock.mockResolvedValue({ object: { contratos: { saldo_devedor: 'vl_saldo' } } });
});

describe('POST /api/schema-detect/v2 (contract-driven)', () => {
  it('mapeia colunas reais → SemanticSchemaBinding flat (sem expectedTables)', async () => {
    h.contracts['canonical'] = { contratos: { saldo_devedor: { type: 'float' } } };
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.schemaBindings).toEqual({ 'contratos.saldo_devedor': 'vl_saldo' });
  });

  it('passa o teto de bytes na leitura de INFORMATION_SCHEMA', async () => {
    h.contracts['canonical'] = { contratos: { saldo_devedor: { type: 'float' } } };
    await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));

    const opts = h.bqQueryMock.mock.calls[0][0] as { maximumBytesBilled?: string };
    expect(Number(opts.maximumBytesBilled)).toBeGreaterThan(0);
  });

  it('422 quando o contrato não tem entidades/atributos', async () => {
    h.contracts['canonical'] = {};
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    expect(res.status).toBe(422);
  });

  it('coverage reporta refs de métricas contratadas sem binding', async () => {
    h.contracts['canonical'] = { contratos: { saldo_devedor: { type: 'float' }, ltv: { type: 'float' } } };
    h.getProductMock.mockResolvedValue({ id: 'prod', name: 'Prod', metricRefs: ['m.ltv'] });
    h.metrics['m.ltv'] = { requires: ['canonical.contratos.ltv'] };
    h.genObjMock.mockResolvedValue({ object: { contratos: { saldo_devedor: 'vl_saldo', ltv: null } } });
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    const body = await res.json();
    expect(body.data.coverage).toContainEqual({ ref: 'canonical.contratos.ltv', reason: 'desabilitado' });
  });
});

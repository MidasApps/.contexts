/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldUnavailableError } from '@/shared/lib/bigquery/schema-resolver';

const defaultClientData = { dataset: 'ds', schema: { contratos: { saldo_devedor: null } } };
const h = vi.hoisted(() => ({
  filterMock: vi.fn(),
  clientData: {} as Record<string, unknown>,
  docsBefore: [] as Array<{ id: string; data: () => unknown }>,
}));

vi.mock('@/shared/lib/bigquery/queries', () => ({
  queryFilterOptions: h.filterMock,
}));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({
    collection: () => ({
      get: async () => ({ docs: [...h.docsBefore, { id: 'c', data: () => h.clientData }] }),
    }),
  }),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: () => true }));
vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: async () => 'a@b.com',
}));

import { POST } from '../route';

function req(body: unknown) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  h.filterMock.mockReset();
  h.clientData = defaultClientData;
  h.docsBefore = [];
});

describe('POST /api/filter-options', () => {
  it('dataset válido → 200', async () => {
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });
    const res = await POST(req({ dataset: 'ds' }));
    expect(res.status).toBe(200);
  });

  it('FieldUnavailableError → 422 nomeando o campo (fail-loud)', async () => {
    h.filterMock.mockImplementation(() => { throw new FieldUnavailableError('contratos', 'saldo_devedor'); });
    const res = await POST(req({ dataset: 'ds' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('contratos.saldo_devedor');
  });

  it('forwards the source resolved from the client binding to queryFilterOptions', async () => {
    h.clientData = {
      productBindings: [{
        productId: 'imobiliaria',
        datasets: [{
          dataSourceId: 'bq-data-wh',
          datasetId: 'imobiliaria_demo',
          tableBindings: { leads: 'leads', estoque_snapshot: 'estoque_snapshot' },
          schemaBindings: { 'estoque_snapshot.data_base_report': 'data_base_report' },
        }],
      }],
    };
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });
    const res = await POST(req({ dataset: 'bq-data-wh.imobiliaria_demo' }));
    expect(res.status).toBe(200);
    expect(h.filterMock).toHaveBeenCalledWith('bq-data-wh.imobiliaria_demo', null, {
      table: 'estoque_snapshot',
      dateField: 'data_base_report',
      projectField: null,
    });
  });

  it('falls back to the default source when productBindings is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.clientData = { dataset: 'ds', productBindings: { datasets: 'not-an-array' } };
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });

    const res = await POST(req({ dataset: 'ds' }));

    expect(res.status).toBe(200);
    expect(h.filterMock).toHaveBeenCalledWith('ds', null, {
      table: 'contratos',
      dateField: 'data_base_report',
      projectField: 'projeto',
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // At f880e0f the lookup threw on this other client's document, so every
  // request scanning past it returned 500.
  it('serves this client when another client document before it is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.docsBefore = [{ id: 'broken-client', data: () => ({ productBindings: { datasets: [] } }) }];
    h.clientData = {
      productBindings: [{
        datasets: [{
          dataSourceId: 'proj',
          datasetId: 'ds',
          tableBindings: { estoque_snapshot: 'estoque_snapshot', pagamentos: null },
          schemaBindings: { 'estoque_snapshot.data_base_report': 'data_base_report' },
        }],
      }],
    };
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });

    const res = await POST(req({ dataset: 'proj.ds' }));

    expect(res.status).toBe(200);
    expect(h.filterMock).toHaveBeenCalledWith('proj.ds', null, {
      table: 'estoque_snapshot',
      dateField: 'data_base_report',
      projectField: null,
    });
    warn.mockRestore();
  });

  it('returns the unavailable fields of a valid legacy schema', async () => {
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });

    const res = await POST(req({ dataset: 'ds' }));

    expect(await res.json()).toEqual({ data: { dataBases: [], projetos: [] }, unavailableFields: ['saldo_devedor'] });
    expect(h.filterMock).toHaveBeenCalledWith('ds', { contratos: { saldo_devedor: null } }, expect.anything());
  });

  // On main the unavailable-fields loop threw on the null table: 500 for this client.
  it('serves a client whose legacy schema has a malformed table, keeping the valid ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.clientData = { dataset: 'ds', schema: { pagamentos: null, contratos: { data_base_report: 'dt_ref', saldo_devedor: null } } };
    h.filterMock.mockResolvedValue({ dataBases: [], projetos: [] });

    const res = await POST(req({ dataset: 'ds' }));

    expect(res.status).toBe(200);
    expect((await res.json()).unavailableFields).toEqual(['saldo_devedor']);
    expect(h.filterMock).toHaveBeenCalledWith(
      'ds',
      { contratos: { data_base_report: 'dt_ref', saldo_devedor: null } },
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('dataset ausente → 400', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});

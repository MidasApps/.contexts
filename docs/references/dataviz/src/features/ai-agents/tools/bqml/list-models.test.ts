import { describe, it, expect, vi, beforeEach } from 'vitest';

const getModelsMock = vi.fn();
const datasetMock = vi.fn(() => ({ getModels: getModelsMock }));
const queryMock = vi.fn();

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    dataset: datasetMock,
    query: queryMock,
  }),
}));

describe('createBqmlListModelsTool', () => {
  beforeEach(() => {
    getModelsMock.mockReset();
    datasetMock.mockClear();
    queryMock.mockReset().mockResolvedValue([[]]);
  });

  it('lists models from tenant dataset and joins registry', async () => {
    getModelsMock.mockResolvedValue([
      [{ id: 'bqml_forecast_inad_safra' }, { id: 'bqml_kmeans_safras' }],
    ]);
    queryMock.mockResolvedValue([
      [
        {
          model_ref: 'dataviz_bqml_vila_rosa.bqml_forecast_inad_safra',
          intent: 'forecast',
          model_type: 'ARIMA_PLUS',
          created_at: { value: '2026-04-01' },
          last_used_at: null,
        },
      ],
    ]);
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    const tool = createBqmlListModelsTool({ clientId: 'vila-rosa' });
    const out = (await tool.execute!({}, { toolCallId: 't', messages: [] } as never)) as {
      models: Array<{ name: string; intent?: string }>;
    };
    expect(out.models).toHaveLength(2);
    expect(out.models[0]!.name).toBe('bqml_forecast_inad_safra');
    expect(out.models[0]!.intent).toBe('forecast');
    expect(datasetMock).toHaveBeenCalledWith('dataviz_bqml_vila_rosa');
  });

  it('caches per clientId for 1h', async () => {
    getModelsMock.mockResolvedValue([[{ id: 'bqml_a' }]]);
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    const tool = createBqmlListModelsTool({ clientId: 'vila-rosa' });
    await tool.execute!({}, { toolCallId: 't', messages: [] } as never);
    await tool.execute!({}, { toolCallId: 't', messages: [] } as never);
    expect(getModelsMock).toHaveBeenCalledTimes(1);
  });

  // Era "rejects unknown clientId": `deriveBqmlDataset` tinha uma allowlist de
  // tenants escrita no código, e `xyz` caía nela. A allowlist saiu — cliente é
  // cadastro da administração — e o que sobrou é a checagem de FORMATO, que é o
  // que de fato protege o nome do dataset de ser escapado.
  it('rejects clientId que escaparia do nome do dataset', async () => {
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    const tool = createBqmlListModelsTool({ clientId: 'proj.outro_dataset' });
    await expect(
      tool.execute!({}, { toolCallId: 't', messages: [] } as never),
    ).rejects.toThrow(/Invalid client id/);
  });
});

// rules/cost.md: todo caminho que executa SQL passa `maximumBytesBilled`.
describe('bqml_list_models — teto de bytes', () => {
  it('a consulta ao registry passa maximumBytesBilled', async () => {
    getModelsMock.mockResolvedValue([[{ id: 'bqml_x' }]]);
    queryMock.mockReset().mockResolvedValue([[]]);
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    await createBqmlListModelsTool({ clientId: 'vila-rosa' }).execute!({}, { toolCallId: 't', messages: [] } as never);
    const { maxBytesBilled } = await import('@/shared/lib/bigquery/cost-guard');
    expect(queryMock.mock.calls[0]![0].maximumBytesBilled).toBe(String(maxBytesBilled()));
  });
});

/** Sem try/catch, o erro do BigQuery chegava cru ao modelo, com o id do projeto. */
describe('bqml_list_models — erro do BigQuery', () => {
  it('returns no models when the client has never trained one (no BQML dataset)', async () => {
    getModelsMock.mockRejectedValue(Object.assign(new Error('Not found: Dataset white-smile-508914-q2:dataviz_bqml_imob_demo'), { code: 404 }));
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    const out = await createBqmlListModelsTool({ clientId: 'imob-demo' }).execute!({}, { toolCallId: 't', messages: [] } as never);
    expect(out).toEqual({ models: [], cacheHit: false });
  });

  it('redacts any other BigQuery error instead of throwing it raw', async () => {
    getModelsMock.mockRejectedValue(new Error('Access Denied: Dataset white-smile-508914-q2:dataviz_bqml_x: denied for sa@white-smile-508914-q2.iam.gserviceaccount.com'));
    const { createBqmlListModelsTool, __resetListCache } = await import('./list-models');
    __resetListCache();
    const out = (await createBqmlListModelsTool({ clientId: 'vila-rosa' }).execute!({}, { toolCallId: 't', messages: [] } as never)) as { success: boolean; error: string };
    expect(out.success).toBe(false);
    expect(out.error).not.toMatch(/white-smile|sa@/);
  });
});

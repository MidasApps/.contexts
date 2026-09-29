import { describe, it, expect, vi, beforeEach } from 'vitest';

// Escopo do cliente: bindings lidos do Firestore no servidor. Aqui, o cliente
// não tem bindings, e o escopo é só o dataset da rota + referência compartilhada.
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async () => ({ ok: false, status: 404, error: 'não encontrado' }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => null }));

/**
 * Ataques aos tools que CONSOMEM modelo (predict, forecast, detect_anomalies).
 *
 * - `modelRef` ia entre crases no SQL, e a checagem de tenant era um regex
 *   ancorado só no início: `dataviz_bqml_vila_rosa.bqml_x\`, (…)); DROP …`
 *   passava e fechava o identificador.
 * - `inputQuery` do predict ia cru dentro de `ML.PREDICT(…, (<inputQuery>))`.
 * - Nenhum desses jobs tinha `maximumBytesBilled`.
 */

vi.mock('@/shared/lib/telemetry/record-span', () => ({
  recordSpan: (_o: unknown, fn: () => unknown) => Promise.resolve(fn()),
}));
vi.mock('./invocation-logger', () => ({ logBqmlInvocation: vi.fn() }));

const queryMock = vi.fn();
const createQueryJobMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({ projectId: 'proj-teste', query: queryMock, createQueryJob: createQueryJobMock }),
}));

const TENANT = 'vila_rosa_play';
const CTX = { clientId: 'vila-rosa', dataset: TENANT, sessionId: 's', agentId: 'a' };
const OPTS = { toolCallId: 't', messages: [] } as never;

const INJECTED_REFS = [
  'dataviz_bqml_vila_rosa.bqml_x`, (SELECT * FROM `proj-teste.outro_play.contratos`)); DROP TABLE t; --',
  'dataviz_bqml_vila_rosa.bqml_x`; DROP TABLE t; --',
  'dataviz_bqml_vila_rosa.bqml_x.extra',
  'dataviz_bqml_vila_rosa.bqml_x y',
  'dataviz_bqml_vila_rosa.bqml x',
  'dataviz_bqml_outro_cliente.bqml_x',
];

function selectDryRun(tables: Array<[string, string, string]> = [['proj-teste', TENANT, 'contratos']]) {
  return [{
    metadata: {
      statistics: {
        totalBytesProcessed: '100',
        query: {
          statementType: 'SELECT',
          referencedTables: tables.map(([projectId, datasetId, tableId]) => ({ projectId, datasetId, tableId })),
        },
      },
    },
  }];
}

beforeEach(() => {
  queryMock.mockReset();
  createQueryJobMock.mockReset();
});

describe('assertClientMatchesDataset é ancorado nas duas pontas', () => {
  it.each(INJECTED_REFS)('recusa %s', async (ref) => {
    const { assertClientMatchesDataset } = await import('./multi-tenancy');
    expect(() => assertClientMatchesDataset('vila-rosa', ref)).toThrow();
  });
});

describe('modelRef injetado não chega ao BigQuery', () => {
  it.each(INJECTED_REFS)('predict: %s', async (modelRef) => {
    const { createBqmlPredictTool } = await import('./predict');
    await expect(createBqmlPredictTool(CTX).execute!({ modelRef, inputQuery: 'SELECT 1 AS ltv' }, OPTS)).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });

  it.each(INJECTED_REFS)('forecast: %s', async (modelRef) => {
    const { createBqmlForecastTool } = await import('./forecast');
    await expect(createBqmlForecastTool(CTX).execute!({ modelRef, horizon: 6, confidenceLevel: 0.9 }, OPTS)).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(INJECTED_REFS)('detect_anomalies: %s', async (modelRef) => {
    const { createBqmlDetectAnomaliesTool } = await import('./detect-anomalies');
    await expect(
      createBqmlDetectAnomaliesTool(CTX).execute!({ modelRef, anomalyProbThreshold: 0.9 }, OPTS),
    ).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('bqml_predict — inputQuery', () => {
  const REF = 'dataviz_bqml_vila_rosa.bqml_x';

  it.each([
    ['fecha o parêntese e emenda comando', 'SELECT 1 AS ltv)); DROP TABLE contratos; --'],
    ['segundo comando', 'SELECT 1 AS ltv; DELETE FROM contratos WHERE TRUE'],
    ['DML', 'INSERT INTO contratos (ltv) VALUES (1)'],
    ['scripting', "EXECUTE IMMEDIATE 'DROP TABLE contratos'"],
    ['comentário + quebra de linha', 'SELECT 1 AS ltv --\n; DROP TABLE contratos'],
    ['ML.* de outro modelo (fora do referencedTables)', 'SELECT * FROM ML.PREDICT(MODEL `proj-teste.dataviz_bqml_outro.bqml_x`, (SELECT 1 AS ltv))'],
    ['EXTERNAL_QUERY', "SELECT * FROM EXTERNAL_QUERY('proj-teste.us.conn', 'SELECT ltv FROM contratos')"],
  ])('%s é recusado sem job', async (_n, inputQuery) => {
    const { createBqmlPredictTool } = await import('./predict');
    const out = await createBqmlPredictTool(CTX).execute!({ modelRef: REF, inputQuery }, OPTS);
    expect(out).toMatchObject({ success: false, code: 'SQL_RECUSADO' });
    expect(queryMock).not.toHaveBeenCalled();
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });

  it('recusa inputQuery que lê dataset de outro cliente', async () => {
    createQueryJobMock.mockResolvedValueOnce(selectDryRun([['proj-teste', 'outro_play', 'contratos']]));
    const { createBqmlPredictTool } = await import('./predict');
    const out = await createBqmlPredictTool(CTX).execute!(
      { modelRef: REF, inputQuery: 'SELECT ltv FROM `proj-teste.outro_play.contratos`' },
      OPTS,
    );
    expect(out).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('falha do dry-run recusa (fail closed)', async () => {
    createQueryJobMock.mockRejectedValueOnce(new Error('indisponível'));
    const { createBqmlPredictTool } = await import('./predict');
    const out = await createBqmlPredictTool(CTX).execute!({ modelRef: REF, inputQuery: 'SELECT ltv FROM contratos' }, OPTS);
    expect(out).toMatchObject({ success: false, code: 'FORA_DO_TENANT' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('caminho legítimo: ref recomposto, dataset do tenant e teto de bytes', async () => {
    createQueryJobMock.mockResolvedValueOnce(selectDryRun());
    queryMock.mockResolvedValueOnce([[{ predicted: 1 }]]);
    const { createBqmlPredictTool } = await import('./predict');
    const out = await createBqmlPredictTool(CTX).execute!(
      { modelRef: '`proj-teste.dataviz_bqml_vila_rosa.bqml_x`', inputQuery: 'SELECT ltv FROM contratos;' },
      OPTS,
    );
    expect(out).toMatchObject({ rowCount: 1 });
    const opts = queryMock.mock.calls[0]![0] as { query: string; maximumBytesBilled?: string; defaultDataset?: unknown };
    expect(opts.query).toContain('ML.PREDICT(MODEL `dataviz_bqml_vila_rosa.bqml_x`');
    expect(opts.query).toContain('SELECT ltv FROM contratos');
    expect(opts.query).not.toContain('contratos;');
    const { maxBytesBilled } = await import('@/shared/lib/bigquery/cost-guard');
    expect(opts.maximumBytesBilled).toBe(String(maxBytesBilled()));
    expect(opts.defaultDataset).toEqual({ datasetId: TENANT });
  });
});

describe('forecast / detect_anomalies aplicam o teto de bytes', () => {
  it('forecast', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { createBqmlForecastTool } = await import('./forecast');
    await createBqmlForecastTool(CTX).execute!({ modelRef: 'dataviz_bqml_vila_rosa.bqml_x', horizon: 6, confidenceLevel: 0.9 }, OPTS);
    expect(queryMock.mock.calls[0]![0].maximumBytesBilled).toBeDefined();
  });

  it('detect_anomalies', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { createBqmlDetectAnomaliesTool } = await import('./detect-anomalies');
    await createBqmlDetectAnomaliesTool(CTX).execute!({ modelRef: 'dataviz_bqml_vila_rosa.bqml_x', anomalyProbThreshold: 0.9 }, OPTS);
    expect(queryMock.mock.calls[0]![0].maximumBytesBilled).toBeDefined();
  });
});

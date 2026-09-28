import { describe, it, expect, vi, beforeEach } from 'vitest';

// Escopo do cliente: bindings lidos do Firestore no servidor. Aqui, o cliente
// não tem bindings, e o escopo é só o dataset da rota + referência compartilhada.
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async () => ({ ok: false, status: 404, error: 'não encontrado' }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => null }));

const lookupCachedModelMock = vi.fn();
const recordModelInRegistryMock = vi.fn();
const bumpUsageMock = vi.fn();
const computeModelHashMock = vi.fn();
const computeFeaturesCanonicalMock = vi.fn();
const computeSourceColumnsDdlHashMock = vi.fn();

vi.mock('./cache', () => ({
  lookupCachedModel: (...a: unknown[]) => lookupCachedModelMock(...a),
  recordModelInRegistry: (...a: unknown[]) => recordModelInRegistryMock(...a),
  bumpUsage: (...a: unknown[]) => bumpUsageMock(...a),
  computeModelHash: (...a: unknown[]) => computeModelHashMock(...a),
  computeFeaturesCanonical: (...a: unknown[]) => computeFeaturesCanonicalMock(...a),
  computeSourceColumnsDdlHash: (...a: unknown[]) => computeSourceColumnsDdlHashMock(...a),
}));

const createQueryJobMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({
    projectId: 'proj-teste',
    createQueryJob: createQueryJobMock,
    dataset: () => ({
      model: () => ({ getMetadata: async () => [{ trainingRuns: [{ evaluationMetrics: {} }] }] }),
    }),
  }),
}));

const logBqmlInvocationMock = vi.fn();
vi.mock('./invocation-logger', () => ({
  logBqmlInvocation: (...a: unknown[]) => logBqmlInvocationMock(...a),
}));

/** Dry-run de um SELECT que lê só o dataset do tenant. */
function selectDryRun(bytes: string) {
  return {
    metadata: {
      statistics: {
        totalBytesProcessed: bytes,
        query: {
          statementType: 'SELECT',
          referencedTables: [{ projectId: 'proj-teste', datasetId: 'vila_rosa_play', tableId: 'contratos' }],
        },
      },
    },
  };
}

const baseInput = {
  intent: 'forecast' as const,
  features: ['ltv', 'prazo_decorrido'],
  target: 'pdd_liquid',
  sourceQuery: 'SELECT * FROM contratos',
  sourceColumns: [{ name: 'ltv', type: 'NUMERIC', mode: 'NULLABLE' }],
  safraWindowEnd: '2026-04-01',
  modelTypeOverride: null,
  ddlOptions: null,
};

describe('createBqmlCreateOrUseModelTool', () => {
  beforeEach(() => {
    lookupCachedModelMock.mockReset();
    recordModelInRegistryMock.mockReset();
    bumpUsageMock.mockReset();
    computeModelHashMock.mockReset().mockReturnValue('hash-abc');
    computeFeaturesCanonicalMock.mockReset().mockReturnValue('ltv|prazo');
    computeSourceColumnsDdlHashMock.mockReset().mockReturnValue('cols-abc');
    createQueryJobMock.mockReset();
    logBqmlInvocationMock.mockReset();
  });

  it('cache hit: returns ready immediately, bumpUsage called, no createQueryJob', async () => {
    lookupCachedModelMock.mockResolvedValue({
      hash: 'hash-abc',
      clientId: 'vila-rosa',
      intent: 'forecast',
      modelType: 'ARIMA_PLUS',
      modelRef: 'dataviz_bqml_vila_rosa.bqml_x',
      featuresCanonical: 'ltv|prazo',
      target: 'pdd_pct',
      safraWindowEnd: '2026-04-01',
      sourceColumnsDdlHash: 'cols-abc',
    });
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const gen = tool.execute!(baseInput, { toolCallId: 't', messages: [] } as never);
    const yields: unknown[] = [];
    for await (const y of gen as AsyncGenerator<unknown>) yields.push(y);
    const last = yields[yields.length - 1] as { status: string; cacheHit: boolean; modelRef: string };
    expect(last.status).toBe('ready');
    expect(last.cacheHit).toBe(true);
    expect(last.modelRef).toBe('dataviz_bqml_vila_rosa.bqml_x');
    expect(bumpUsageMock).toHaveBeenCalledWith('hash-abc', 'vila-rosa');
    expect(createQueryJobMock).not.toHaveBeenCalled();
  });

  it('cache miss: creates model and records in registry', async () => {
    lookupCachedModelMock.mockResolvedValue(null);
    // O dry-run agora é do sourceQuery (um SELECT), não do DDL: é ele que diz
    // se a query é um comando só de leitura e quais tabelas ela lê.
    const dryRunJob = selectDryRun('1000000');
    const realJob = {
      metadata: { status: { state: 'DONE' }, statistics: { totalBytesBilled: '2000000' } },
      getMetadata: async () => [{ status: { state: 'DONE' }, statistics: { totalBytesBilled: '2000000' } }],
    };
    createQueryJobMock
      .mockResolvedValueOnce([dryRunJob])
      .mockResolvedValueOnce([realJob]);
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const gen = tool.execute!(baseInput, { toolCallId: 't', messages: [] } as never);
    const yields: unknown[] = [];
    for await (const y of gen as AsyncGenerator<unknown>) yields.push(y);
    const last = yields[yields.length - 1] as { status: string; cacheHit: boolean };
    expect(last.status).toBe('ready');
    expect(last.cacheHit).toBe(false);
    expect(recordModelInRegistryMock).toHaveBeenCalledOnce();
  });

  it('logs invocation fire-and-forget', async () => {
    lookupCachedModelMock.mockResolvedValue({
      hash: 'hash-abc', clientId: 'vila-rosa', intent: 'forecast', modelType: 'ARIMA_PLUS',
      modelRef: 'dataviz_bqml_vila_rosa.bqml_x', featuresCanonical: 'ltv|prazo',
      target: 'pdd_pct', safraWindowEnd: '2026-04-01', sourceColumnsDdlHash: 'cols-abc',
    });
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const gen = tool.execute!(baseInput, { toolCallId: 't', messages: [] } as never);
    for await (const _ of gen as AsyncGenerator<unknown>) { /* drain */ }
    expect(logBqmlInvocationMock).toHaveBeenCalled();
  });

  it('needsApproval returns true when bytes > threshold', async () => {
    process.env.BQML_APPROVAL_BYTES_THRESHOLD = '500';
    createQueryJobMock.mockResolvedValueOnce([selectDryRun('6000000')]);
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const need = await (tool as unknown as { needsApproval: (i: typeof baseInput) => Promise<boolean> }).needsApproval(baseInput);
    expect(need).toBe(true);
    delete process.env.BQML_APPROVAL_BYTES_THRESHOLD;
  });

  it('needsApproval returns false on small jobs', async () => {
    createQueryJobMock.mockResolvedValueOnce([selectDryRun('1000000')]);
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const need = await (tool as unknown as { needsApproval: (i: typeof baseInput) => Promise<boolean> }).needsApproval(baseInput);
    expect(need).toBe(false);
  });

  it('schema drift invalidates cache (different sourceColumnsDdlHash → miss)', async () => {
    computeSourceColumnsDdlHashMock.mockReturnValueOnce('cols-DIFFERENT');
    computeModelHashMock.mockReturnValueOnce('hash-NEW');
    lookupCachedModelMock.mockResolvedValueOnce(null);
    createQueryJobMock
      .mockResolvedValueOnce([selectDryRun('1000')])
      .mockResolvedValueOnce([{ metadata: { status: { state: 'DONE' }, statistics: { totalBytesBilled: '1000' } }, getMetadata: async () => [{ status: { state: 'DONE' }, statistics: { totalBytesBilled: '1000' } }] }]);
    const { createBqmlCreateOrUseModelTool } = await import('./create-or-use-model');
    const tool = createBqmlCreateOrUseModelTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const gen = tool.execute!(baseInput, { toolCallId: 't', messages: [] } as never);
    for await (const _ of gen as AsyncGenerator<unknown>) { /* drain */ }
    expect(recordModelInRegistryMock).toHaveBeenCalledOnce();
  });
});

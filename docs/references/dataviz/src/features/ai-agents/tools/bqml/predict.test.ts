import { describe, it, expect, vi, beforeEach } from 'vitest';

// Escopo do cliente: bindings lidos do Firestore no servidor. Aqui, o cliente
// não tem bindings, e o escopo é só o dataset da rota + referência compartilhada.
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async () => ({ ok: false, status: 404, error: 'não encontrado' }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => null }));

const queryMock = vi.fn();
// O inputQuery agora passa por dry-run antes (guarda + escopo de tenant).
const createQueryJobMock = vi.fn(async () => [{
  metadata: {
    statistics: {
      totalBytesProcessed: '10',
      query: { statementType: 'SELECT', referencedTables: [] },
    },
  },
}]);
vi.mock('@/shared/lib/bigquery/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/bigquery/client')>()),
  getBigQueryClient: () => ({ projectId: 'proj-teste', query: queryMock, createQueryJob: createQueryJobMock }),
}));
const logMock = vi.fn();
vi.mock('./invocation-logger', () => ({
  logBqmlInvocation: (...a: unknown[]) => logMock(...a),
}));

describe('createBqmlPredictTool', () => {
  beforeEach(() => {
    queryMock.mockReset();
    logMock.mockReset();
  });

  it('runs ML.PREDICT with caller-provided inputQuery', async () => {
    queryMock.mockResolvedValueOnce([[{ predicted_label: 0.42 }]]);
    const { createBqmlPredictTool } = await import('./predict');
    const tool = createBqmlPredictTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    const out = await tool.execute!(
      { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', inputQuery: 'SELECT 1 AS ltv' },
      { toolCallId: 't', messages: [] } as never,
    );
    const sql = queryMock.mock.calls[0]![0].query as string;
    expect(sql).toContain('ML.PREDICT');
    expect(sql).toContain('SELECT 1 AS ltv');
    expect((out as { rowCount: number }).rowCount).toBe(1);
  });

  it('blocks cross-tenant model access', async () => {
    const { createBqmlPredictTool } = await import('./predict');
    const tool = createBqmlPredictTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    await expect(
      tool.execute!(
        { modelRef: 'dataviz_bqml_outro_tenant.bqml_x', inputQuery: 'SELECT 1' },
        { toolCallId: 't', messages: [] } as never,
      ),
    ).rejects.toThrow(/Cross-tenant/);
  });

  it('logs failure and rethrows on query error', async () => {
    queryMock.mockRejectedValueOnce(new Error('bq fail'));
    const { createBqmlPredictTool } = await import('./predict');
    const tool = createBqmlPredictTool({ clientId: 'vila-rosa', dataset: 'vila_rosa_play', sessionId: 's', agentId: 'a' });
    await expect(
      tool.execute!(
        { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', inputQuery: 'SELECT 1' },
        { toolCallId: 't', messages: [] } as never,
      ),
    ).rejects.toThrow(/bq fail/);
    expect(logMock.mock.calls[0]![0].success).toBe(false);
  });
});

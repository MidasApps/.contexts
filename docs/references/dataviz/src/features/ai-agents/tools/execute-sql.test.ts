import { describe, it, expect, vi, beforeEach } from 'vitest';

// Escopo do cliente: bindings lidos do Firestore no servidor. Aqui, o cliente
// não tem bindings, e o escopo é só o dataset da rota + referência compartilhada.
vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: async () => ({ ok: false, status: 404, error: 'não encontrado' }),
}));
vi.mock('@/shared/repositories/data-source-repo', () => ({ getDataSource: async () => null }));

const queryMock = vi.fn();
// Antes de executar, o tool faz um dry-run e exige statementType SELECT.
const dryRunMock = vi.fn(async () => [{
  metadata: { statistics: { totalBytesProcessed: '10', query: { statementType: 'SELECT', referencedTables: [] } } },
}]);
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    projectId: 'proj-teste',
    query: (...a: unknown[]) => queryMock(...a),
    createQueryJob: (...a: unknown[]) => dryRunMock(...(a as [])),
  }),
  parseDatasetRef: (ds: string) => ({ datasetId: ds, projectId: undefined }),
}));

const persistSqlMock = vi.fn();
vi.mock('@/shared/lib/memory/persist-sql', () => ({
  persistSqlGeneration: (...a: unknown[]) => persistSqlMock(...a),
}));

const incrementCatalogUseMock = vi.fn();
vi.mock('@/features/sql-catalog/use-count-hook', () => ({
  incrementCatalogUse: (...a: unknown[]) => incrementCatalogUseMock(...a),
}));

const canonicalSqlHashMock = vi.fn((sql: string) => `hash:${sql}`);
vi.mock('@/features/sql-catalog/hash', () => ({
  canonicalSqlHash: (sql: string) => canonicalSqlHashMock(sql),
}));

const baseCtx = {
  dataset: 'OM',
  filters: { dateRange: { start: '', end: '' }, projetos: [] },
  sessionId: 's',
  clientId: 'OM',
  personaId: 'cfo',
} as never;

async function runTool(ctx: unknown, query: string) {
  const { createExecuteSqlTool } = await import('./execute-sql');
  const tool = createExecuteSqlTool(ctx as never);
  return (await tool.execute!(
    { query },
    { toolCallId: 'tc', messages: [] } as never,
  )) as { success: boolean; rowCount?: number; error?: string };
}

describe('createExecuteSqlTool', () => {
  beforeEach(() => {
    queryMock.mockReset();
    persistSqlMock.mockReset();
    persistSqlMock.mockResolvedValue(undefined);
    incrementCatalogUseMock.mockReset();
    incrementCatalogUseMock.mockResolvedValue(undefined);
    canonicalSqlHashMock.mockClear();
  });

  it('persists on success when clientId+personaId present', async () => {
    queryMock.mockResolvedValueOnce([[{ id: 1, name: 'a' }]]);
    const out = await runTool(baseCtx, 'SELECT id, name FROM contratos');
    expect(out.success).toBe(true);
    // Wait a tick for the fire-and-forget microtask.
    await new Promise((r) => setImmediate(r));
    expect(persistSqlMock).toHaveBeenCalledTimes(1);
    const call = persistSqlMock.mock.calls[0][0];
    expect(call.clientId).toBe('OM');
    expect(call.personaId).toBe('cfo');
    expect(call.sql).toBe('SELECT id, name FROM contratos');
    expect(call.rowCount).toBe(1);
    expect(call.schemaSnapshot).toEqual({ columns: ['id', 'name'] });
    expect(typeof call.latencyMs).toBe('number');
  });

  it('does NOT persist on error (forbidden keyword)', async () => {
    const out = await runTool(baseCtx, 'DROP TABLE contratos');
    expect(out.success).toBe(false);
    await new Promise((r) => setImmediate(r));
    expect(persistSqlMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does NOT persist when clientId missing', async () => {
    queryMock.mockResolvedValueOnce([[{ id: 1 }]]);
    const ctx = { ...(baseCtx as object), clientId: undefined };
    const out = await runTool(ctx, 'SELECT id FROM contratos');
    expect(out.success).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(persistSqlMock).not.toHaveBeenCalled();
  });

  it('swallows persistence failures', async () => {
    queryMock.mockResolvedValueOnce([[{ id: 1 }]]);
    persistSqlMock.mockRejectedValueOnce(new Error('boom'));
    const out = await runTool(baseCtx, 'SELECT id FROM contratos');
    expect(out.success).toBe(true);
    // No throw — fire-and-forget swallowed.
    await new Promise((r) => setImmediate(r));
    expect(persistSqlMock).toHaveBeenCalledTimes(1);
  });

  it('Sprint 3.C — fires incrementCatalogUse on success with canonical hash + clientId', async () => {
    queryMock.mockResolvedValueOnce([[{ id: 1 }]]);
    const out = await runTool(baseCtx, 'SELECT id FROM contratos');
    expect(out.success).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(canonicalSqlHashMock).toHaveBeenCalledWith('SELECT id FROM contratos');
    expect(incrementCatalogUseMock).toHaveBeenCalledTimes(1);
    expect(incrementCatalogUseMock).toHaveBeenCalledWith({
      sqlHash: 'hash:SELECT id FROM contratos',
      clientId: 'OM',
    });
  });

  it('Sprint 3.C — does NOT call incrementCatalogUse when clientId missing', async () => {
    queryMock.mockResolvedValueOnce([[{ id: 1 }]]);
    const ctx = { ...(baseCtx as object), clientId: undefined };
    const out = await runTool(ctx, 'SELECT id FROM contratos');
    expect(out.success).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(incrementCatalogUseMock).not.toHaveBeenCalled();
  });
});

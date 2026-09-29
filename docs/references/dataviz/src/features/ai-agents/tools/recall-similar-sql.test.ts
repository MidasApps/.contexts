import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/shared/lib/memory/recall-store', () => ({
  querySqlEmbeddings: (...a: unknown[]) => queryMock(...a),
  bumpReuse: (...a: unknown[]) => updateMock(...a),
}));
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    embed: vi.fn().mockResolvedValue({ embedding: Array(3072).fill(0.01) }),
  };
});
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { textEmbeddingModel: vi.fn(() => ({ provider: 'vertex' })) },
}));

describe('recall_similar_sql tool', () => {
  beforeEach(() => { queryMock.mockReset(); updateMock.mockReset(); });

  it('requires clientId + personaId filters (server-bound, ADR-0006)', async () => {
    const { createRecallSimilarSqlTool } = await import('./recall-similar-sql');
    expect(() => createRecallSimilarSqlTool({ clientId: '', personaId: 'p' })).toThrow(/clientId/);
    expect(() => createRecallSimilarSqlTool({ clientId: 'OM', personaId: '' })).toThrow(/personaId/);
  });

  it('returns topK matches and bumps reuse counters', async () => {
    queryMock.mockResolvedValueOnce([
      { id: 'r1', score: 0.92, sqlText: 'SELECT 1', intent: 'safra', schemaSnapshot: {} },
      { id: 'r2', score: 0.87, sqlText: 'SELECT 2', intent: 'safra2', schemaSnapshot: {} },
    ]);
    const { createRecallSimilarSqlTool } = await import('./recall-similar-sql');
    const tool = createRecallSimilarSqlTool({ clientId: 'OM', personaId: 'originador' });
    const execute = tool.execute as (
      input: unknown,
      options: unknown
    ) => Promise<{ matches: unknown[]; tokensSaved: number }>;
    const out = await execute(
      { intent: 'inadimplencia safra', topK: 2 },
      { toolCallId: 't', messages: [] }
    );
    expect(out.matches).toHaveLength(2);
    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'OM', personaId: 'originador', topK: 2,
    }));
    expect(updateMock).toHaveBeenCalledWith('embeddingsSql', ['r1', 'r2']);
  });

  /**
   * Recall gravado antes de uma regra nova: consulta a INFORMATION_SCHEMA com
   * o id do projeto por extenso. Ia ao modelo como exemplo a seguir.
   */
  it('drops recalled SQL that the guard refuses today', async () => {
    queryMock.mockResolvedValueOnce([
      { id: 'meta', score: 0.95, sqlText: 'SELECT table_name FROM `p.ds.INFORMATION_SCHEMA.TABLES`', intent: 'x', schemaSnapshot: {} },
      { id: 'ok', score: 0.9, sqlText: 'SELECT COUNT(*) AS n FROM contratos', intent: 'y', schemaSnapshot: {} },
    ]);
    const { createRecallSimilarSqlTool } = await import('./recall-similar-sql');
    const tool = createRecallSimilarSqlTool({ clientId: 'OM', personaId: 'originador' });
    const execute = tool.execute as (
      input: unknown,
      options: unknown
    ) => Promise<{ matches: unknown[]; tokensSaved: number }>;
    const out = await execute({ intent: 'tabelas', topK: 2 }, { toolCallId: 't', messages: [] });
    expect((out.matches as Array<{ id: string }>).map((m) => m.id)).toEqual(['ok']);
    expect(updateMock).toHaveBeenCalledWith('embeddingsSql', ['ok']);
  });
});

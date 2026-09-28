import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be set BEFORE importing the module under test.
const listByClientMock = vi.fn();
const findByHashMock = vi.fn();
const insertDraftMock = vi.fn();

vi.mock('@/features/sql-catalog/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/sql-catalog/repository')>();
  return {
    ...actual,
    createRepository: () => ({
      listByClient: (...a: unknown[]) => listByClientMock(...a),
      insertDraft: (...a: unknown[]) => insertDraftMock(...a),
      findByHash: (...a: unknown[]) => findByHashMock(...a),
      approve: vi.fn(),
      reject: vi.fn(),
      incrementUse: vi.fn(),
      markNeedsRevalidation: vi.fn(),
    }),
  };
});

const recallFallbackMock = vi.fn();
vi.mock('../recall-fallback', () => ({
  recallSqlFallback: (...a: unknown[]) => recallFallbackMock(...a),
}));

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: vi.fn() }),
}));

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({
    collection: () => ({
      add: vi.fn(async () => ({ id: 'evt-1' })),
    }),
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
  },
}));

type AnyCtx = Record<string, unknown>;
const baseCtx: AnyCtx = {
  dataset: 'OM',
  filters: { dateRange: { start: '', end: '' }, projetos: [], advancedFilters: {}, viewMode: 'snapshot' },
  sessionId: 's',
  clientId: 'OM',
  personaId: 'originador',
};

async function importTool() {
  const mod = await import('../bq-list-validated-queries');
  // Cast to a permissive signature so test ctxs with `unknown` shape are accepted.
  return mod.createBqListValidatedQueriesTool as unknown as (ctx: AnyCtx) => {
    execute: ToolExec;
    inputSchema: { safeParse: (i: unknown) => { success: boolean } };
  };
}

type ToolExec = (
  input: Record<string, unknown>,
  options: unknown,
) => Promise<{ items: unknown[]; curatedHits: number; recallHits: number }>;

describe('bq.list_validated_queries tool', () => {
  beforeEach(() => {
    listByClientMock.mockReset();
    recallFallbackMock.mockReset();
    findByHashMock.mockReset();
    insertDraftMock.mockReset();
  });

  it('throws if ctx.clientId missing (ADR-0006)', async () => {
    const factory = await importTool();
    expect(() => factory({ ...baseCtx, clientId: undefined })).toThrow(/clientId/);
    expect(() => factory({ ...baseCtx, clientId: '' })).toThrow(/clientId/);
  });

  it('rejects extra keys (zod strict) — schema-level guard', async () => {
    const factory = await importTool();
    const tool = factory(baseCtx);
    // The AI SDK validates `inputSchema` at call-time. Verify the schema directly.
    const schema = (tool as unknown as { inputSchema: { safeParse: (i: unknown) => { success: boolean } } }).inputSchema;
    const r = schema.safeParse({ intent: 'x', personaId: null, tags: null, topK: 5, clientId: 'B' });
    expect(r.success).toBe(false);
  });

  /**
   * Linhas aprovadas antes do escopo no catálogo: o dry-run antigo aceitava
   * INFORMATION_SCHEMA e dataset de outro cliente, e o SQL ia ao modelo.
   */
  it('drops approved curated SQL that the guard refuses today', async () => {
    listByClientMock.mockResolvedValueOnce([
      { id: 'meta', sql: 'SELECT table_catalog FROM ds.INFORMATION_SCHEMA.TABLES', intent: 'x', tags: null, quality_score: 0.9, status: 'approved', client_id: 'OM' },
      { id: 'ok', sql: 'SELECT COUNT(*) AS n FROM contratos', intent: 'y', tags: null, quality_score: 0.9, status: 'approved', client_id: 'OM' },
    ]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await tool.execute({ intent: 'tabelas', topK: 5 }, { toolCallId: 't', messages: [] });
    expect((out.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['ok']);
  });

  it('returns curated entries with quality_score >= 0.7 and source=curated', async () => {
    listByClientMock.mockResolvedValueOnce([
      { id: 'c1', sql: 'SELECT 1', intent: 'i1', tags: ['t'], quality_score: 0.9, status: 'approved', client_id: 'OM' },
      { id: 'c2', sql: 'SELECT 2', intent: 'i2', tags: null, quality_score: 0.8, status: 'approved', client_id: 'OM' },
      { id: 'c3', sql: 'SELECT 3', intent: 'i3', tags: null, quality_score: 0.75, status: 'approved', client_id: 'OM' },
    ]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await (tool.execute as ToolExec)(
      { intent: 'safra', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.curatedHits).toBe(3);
    expect(out.items).toHaveLength(3);
    expect(out.items.every((i) => (i as { source: string }).source === 'curated')).toBe(true);
  });

  it('filters out approved rows with quality_score < 0.7 from primary tier', async () => {
    listByClientMock.mockResolvedValueOnce([
      { id: 'good', sql: 'SELECT 1', intent: 'i', tags: null, quality_score: 0.9, status: 'approved', client_id: 'OM' },
      { id: 'bad', sql: 'SELECT 2', intent: 'i', tags: null, quality_score: 0.5, status: 'approved', client_id: 'OM' },
    ]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await (tool.execute as ToolExec)(
      { intent: 'x', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.curatedHits).toBe(1);
    expect((out.items[0] as { id: string }).id).toBe('good');
  });

  it('falls back to recall when curated < topK and personaId is set', async () => {
    listByClientMock.mockResolvedValueOnce([
      { id: 'c1', sql: 'SELECT 1', intent: 'i', tags: null, quality_score: 0.9, status: 'approved', client_id: 'OM' },
    ]);
    recallFallbackMock.mockResolvedValueOnce([
      { id: 'r1', sql: 'SELECT R1', intent: 'i', score: 0.85 },
      { id: 'r2', sql: 'SELECT R2', intent: 'i', score: 0.80 },
    ]);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await (tool.execute as ToolExec)(
      { intent: 'inadimplencia', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.curatedHits).toBe(1);
    expect(out.recallHits).toBe(2);
    expect(out.items).toHaveLength(3);
    expect((out.items[0] as { source: string }).source).toBe('curated');
    expect((out.items[1] as { source: string }).source).toBe('recall');
    // Recall fallback called with topK - curated.length and ctx.clientId
    expect(recallFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'inadimplencia',
      clientId: 'OM',
      personaId: 'originador',
      topK: 4,
    }));
  });

  it('skips recall fallback when curated already fills topK', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, sql: `SELECT ${i}`, intent: 'i', tags: null, quality_score: 0.9, status: 'approved', client_id: 'OM',
    }));
    listByClientMock.mockResolvedValueOnce(rows);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await (tool.execute as ToolExec)(
      { intent: 'x', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.curatedHits).toBe(5);
    expect(out.recallHits).toBe(0);
    expect(recallFallbackMock).not.toHaveBeenCalled();
  });

  it('multi-tenant guard: passes ctx.clientId to repository, ignores model-injected clientId', async () => {
    listByClientMock.mockResolvedValueOnce([]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory({ ...baseCtx, clientId: 'OM' });
    await (tool.execute as ToolExec)(
      { intent: 'x', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(listByClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'OM', status: 'approved' }),
    );
  });

  it('returns empty when both curated and recall empty (does not throw)', async () => {
    listByClientMock.mockResolvedValueOnce([]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await (tool.execute as ToolExec)(
      { intent: 'x', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.items).toEqual([]);
    expect(out.curatedHits).toBe(0);
    expect(out.recallHits).toBe(0);
  });

  it('does not call recall when personaId not in ctx (no fallback target)', async () => {
    listByClientMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory({ ...baseCtx, personaId: undefined });
    const out = await (tool.execute as ToolExec)(
      { intent: 'x', personaId: null, tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    expect(out.recallHits).toBe(0);
    expect(recallFallbackMock).not.toHaveBeenCalled();
    expect(out.items).toEqual([]);
  });

  it('ignora personaId do input — persona é server-bound via ctx (ADR-0006)', async () => {
    listByClientMock.mockResolvedValueOnce([]);
    recallFallbackMock.mockResolvedValueOnce([]);
    const factory = await importTool();
    const tool = factory(baseCtx); // ctx.personaId = 'originador'
    await (tool.execute as ToolExec)(
      { intent: 'x', personaId: 'gestor', tags: null, topK: 5 },
      { toolCallId: 't', messages: [] },
    );
    // O personaId do input ('gestor') NÃO pode sobrescrever o server-bound: usa 'originador'.
    expect(listByClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: 'originador' }),
    );
  });
});

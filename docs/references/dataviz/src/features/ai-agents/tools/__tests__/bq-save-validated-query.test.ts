import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertDraftMock = vi.fn();
const findByHashMock = vi.fn();

vi.mock('@/features/sql-catalog/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/sql-catalog/repository')>();
  return {
    ...actual,
    createRepository: () => ({
      insertDraft: (...a: unknown[]) => insertDraftMock(...a),
      findByHash: (...a: unknown[]) => findByHashMock(...a),
      listByClient: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      incrementUse: vi.fn(),
      markNeedsRevalidation: vi.fn(),
    }),
  };
});

// Mesma porta do execute_sql/dry_run_sql: guarda + dry-run + escopo do cliente.
const dryRunMock = vi.fn();
vi.mock('@/features/ai-agents/lib/tenant-query', () => ({
  checkTenantQuery: (...a: unknown[]) => dryRunMock(...a),
}));
vi.mock('@/features/ai-agents/lib/client-query-scope', () => ({
  lazyClientQueryScope: (args: unknown) => () => Promise.resolve(args),
}));

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: vi.fn() }),
}));

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({ collection: () => ({}) }),
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

type ToolExec = (
  input: Record<string, unknown>,
  options: unknown,
) => Promise<{ saved: boolean; reason?: string; id?: string; existingId?: string; error?: string }>;

async function importTool() {
  const mod = await import('../bq-save-validated-query');
  return mod.createBqSaveValidatedQueryTool as unknown as (ctx: AnyCtx) => {
    execute: ToolExec;
    inputSchema: { safeParse: (i: unknown) => { success: boolean } };
    needsApproval?: unknown;
  };
}

describe('bq.save_validated_query tool', () => {
  beforeEach(() => {
    insertDraftMock.mockReset();
    findByHashMock.mockReset();
    dryRunMock.mockReset();
  });

  it('throws if ctx.clientId missing (ADR-0006)', async () => {
    const factory = await importTool();
    expect(() => factory({ ...baseCtx, clientId: undefined })).toThrow(/clientId/);
  });

  it('schema strict — rejects extra keys and clientId injection', async () => {
    const factory = await importTool();
    const tool = factory(baseCtx);
    const r = tool.inputSchema.safeParse({
      intent: 'x',
      sql: 'SELECT 1',
      tags: null,
      schemaSnapshot: null,
      clientId: 'B', // extra → reject
    });
    expect(r.success).toBe(false);
  });

  it('schema accepts nullable tags and schemaSnapshot', async () => {
    const factory = await importTool();
    const tool = factory(baseCtx);
    const r = tool.inputSchema.safeParse({
      intent: 'x',
      sql: 'SELECT 1',
      tags: null,
      schemaSnapshot: null,
    });
    expect(r.success).toBe(true);
  });

  it('declares needsApproval: true', async () => {
    const factory = await importTool();
    const tool = factory(baseCtx);
    expect(tool.needsApproval).toBe(true);
  });

  it('returns dry_run_failed when pre-validation fails', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: false, code: 'DRY_RUN_FALHOU', error: 'A query não compila no BigQuery (erro de sintaxe em [1:8]).' });
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await tool.execute(
      { intent: 'x', sql: 'SELECT FROM', tags: null, schemaSnapshot: null },
      { toolCallId: 't', messages: [] },
    );
    expect(out.saved).toBe(false);
    expect(out.reason).toBe('dry_run_failed');
    expect(out.error).toMatch(/sintaxe/i);
    expect(insertDraftMock).not.toHaveBeenCalled();
  });

  it('refuses a query outside the client datasets with the stable code and does not save it', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: false, code: 'FORA_DO_TENANT', error: 'A query referencia tabela ou rotina que não existe…' });
    const factory = await importTool();
    const tool = factory(baseCtx);

    const out = await tool.execute(
      { intent: 'x', sql: 'SELECT * FROM outro_tenant.vendas', tags: null, schemaSnapshot: null },
      { toolCallId: 't', messages: [] },
    ) as { saved: boolean; reason?: string; code?: string };

    expect(out).toMatchObject({ saved: false, reason: 'dry_run_failed', code: 'FORA_DO_TENANT' });
    expect(insertDraftMock).not.toHaveBeenCalled();
  });

  it('checks the query against the scope of the client in ctx', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: false, code: 'SQL_RECUSADO', error: 'x' });
    const factory = await importTool();
    const tool = factory({ ...baseCtx, clientId: 'BRZ', dataset: 'brz_monitor' });

    await tool.execute({ intent: 'x', sql: 'SELECT 1', tags: null, schemaSnapshot: null }, { toolCallId: 't', messages: [] });

    const loader = dryRunMock.mock.calls[0]![1] as () => Promise<unknown>;
    await expect(loader()).resolves.toEqual({ clientId: 'BRZ', dataset: 'brz_monitor' });
  });

  it('returns duplicate when canonicalSqlHash already exists for clientId', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: true, sql: 'SELECT 1', bytes: 0, schema: [] });
    findByHashMock.mockResolvedValueOnce({ id: 'existing-1' });
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await tool.execute(
      { intent: 'x', sql: 'SELECT 1', tags: null, schemaSnapshot: null },
      { toolCallId: 't', messages: [] },
    );
    expect(out.saved).toBe(false);
    expect(out.reason).toBe('duplicate');
    expect(out.existingId).toBe('existing-1');
    expect(insertDraftMock).not.toHaveBeenCalled();
    // findByHash MUST be scoped by ctx.clientId (multi-tenant)
    expect(findByHashMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'OM' }),
    );
  });

  it('happy path: dry_run ok + no duplicate → insertDraft, saved:true', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: true, sql: 'SELECT 1', bytes: 0, schema: [] });
    findByHashMock.mockResolvedValueOnce(null);
    insertDraftMock.mockResolvedValueOnce({ id: 'new-uuid', sqlHash: 'h1' });
    const factory = await importTool();
    const tool = factory(baseCtx);
    const out = await tool.execute(
      { intent: 'safra OM', sql: 'SELECT id FROM contratos', tags: ['kpi'], schemaSnapshot: { tables: [] } },
      { toolCallId: 't', messages: [] },
    );
    expect(out.saved).toBe(true);
    expect(out.id).toBe('new-uuid');
    // clientId/personaId server-bound from ctx
    expect(insertDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'OM',
        personaId: 'originador',
        intent: 'safra OM',
        sql: 'SELECT id FROM contratos',
        tags: ['kpi'],
      }),
    );
  });

  it('multi-tenant: clientId in row comes ONLY from ctx.clientId', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: true, sql: 'SELECT 1', bytes: 0, schema: [] });
    findByHashMock.mockResolvedValueOnce(null);
    insertDraftMock.mockResolvedValueOnce({ id: 'x', sqlHash: 'h' });
    const factory = await importTool();
    const tool = factory({ ...baseCtx, clientId: 'BRZ' });
    await tool.execute(
      { intent: 'x', sql: 'SELECT 1', tags: null, schemaSnapshot: null },
      { toolCallId: 't', messages: [] },
    );
    expect(insertDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'BRZ' }),
    );
  });
});

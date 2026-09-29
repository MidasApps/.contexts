import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const tableMock = vi.fn(() => ({ insert: insertMock }));
const datasetMock = vi.fn(() => ({ table: tableMock }));

vi.mock('./client', () => ({
  getBigQueryClient: () => ({ dataset: datasetMock }),
}));

describe('logSqlGeneration', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue([{}]);
    process.env.SQL_GENERATIONS_LOGGING = 'true';
    process.env.BIGQUERY_PROJECT_ID = 'p1';
  });

  it('inserts a row with id, ts and provided fields', async () => {
    const { logSqlGeneration } = await import('./sql-generation-logger');
    await logSqlGeneration({
      intent: 'top 10 contracts',
      finalSql: 'SELECT 1',
      success: true,
      rows: 10,
      latencyMs: 42,
      clientId: 'OM',
      agentId: 'canvas-orchestrator',
      sessionId: 's1',
    });
    expect(insertMock).toHaveBeenCalledOnce();
    const rows = insertMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(typeof row.id).toBe('string');
    expect(row.ts).toBeInstanceOf(Date);
    expect(row.intent).toBe('top 10 contracts');
    expect(row.final_sql).toBe('SELECT 1');
    expect(row.success).toBe(true);
    expect(row.client_id).toBe('OM');
  });

  it('does not throw when insert rejects', async () => {
    insertMock.mockRejectedValueOnce(new Error('BQ down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logSqlGeneration } = await import('./sql-generation-logger');
    await expect(
      logSqlGeneration({ finalSql: 'x', success: false, error: 'boom' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('no-ops when SQL_GENERATIONS_LOGGING != true', async () => {
    process.env.SQL_GENERATIONS_LOGGING = 'false';
    const { logSqlGeneration } = await import('./sql-generation-logger');
    await logSqlGeneration({ finalSql: 'x', success: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('normalizes undefined to null in row', async () => {
    const { logSqlGeneration } = await import('./sql-generation-logger');
    await logSqlGeneration({ finalSql: 'SELECT 1', success: true });
    const rows = insertMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const row = rows[0]!;
    expect(row.intent).toBeNull();
    expect(row.persona_id).toBeNull();
    expect(row.client_id).toBeNull();
  });

  it('truncates very long SQL fields', async () => {
    const { logSqlGeneration } = await import('./sql-generation-logger');
    const big = 'x'.repeat(60_000);
    await logSqlGeneration({ finalSql: big, sqlDraft: big, success: true });
    const rows = insertMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const row = rows[0]!;
    expect((row.final_sql as string).length).toBe(50_000);
    expect((row.sql_draft as string).length).toBe(50_000);
  });
});

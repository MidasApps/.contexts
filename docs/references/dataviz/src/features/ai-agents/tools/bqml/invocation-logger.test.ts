import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insertMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    dataset: () => ({ table: () => ({ insert: insertMock }) }),
  }),
}));

describe('logBqmlInvocation', () => {
  beforeEach(() => {
    insertMock.mockReset();
    process.env.BQML_INVOCATIONS_LOGGING = 'true';
    process.env.BIGQUERY_PROJECT_ID = 'liquid-test';
  });

  afterEach(() => {
    delete process.env.BQML_INVOCATIONS_LOGGING;
    delete process.env.BIGQUERY_PROJECT_ID;
  });

  it('inserts row with expected shape', async () => {
    insertMock.mockResolvedValueOnce(undefined);
    const { logBqmlInvocation } = await import('./invocation-logger');
    await logBqmlInvocation({
      clientId: 'OM',
      sessionId: 's1',
      agentId: 'a1',
      toolName: 'bqml.forecast',
      modelRef: 'dataviz_bqml_om.bqml_x',
      cacheHit: true,
      durationMs: 42,
      success: true,
    });
    expect(insertMock).toHaveBeenCalledOnce();
    const row = insertMock.mock.calls[0]![0][0];
    expect(row.client_id).toBe('om');
    expect(row.tool_name).toBe('bqml.forecast');
    expect(row.cache_hit).toBe(true);
    expect(row.success).toBe(true);
    expect(row.duration_ms).toBe(42);
    expect(row.id).toBeTruthy();
  });

  it('no-op when flag off', async () => {
    process.env.BQML_INVOCATIONS_LOGGING = 'false';
    const { logBqmlInvocation } = await import('./invocation-logger');
    await logBqmlInvocation({ toolName: 'bqml.forecast' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('does not throw when insert fails', async () => {
    insertMock.mockRejectedValueOnce(new Error('bq down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logBqmlInvocation } = await import('./invocation-logger');
    await expect(
      logBqmlInvocation({ toolName: 'bqml.forecast' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

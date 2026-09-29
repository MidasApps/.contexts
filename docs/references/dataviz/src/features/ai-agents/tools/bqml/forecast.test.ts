import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: queryMock }),
}));
const logMock = vi.fn();
vi.mock('./invocation-logger', () => ({
  logBqmlInvocation: (...a: unknown[]) => logMock(...a),
}));

describe('createBqmlForecastTool', () => {
  beforeEach(() => {
    queryMock.mockReset();
    logMock.mockReset();
  });

  it('runs ML.FORECAST and returns rows', async () => {
    queryMock.mockResolvedValueOnce([[{ forecast_value: 1 }, { forecast_value: 2 }]]);
    const { createBqmlForecastTool } = await import('./forecast');
    const tool = createBqmlForecastTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    const out = await tool.execute!(
      { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', horizon: 12, confidenceLevel: 0.9 },
      { toolCallId: 't', messages: [] } as never,
    );
    expect(queryMock.mock.calls[0]![0].query).toContain('ML.FORECAST');
    expect((out as { rowCount: number }).rowCount).toBe(2);
    expect(logMock).toHaveBeenCalled();
  });

  it('blocks cross-tenant model access', async () => {
    const { createBqmlForecastTool } = await import('./forecast');
    const tool = createBqmlForecastTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    await expect(
      tool.execute!(
        { modelRef: 'dataviz_bqml_outro_tenant.bqml_x', horizon: 12, confidenceLevel: 0.9 },
        { toolCallId: 't', messages: [] } as never,
      ),
    ).rejects.toThrow(/Cross-tenant/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('logs error and rethrows on query failure', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));
    const { createBqmlForecastTool } = await import('./forecast');
    const tool = createBqmlForecastTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    await expect(
      tool.execute!(
        { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', horizon: 12, confidenceLevel: 0.9 },
        { toolCallId: 't', messages: [] } as never,
      ),
    ).rejects.toThrow(/boom/);
    expect(logMock).toHaveBeenCalled();
    expect(logMock.mock.calls[0]![0].success).toBe(false);
  });
});

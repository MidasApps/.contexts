import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({ query: queryMock }),
}));
const logMock = vi.fn();
vi.mock('./invocation-logger', () => ({
  logBqmlInvocation: (...a: unknown[]) => logMock(...a),
}));

describe('createBqmlDetectAnomaliesTool', () => {
  beforeEach(() => {
    queryMock.mockReset();
    logMock.mockReset();
  });

  it('runs ML.DETECT_ANOMALIES with default threshold', async () => {
    queryMock.mockResolvedValueOnce([[{ is_anomaly: true }]]);
    const { createBqmlDetectAnomaliesTool } = await import('./detect-anomalies');
    const tool = createBqmlDetectAnomaliesTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    const out = await tool.execute!(
      { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', anomalyProbThreshold: 0.95 },
      { toolCallId: 't', messages: [] } as never,
    );
    const sql = queryMock.mock.calls[0]![0].query as string;
    expect(sql).toContain('ML.DETECT_ANOMALIES');
    expect(sql).toContain('0.95');
    expect((out as { rowCount: number }).rowCount).toBe(1);
  });

  it('blocks cross-tenant model access', async () => {
    const { createBqmlDetectAnomaliesTool } = await import('./detect-anomalies');
    const tool = createBqmlDetectAnomaliesTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    await expect(
      tool.execute!(
        { modelRef: 'dataviz_bqml_outro_tenant.bqml_x', anomalyProbThreshold: 0.9 },
        { toolCallId: 't', messages: [] } as never,
      ),
    ).rejects.toThrow(/Cross-tenant/);
  });

  it('passes custom threshold into SQL', async () => {
    queryMock.mockResolvedValueOnce([[]]);
    const { createBqmlDetectAnomaliesTool } = await import('./detect-anomalies');
    const tool = createBqmlDetectAnomaliesTool({ clientId: 'vila-rosa', sessionId: 's', agentId: 'a' });
    await tool.execute!(
      { modelRef: 'dataviz_bqml_vila_rosa.bqml_x', anomalyProbThreshold: 0.8 },
      { toolCallId: 't', messages: [] } as never,
    );
    const sql = queryMock.mock.calls[0]![0].query as string;
    expect(sql).toContain('0.8');
  });
});

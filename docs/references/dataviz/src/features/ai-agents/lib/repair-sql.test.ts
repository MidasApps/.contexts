import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateObjectMock = vi.fn();
vi.mock('ai', async (orig) => {
  const mod = await orig<typeof import('ai')>();
  return { ...mod, generateObject: generateObjectMock };
});
vi.mock('@/features/ai-agents/model-registry', () => ({
  getModel: () => ({}),
}));
const logMock = vi.fn();
vi.mock('@/shared/lib/bigquery/sql-generation-logger', () => ({
  logSqlGeneration: (...a: unknown[]) => logMock(...a),
}));

describe('repairSqlToolCall', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    logMock.mockReset();
  });

  it('repairs invalid SQL via generateObject', async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { sql: 'SELECT 1' } });
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const out = await repairSqlToolCall({
      toolCall: { toolName: 'query_data', input: { sql: 'SELECT FRO m', description: 'x' } } as never,
      error: new Error('Syntax error: Expected end of input'),
      messages: [],
      sessionId: 'sess1',
      agentId: 'canvas-orchestrator',
    });
    expect(out).not.toBeNull();
    expect((out as unknown as { input: { sql: string } }).input.sql).toBe('SELECT 1');
    expect(logMock).toHaveBeenCalledOnce();
    expect(logMock.mock.calls[0]![0]).toMatchObject({
      sqlDraft: 'SELECT FRO m',
      dryRunValid: false,
      finalSql: 'SELECT 1',
      repairAttempts: 1,
      sessionId: 'sess1',
    });
  });

  it('returns null for non-SQL tools', async () => {
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const out = await repairSqlToolCall({
      toolCall: { toolName: 'add_kpi_block', input: {} } as never,
      error: new Error('boom'),
      messages: [],
      sessionId: 's1',
      agentId: 'canvas-orchestrator',
    });
    expect(out).toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('caps retries at 2 per session', async () => {
    generateObjectMock.mockResolvedValue({ object: { sql: 'SELECT 1' } });
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const args = {
      toolCall: { toolName: 'query_data', input: { sql: 'BAD', description: 'd' } } as never,
      error: new Error('Syntax'),
      messages: [],
      sessionId: 'sess-cap',
      agentId: 'canvas-orchestrator',
    };
    const r1 = await repairSqlToolCall(args);
    const r2 = await repairSqlToolCall(args);
    const r3 = await repairSqlToolCall(args);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).toBeNull();
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['bqml.forecast'],
    ['bqml.predict'],
    ['bqml.detect_anomalies'],
  ])('repairs %s tool calls', async (toolName) => {
    generateObjectMock.mockResolvedValueOnce({ object: { sql: 'SELECT 1' } });
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const out = await repairSqlToolCall({
      toolCall: { toolName, input: { sql: 'BAD', modelRef: 'dataviz_bqml_om.bqml_x' } } as never,
      error: new Error('Syntax'),
      messages: [],
      sessionId: `sess-${toolName}`,
      agentId: 'canvas-orchestrator',
    });
    expect(out).not.toBeNull();
    expect((out as { toolName: string }).toolName).toBe(toolName);
  });

  it('does not repair bqml.create_or_use_model (DDL too costly)', async () => {
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const out = await repairSqlToolCall({
      toolCall: { toolName: 'bqml.create_or_use_model', input: {} } as never,
      error: new Error('boom'),
      messages: [],
      sessionId: 'sess-ddl',
      agentId: 'canvas-orchestrator',
    });
    expect(out).toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('returns null when generateObject throws', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('LLM down'));
    const { repairSqlToolCall, __resetRepairBudget } = await import('./repair-sql');
    __resetRepairBudget();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await repairSqlToolCall({
      toolCall: { toolName: 'query_data', input: { sql: 'BAD', description: 'd' } } as never,
      error: new Error('Syntax'),
      messages: [],
      sessionId: 's2',
      agentId: 'canvas-orchestrator',
    });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

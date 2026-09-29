import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordMemoryMetric } from './metrics';

describe('recordMemoryMetric', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('emits a single JSON line with required fields', () => {
    recordMemoryMetric({
      event: 'setWorkingMemory',
      durationMs: 12,
      threadId: 't-1',
    });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      component: 'memory-service',
      event: 'setWorkingMemory',
      durationMs: 12,
      threadId: 't-1',
    });
    expect(typeof parsed.timestamp).toBe('string');
  });
});

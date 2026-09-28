import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordRagMetric } from './metrics';

describe('recordRagMetric', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    spy?.mockRestore();
  });

  it('emits structured JSON with required fields', () => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordRagMetric({ event: 'embed.batch', durationMs: 120, count: 20 });
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      severity: 'INFO',
      component: 'rag',
      event: 'embed.batch',
      durationMs: 120,
      count: 20,
    });
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('forwards arbitrary attributes', () => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordRagMetric({ event: 'query.done', clientId: 'OM', hits: 5 });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.clientId).toBe('OM');
    expect(parsed.hits).toBe(5);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordRecallMetric, estimateTokensSaved } from './recall-metrics';

describe('estimateTokensSaved', () => {
  it('returns sqlLength/4 + 200 when reused', () => {
    expect(estimateTokensSaved({ reused: true, sqlLength: 400 })).toBe(300);
  });

  it('returns 0 when not reused', () => {
    expect(estimateTokensSaved({ reused: false, sqlLength: 400 })).toBe(0);
  });

  it('returns positive when reused', () => {
    expect(estimateTokensSaved({ reused: true, sqlLength: 400 })).toBeGreaterThan(0);
  });
});

describe('recordRecallMetric', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('emits structured log with kind+hit+score', () => {
    recordRecallMetric({ kind: 'sql', clientId: 'OM', hit: true, topScore: 0.91, topK: 5 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      severity: 'INFO',
      component: 'recall',
      kind: 'sql',
      clientId: 'OM',
      hit: true,
      topScore: 0.91,
      topK: 5,
    });
    expect(typeof line.timestamp).toBe('string');
  });

  it('handles miss (hit=false, topScore=null)', () => {
    recordRecallMetric({ kind: 'block', clientId: 'BRZ', hit: false, topScore: null, topK: 3 });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ kind: 'block', hit: false, topScore: null, topK: 3 });
  });
});

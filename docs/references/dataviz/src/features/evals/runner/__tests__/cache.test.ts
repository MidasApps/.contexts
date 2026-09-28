import { describe, expect, it, beforeEach } from 'vitest';
import { cacheKey, getCached, setCached, clearCache, cacheSize } from '../cache';

describe('runner/cache', () => {
  beforeEach(() => clearCache());

  it('cacheKey is deterministic for same input', () => {
    const a = cacheKey({
      briefingId: 'smoke-001',
      scorerName: 'sql_correctness',
      judgeModelVersion: 'gemini-2.5-pro',
      glossaryVersion: 'v1',
      regulatoryPackVersion: 'v1',
    });
    const b = cacheKey({
      briefingId: 'smoke-001',
      scorerName: 'sql_correctness',
      judgeModelVersion: 'gemini-2.5-pro',
      glossaryVersion: 'v1',
      regulatoryPackVersion: 'v1',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });

  it('cacheKey differs when any input changes', () => {
    const base = {
      briefingId: 'smoke-001',
      scorerName: 'sql_correctness',
      judgeModelVersion: 'gemini-2.5-pro',
      glossaryVersion: 'v1',
      regulatoryPackVersion: 'v1',
    };
    const k0 = cacheKey(base);
    expect(cacheKey({ ...base, briefingId: 'smoke-002' })).not.toBe(k0);
    expect(cacheKey({ ...base, scorerName: 'persona_fit' })).not.toBe(k0);
    expect(cacheKey({ ...base, judgeModelVersion: 'gemini-1.5' })).not.toBe(k0);
    expect(cacheKey({ ...base, glossaryVersion: 'v2' })).not.toBe(k0);
    expect(cacheKey({ ...base, regulatoryPackVersion: 'v2' })).not.toBe(k0);
  });

  it('LRU hit/miss: setCached -> getCached returns same value, miss returns undefined', () => {
    const key = cacheKey({
      briefingId: 'b',
      scorerName: 's',
      judgeModelVersion: 'm',
      glossaryVersion: 'g',
      regulatoryPackVersion: 'r',
    });
    expect(getCached(key)).toBeUndefined();
    setCached(key, { score: 0.7, rationale: 'ok' });
    expect(getCached(key)).toEqual({ score: 0.7, rationale: 'ok' });
    expect(cacheSize()).toBeGreaterThanOrEqual(1);
    clearCache();
    expect(getCached(key)).toBeUndefined();
  });
});

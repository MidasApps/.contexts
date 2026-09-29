import { describe, it, expect, beforeEach } from 'vitest';
import { hashKey, getCached, setCached, clearCache, getCacheSize } from './cache';
import type { BusinessContext } from './types';

const sampleCtx: BusinessContext = {
  static: {},
  retrieved: [],
  macro: {},
  template: null,
  glossaryVersion: '2026-05-04',
  retrievalMeta: { latencyMs: 0, cacheHit: false, source: 'rag' },
};

describe('hashKey', () => {
  it('is stable for same triple regardless of briefing whitespace', () => {
    const a = hashKey({ clientId: 'OM', personaId: 'cfo', briefing: '  Foo  ' });
    const b = hashKey({ clientId: 'OM', personaId: 'cfo', briefing: 'foo' });
    expect(a).toBe(b);
  });

  it('differs when triple differs', () => {
    const a = hashKey({ clientId: 'OM', personaId: 'cfo', briefing: 'a' });
    const b = hashKey({ clientId: 'BRZ', personaId: 'cfo', briefing: 'a' });
    expect(a).not.toBe(b);
  });
});

describe('cache CRUD', () => {
  beforeEach(() => clearCache());

  it('get returns undefined initially', () => {
    expect(getCached('missing')).toBeUndefined();
  });

  it('set+get round-trip', () => {
    setCached('k1', sampleCtx);
    expect(getCached('k1')).toEqual(sampleCtx);
  });

  it('clear empties the cache', () => {
    setCached('k1', sampleCtx);
    expect(getCacheSize()).toBe(1);
    clearCache();
    expect(getCacheSize()).toBe(0);
  });
});

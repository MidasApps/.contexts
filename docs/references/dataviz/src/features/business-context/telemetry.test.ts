import { describe, it, expect, beforeEach } from 'vitest';
import { recordTelemetry, getMetricsSnapshot, __resetTelemetry } from './telemetry';

describe('telemetry', () => {
  beforeEach(() => __resetTelemetry());

  it('aggregates rolling p50/p95', () => {
    for (let i = 0; i < 10; i++) {
      recordTelemetry({
        clientId: 'OM',
        personaId: 'cfo-securitizadora',
        latencyMs: 100 + i * 10,
        cacheHit: false,
        source: 'rag',
        k: 5,
        ok: true,
      });
    }
    const snap = getMetricsSnapshot();
    expect(snap.total).toBe(10);
    expect(snap.p50Ms).toBeGreaterThan(0);
    expect(snap.p95Ms).toBeGreaterThanOrEqual(snap.p50Ms);
  });

  it('computes cache hit rate', () => {
    for (let i = 0; i < 10; i++) {
      recordTelemetry({
        clientId: 'OM',
        personaId: 'x',
        latencyMs: 50,
        cacheHit: i < 4,
        source: 'rag',
        k: 5,
        ok: true,
      });
    }
    const snap = getMetricsSnapshot();
    expect(snap.cacheHitRate).toBeCloseTo(0.4);
  });

  it('computes error rate', () => {
    for (let i = 0; i < 5; i++) {
      recordTelemetry({
        clientId: 'OM',
        personaId: 'x',
        latencyMs: 50,
        cacheHit: false,
        source: 'fallback',
        k: 0,
        ok: i > 1,
      });
    }
    const snap = getMetricsSnapshot();
    expect(snap.errorRate).toBeCloseTo(0.4);
  });

  it('aggregates bySource', () => {
    recordTelemetry({ clientId: 'OM', personaId: 'x', latencyMs: 50, cacheHit: false, source: 'rag', k: 5, ok: true });
    recordTelemetry({ clientId: 'OM', personaId: 'x', latencyMs: 50, cacheHit: false, source: 'fallback', k: 0, ok: true });
    recordTelemetry({ clientId: 'OM', personaId: 'x', latencyMs: 50, cacheHit: false, source: 'partial', k: 3, ok: true });
    const snap = getMetricsSnapshot();
    expect(snap.bySource.rag).toBe(1);
    expect(snap.bySource.fallback).toBe(1);
    expect(snap.bySource.partial).toBe(1);
  });
});

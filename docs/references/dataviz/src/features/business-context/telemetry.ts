import { recordSpan } from '@/shared/lib/telemetry/record-span';

export interface RetrievalMetric {
  clientId: string;
  personaId: string;
  latencyMs: number;
  cacheHit: boolean;
  source: 'rag' | 'fallback' | 'partial';
  k: number;
  ok: boolean;
}

const ROLLING_WINDOW_MS = 60 * 60 * 1000;
const buffer: Array<RetrievalMetric & { timestamp: number }> = [];

function pruneOld(): void {
  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  while (buffer.length > 0 && buffer[0]!.timestamp < cutoff) buffer.shift();
}

export function recordTelemetry(m: RetrievalMetric): void {
  buffer.push({ ...m, timestamp: Date.now() });
  pruneOld();
  void recordSpan(
    {
      name: 'business-context.retrieve',
      attributes: { ...m },
    },
    () => undefined,
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx]!;
}

export interface MetricsSnapshot {
  total: number;
  cacheHitRate: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  bySource: Record<string, number>;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  pruneOld();
  if (buffer.length === 0) {
    return { total: 0, cacheHitRate: 0, errorRate: 0, p50Ms: 0, p95Ms: 0, bySource: {} };
  }
  const latencies = buffer.map((m) => m.latencyMs);
  const cacheHits = buffer.filter((m) => m.cacheHit).length;
  const errors = buffer.filter((m) => !m.ok).length;
  const bySource: Record<string, number> = {};
  for (const m of buffer) {
    bySource[m.source] = (bySource[m.source] ?? 0) + 1;
  }
  return {
    total: buffer.length,
    cacheHitRate: cacheHits / buffer.length,
    errorRate: errors / buffer.length,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    bySource,
  };
}

export function __resetTelemetry(): void {
  buffer.length = 0;
}

/**
 * Structured RAG telemetry (Sprint 2.A Task 12).
 * Cloud Logging-friendly one-JSON-per-line. component='rag'.
 */
export interface RagMetric {
  event: string;
  durationMs?: number;
  count?: number;
  sourcePath?: string;
  ok?: boolean;
  error?: string;
  [k: string]: unknown;
}

export function recordRagMetric(m: RagMetric): void {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      component: 'rag',
      timestamp: new Date().toISOString(),
      ...m,
    }),
  );
}

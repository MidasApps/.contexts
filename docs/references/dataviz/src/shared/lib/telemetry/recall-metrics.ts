/**
 * Telemetria de recall semântico (Sprint 3.A Task 14).
 * Emite logs estruturados (Cloud Logging-friendly) que podem ser agregados
 * em métricas `recall_hit_rate` por kind/clientId e `tokens_saved`.
 */

export interface RecallMetric {
  kind: 'sql' | 'block';
  clientId: string;
  hit: boolean;
  topScore: number | null;
  topK: number;
}

/** @deprecated use {@link RecallMetric}. Mantido para compatibilidade. */
// RecallMetricInput era alias de RecallMetric sem nenhum consumidor.

export function recordRecallMetric(m: RecallMetric): void {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      component: 'recall',
      timestamp: new Date().toISOString(),
      ...m,
    }),
  );
}

export function estimateTokensSaved(opts: { reused: boolean; sqlLength: number }): number {
  if (!opts.reused) return 0;
  // Heurística coarse: ~4 chars por token; +200 ~= prompt de geração + raciocínio economizado.
  return Math.round(opts.sqlLength / 4) + 200;
}

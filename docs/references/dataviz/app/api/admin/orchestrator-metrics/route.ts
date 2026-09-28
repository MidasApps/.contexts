import { verifyAuthToken } from '@/shared/lib/api-auth';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import type { OrchestratorPhase, SubAgentName } from '@/features/ai-agents/phases/types';

export const runtime = 'nodejs';

export interface PhaseLatencyRow {
  phase: OrchestratorPhase;
  agent: SubAgentName | 'orchestrator';
  count: number;
  p50Ms: number;
  p95Ms: number;
}

export interface SubAgentMetricsRow {
  agent: SubAgentName;
  invocations: number;
  errorRate: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface RetryRatePoint {
  ts: string;
  retryRate: number;
}

export interface OrchestratorMetricsResponse {
  phases: PhaseLatencyRow[];
  subAgents: SubAgentMetricsRow[];
  retryRate: RetryRatePoint[];
  cacheHitRate: number;
  /** Indicates the metrics layer is a stub returning empty data. */
  experimental: true;
  generatedAt: string;
}

/**
 * Sprint 3.B Task 12 — admin metrics endpoint.
 *
 * Currently returns an empty-shaped response. Spans are emitted via
 * `recordSpan` to stdout (Cloud Logging). Once a persistence layer
 * (BigQuery/Cloud Logging-derived table) is wired in, this handler
 * should aggregate from there using the SubAgentSpanMeta attributes.
 */
export async function GET(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return new Response(JSON.stringify({ error: 'Acesso restrito' }), { status: 403 });
  }

  const body: OrchestratorMetricsResponse = {
    phases: [],
    subAgents: [],
    retryRate: [],
    cacheHitRate: 0,
    experimental: true,
    generatedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

import { getBigQueryClient } from '@/shared/lib/bigquery/client';

export interface BqmlInvocationLogEntry {
  clientId?: string;
  sessionId?: string;
  agentId?: string;
  toolName: string;
  intent?: string;
  hash?: string;
  modelRef?: string;
  cacheHit?: boolean;
  bytesEstimated?: number;
  bytesProcessed?: number;
  costUsd?: number;
  durationMs?: number;
  success?: boolean;
  error?: string;
  approvedByUser?: boolean;
}

function nullable<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

export async function logBqmlInvocation(entry: BqmlInvocationLogEntry): Promise<void> {
  if (process.env.BQML_INVOCATIONS_LOGGING !== 'true') return;
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  if (!projectId) {
    console.warn('[bqml-invocation-logger] BIGQUERY_PROJECT_ID not set — skipping');
    return;
  }
  const row = {
    id: crypto.randomUUID(),
    ts: new Date(),
    client_id: nullable(entry.clientId?.toLowerCase()),
    session_id: nullable(entry.sessionId),
    agent_id: nullable(entry.agentId),
    tool_name: entry.toolName,
    intent: nullable(entry.intent),
    hash: nullable(entry.hash),
    model_ref: nullable(entry.modelRef),
    cache_hit: nullable(entry.cacheHit),
    bytes_estimated: nullable(entry.bytesEstimated),
    bytes_processed: nullable(entry.bytesProcessed),
    cost_usd: nullable(entry.costUsd),
    duration_ms: nullable(entry.durationMs),
    success: nullable(entry.success),
    error: nullable(entry.error),
    approved_by_user: nullable(entry.approvedByUser),
  };
  try {
    await getBigQueryClient()
      .dataset('dataviz_meta', { projectId })
      .table('bqml_invocations')
      .insert([row]);
  } catch (err) {
    console.warn(
      '[bqml-invocation-logger]',
      err instanceof Error ? err.message : String(err),
    );
  }
}

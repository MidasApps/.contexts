import { getBigQueryClient } from './client';

export interface SqlGenerationLogEntry {
  intent?: string;
  sqlDraft?: string;
  dryRunValid?: boolean;
  dryRunError?: string;
  dryRunBytes?: number;
  repairAttempts?: number;
  finalSql?: string;
  rows?: number;
  latencyMs?: number;
  bytesBilled?: number;
  success?: boolean;
  error?: string;
  personaId?: string;
  clientId?: string;
  sessionId?: string;
  agentId?: string;
}

const MAX_SQL_LEN = 50_000;

function nullable<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

function truncate(s: string | undefined): string | null {
  if (s === undefined) return null;
  return s.length > MAX_SQL_LEN ? s.slice(0, MAX_SQL_LEN) : s;
}

export async function logSqlGeneration(entry: SqlGenerationLogEntry): Promise<void> {
  if (process.env.SQL_GENERATIONS_LOGGING !== 'true') return;
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  if (!projectId) {
    console.warn('[sql-gen-logger] BIGQUERY_PROJECT_ID not set — skipping');
    return;
  }

  const row = {
    id: crypto.randomUUID(),
    ts: new Date(),
    intent: nullable(entry.intent),
    sql_draft: truncate(entry.sqlDraft),
    dry_run_valid: nullable(entry.dryRunValid),
    dry_run_error: nullable(entry.dryRunError),
    dry_run_bytes: nullable(entry.dryRunBytes),
    repair_attempts: nullable(entry.repairAttempts),
    final_sql: truncate(entry.finalSql),
    rows: nullable(entry.rows),
    latency_ms: nullable(entry.latencyMs),
    bytes_billed: nullable(entry.bytesBilled),
    success: nullable(entry.success),
    error: nullable(entry.error),
    persona_id: nullable(entry.personaId),
    client_id: nullable(entry.clientId),
    session_id: nullable(entry.sessionId),
    agent_id: nullable(entry.agentId),
  };

  try {
    const client = getBigQueryClient();
    await client.dataset('dataviz_meta', { projectId }).table('sql_generations').insert([row]);
  } catch (err) {
    console.warn('[sql-gen-logger]', err instanceof Error ? err.message : String(err));
  }
}

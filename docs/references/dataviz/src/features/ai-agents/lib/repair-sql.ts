import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import { logSqlGeneration } from '@/shared/lib/bigquery/sql-generation-logger';

const REPAIRABLE_TOOLS = new Set([
  'query_data',
  'execute_sql',
  'dry_run_sql',
  'bqml.forecast',
  'bqml.predict',
  'bqml.detect_anomalies',
]);
const MAX_RETRIES_PER_SESSION = 2;
const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionBudget {
  count: number;
  expiresAt: number;
}

const budgets = new Map<string, SessionBudget>();

function checkAndIncrement(sessionId: string): boolean {
  const now = Date.now();
  // Cleanup stale entries opportunistically
  for (const [k, v] of budgets.entries()) {
    if (v.expiresAt < now) budgets.delete(k);
  }
  const current = budgets.get(sessionId);
  if (current && current.expiresAt > now) {
    if (current.count >= MAX_RETRIES_PER_SESSION) return false;
    current.count += 1;
    return true;
  }
  budgets.set(sessionId, { count: 1, expiresAt: now + SESSION_TTL_MS });
  return true;
}

interface RepairArgs {
  toolCall: { toolName: string; input: Record<string, unknown> };
  error: unknown;
  messages: unknown[];
  sessionId: string;
  agentId: string;
}

function extractSchemaContext(messages: unknown[]): string {
  const lines: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as
      | { role?: string; parts?: Array<{ type?: string; toolName?: string; output?: unknown }> }
      | undefined;
    if (!m || !m.parts) continue;
    for (const p of m.parts) {
      if (
        p.type === 'tool-result' &&
        (p.toolName === 'get_table_schema' || p.toolName === 'get_table_schema_v2')
      ) {
        try {
          const out = p.output as {
            table?: string;
            columns?: Array<{ name: string; type: string }>;
            fields?: Array<{ name: string; type: string }>;
          };
          const cols = out.columns ?? out.fields ?? [];
          if (cols.length > 0) {
            const summary = cols
              .slice(0, 30)
              .map((c) => `${c.name}:${c.type}`)
              .join(', ');
            lines.push(`Tabela ${out.table ?? '?'}: ${summary}`);
          }
        } catch {
          // skip
        }
      }
    }
    if (lines.length >= 3) break;
  }
  return lines.length > 0 ? lines.join('\n') : '(sem schema disponível no histórico)';
}

export async function repairSqlToolCall(
  args: RepairArgs,
): Promise<{ toolName: string; input: Record<string, unknown> } | null> {
  const { toolCall, error, messages, sessionId, agentId } = args;
  if (!REPAIRABLE_TOOLS.has(toolCall.toolName)) return null;
  if (!checkAndIncrement(sessionId)) return null;

  const originalSql = (toolCall.input as { sql?: string }).sql ?? '';
  const errorMsg = error instanceof Error ? error.message : String(error);
  const schemaCtx = extractSchemaContext(messages);

  const prompt = [
    `O modelo gerou um SQL inválido para a tool ${toolCall.toolName}.`,
    `Erro do BigQuery: ${errorMsg}`,
    'SQL original:',
    originalSql,
    'Schema disponível no histórico:',
    schemaCtx,
    'Retorne apenas o SQL corrigido. Não inclua explicações.',
  ].join('\n');

  try {
    const result = await generateObject({
      model: getModel('fast'),
      schema: z.object({ sql: z.string() }),
      prompt,
      temperature: 0,
    });
    const repairedSql = result.object.sql;
    const currentCount = budgets.get(sessionId)?.count ?? 1;

    // Fire-and-forget logger
    Promise.resolve(
      logSqlGeneration({
        sqlDraft: originalSql,
        dryRunValid: false,
        dryRunError: errorMsg,
        finalSql: repairedSql,
        repairAttempts: currentCount,
        sessionId,
        agentId,
      }),
    ).catch(() => {});

    return {
      toolName: toolCall.toolName,
      input: { ...toolCall.input, sql: repairedSql },
    };
  } catch (err) {
    console.warn(
      '[repair-sql] generateObject failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** Test-only: reset session budget. */
export function __resetRepairBudget(): void {
  budgets.clear();
}

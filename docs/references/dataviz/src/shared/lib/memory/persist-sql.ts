import { embedMany } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { upsertSqlEmbedding } from './recall-store';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';

export interface PersistSqlInput {
  clientId: string;
  personaId: string;
  intent: string;
  sql: string;
  schemaSnapshot: Record<string, unknown>;
  rowCount: number;
  latencyMs: number;
  glossaryVersion?: string;
  regulatoryPackVersion?: string;
  error?: string;
}

/**
 * Persiste SQL gerado para recall semântico futuro.
 * Multi-tenancy fail-closed (ADR-0006): rejeita ausência de clientId/personaId.
 * Skip em error/rowCount<=0 e em qualquer falha (best-effort, não bloqueia agente).
 */
export async function persistSqlGeneration(input: PersistSqlInput): Promise<void> {
  if (input.error || input.rowCount <= 0) return;
  // ADR-0006: clientId/personaId server-bound — fail-closed.
  if (!input.clientId || !input.personaId) return;
  try {
    const sqlScrubbed = scrubPii(input.sql);
    const intentScrubbed = scrubPii(input.intent);
    const content = `${intentScrubbed}\n-- ${sqlScrubbed}`;
    const { embeddings } = await embedMany({
      model: vertex.textEmbeddingModel('gemini-embedding-001'),
      values: [content],
    });
    await upsertSqlEmbedding({
      embedding: embeddings[0],
      clientId: input.clientId,
      personaId: input.personaId,
      intent: intentScrubbed,
      sqlText: sqlScrubbed,
      schemaSnapshot: input.schemaSnapshot,
      rowCount: input.rowCount,
      latencyMs: input.latencyMs,
      glossaryVersion: input.glossaryVersion ?? null,
      regulatoryPackVersion: input.regulatoryPackVersion ?? null,
    });
  } catch {
    // Best-effort: persistência de recall nunca bloqueia o agente.
  }
}

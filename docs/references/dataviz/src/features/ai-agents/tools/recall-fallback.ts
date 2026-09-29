/**
 * Helper: recall semântico de SQLs validados (Sprint 3.A) extraído como
 * função pura para reuso fora do contexto AI SDK tool — usado pelo tool
 * `bq.list_validated_queries` quando catálogo curado retorna < topK.
 *
 * Multi-tenancy (ADR-0006): clientId/personaId obrigatórios.
 */
import { embed } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { querySqlEmbeddings, bumpReuse } from '@/shared/lib/memory/recall-store';
import { withoutRefusedSql } from '@/features/ai-agents/lib/recalled-sql';

export interface RecallSqlFallbackInput {
  intent: string;
  clientId: string;
  personaId: string;
  topK: number;
}

export interface RecallSqlFallbackResult {
  id: string;
  sql: string;
  intent: string;
  score: number;
}

export async function recallSqlFallback(
  input: RecallSqlFallbackInput,
): Promise<RecallSqlFallbackResult[]> {
  if (!input.clientId) throw new Error('recallSqlFallback: clientId obrigatório (ADR-0006)');
  if (!input.personaId) throw new Error('recallSqlFallback: personaId obrigatório');
  if (input.topK <= 0) return [];

  const { embedding } = await embed({
    model: vertex.textEmbeddingModel('gemini-embedding-001'),
    value: input.intent,
  });
  const matches = withoutRefusedSql(await querySqlEmbeddings({
    embedding,
    clientId: input.clientId,
    personaId: input.personaId,
    topK: input.topK,
  }), (m) => m.sqlText);

  if (matches.length > 0) {
    void Promise.resolve(
      bumpReuse('embeddingsSql', matches.map((m) => m.id)),
    ).catch(() => {});
  }

  return matches.map((m) => ({
    id: m.id,
    sql: m.sqlText,
    intent: m.intent,
    score: m.score ?? 0,
  }));
}

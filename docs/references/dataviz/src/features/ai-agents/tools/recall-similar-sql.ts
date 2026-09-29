import { tool, embed } from 'ai';
import { z } from 'zod';
import { vertex } from '@ai-sdk/google-vertex';
import { querySqlEmbeddings, bumpReuse } from '@/shared/lib/memory/recall-store';
import { withoutRefusedSql } from '@/features/ai-agents/lib/recalled-sql';
import { recordRecallMetric, estimateTokensSaved } from '@/shared/lib/telemetry/recall-metrics';

/**
 * ADR-0006: clientId/personaId são SERVER-BOUND.
 * O factory exige binding em build-time (closure); inputSchema do tool NÃO expõe.
 */
export function createRecallSimilarSqlTool(ctx: { clientId: string; personaId: string }) {
  if (!ctx.clientId) throw new Error('createRecallSimilarSqlTool: clientId obrigatório (ADR-0006)');
  if (!ctx.personaId) throw new Error('createRecallSimilarSqlTool: personaId obrigatório');
  return tool({
    description:
      'Recupera SQLs validados anteriormente similares à intent. Use ANTES de gerar SQL do zero.',
    inputSchema: z.object({
      intent: z.string().min(1),
      topK: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ intent, topK }) => {
      const { embedding } = await embed({
        model: vertex.textEmbeddingModel('gemini-embedding-001'),
        value: intent,
      });
      const matches = withoutRefusedSql(await querySqlEmbeddings({
        embedding,
        clientId: ctx.clientId,
        personaId: ctx.personaId,
        topK,
      }), (m) => m.sqlText);
      if (matches.length > 0) {
        void Promise.resolve(bumpReuse('embeddingsSql', matches.map((m) => m.id))).catch(() => {});
      }
      const topScore = matches[0]?.score ?? null;
      recordRecallMetric({
        kind: 'sql',
        clientId: ctx.clientId,
        hit: matches.length > 0,
        topScore,
        topK,
      });
      return {
        matches: matches.map((m) => ({
          id: m.id,
          score: m.score,
          sql: m.sqlText,
          intent: m.intent,
          schemaSnapshot: m.schemaSnapshot,
        })),
        tokensSaved: estimateTokensSaved({
          reused: matches.length > 0,
          sqlLength: matches[0]?.sqlText.length ?? 0,
        }),
      };
    },
  });
}

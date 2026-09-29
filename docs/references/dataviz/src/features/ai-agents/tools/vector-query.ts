import { tool } from 'ai';
import { z } from 'zod';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { queryDocs } from '@/shared/lib/rag/rag-service';
import { rerank } from '@/shared/lib/rag/reranker';
import { recordRagMetric } from '@/shared/lib/rag/metrics';

const InputSchema = z.object({
  query: z.string().min(1),
  filters: z
    .object({
      product: z.string().nullable(),
      persona: z.string().nullable(),
      docType: z.string().nullable(),
    })
    .partial()
    .nullable()
    .optional(),
});

export function createVectorQueryTool(ctx: { clientId: string }) {
  return tool({
    description:
      'Busca semântica no corpus de docs/benchmarking, glossário e schemas BQ. Filtro multi-tenant aplicado automaticamente. Use SEMPRE que precisar de contexto regulatório (CVM 60, BACEN, SBPE, MCMV, CRI/CRA), definições de métricas (LTV, DSCR, PDD), ou esquema de tabela BQ.',
    inputSchema: InputSchema,
    execute: async (input) => {
      const t0 = Date.now();
      const topKRetrieve = Number(process.env.RAG_TOPK_RETRIEVE ?? 20);
      const topKRerank = Number(process.env.RAG_TOPK_RERANK ?? 5);
      const [embedding] = await embedTexts([input.query]);
      if (!embedding) {
        recordRagMetric({
          event: 'query.done',
          durationMs: Date.now() - t0,
          clientId: ctx.clientId,
          hits: 0,
          ok: false,
          error: 'no embedding',
        });
        return { hits: [] };
      }
      const candidates = await queryDocs({
        embedding,
        topK: topKRetrieve,
        clientId: ctx.clientId, // ADR-0006: hard binding from server context.
        filters: {
          product: input.filters?.product ?? undefined,
          persona: input.filters?.persona ?? undefined,
          docType: input.filters?.docType ?? undefined,
        },
      });
      const reranked = await rerank({
        query: input.query,
        candidates: candidates.map((c) => ({ ...c })),
        topN: topKRerank,
      });
      recordRagMetric({
        event: 'query.done',
        durationMs: Date.now() - t0,
        clientId: ctx.clientId,
        hits: reranked.length,
        candidates: candidates.length,
        ok: true,
      });
      return {
        hits: reranked.map((h) => ({
          sourcePath: h.sourcePath,
          content: h.content,
          similarity: h.similarity,
          metadata: h.metadata,
        })),
      };
    },
  });
}

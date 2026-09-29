import { tool } from 'ai';
import { z } from 'zod';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { rerank } from '@/shared/lib/rag/reranker';
import { resolveVisibleKbs, queryKbDocs } from '@/features/ai-studio/kb/query-kb';

export function createKbRetrievalTool(ctx: { clientId?: string | null; knowledgeBaseRefs: string[] }) {
  return tool({
    description:
      'Busca semântica nos documentos das Knowledge Bases vinculadas a este agente (conhecimento de mercado, produto e negócio). Use para fundamentar respostas com o material curado pela administração.',
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: async (input: { query: string }) => {
      const topKRetrieve = Number(process.env.RAG_TOPK_RETRIEVE ?? 20);
      const topKRerank = Number(process.env.RAG_TOPK_RERANK ?? 5);

      const visible = await resolveVisibleKbs(ctx.knowledgeBaseRefs, ctx.clientId ?? null);
      if (visible.length === 0) return { hits: [] };

      const [embedding] = await embedTexts([input.query]);
      if (!embedding) return { hits: [] };

      const candidates = await queryKbDocs({ embedding, topK: topKRetrieve, knowledgeBaseIds: visible });
      if (candidates.length === 0) return { hits: [] };

      const reranked = await rerank({ query: input.query, candidates: candidates.map((c) => ({ ...c })), topN: topKRerank });
      return {
        hits: reranked.map((h) => ({
          content: h.content,
          similarity: h.similarity,
          filename: (h.metadata as { filename?: string })?.filename,
          metadata: h.metadata,
        })),
      };
    },
  });
}

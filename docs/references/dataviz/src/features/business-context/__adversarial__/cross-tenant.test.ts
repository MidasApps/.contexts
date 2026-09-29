import { describe, it, expect, vi, beforeEach } from 'vitest';
import queries from './queries.json';

const queryDocsMock = vi.fn();

vi.mock('@/shared/lib/rag/rag-service', () => ({
  queryDocs: (...a: unknown[]) => queryDocsMock(...a),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({
  embedTexts: () => Promise.resolve([[0.1, 0.2]]),
}));
vi.mock('@/shared/lib/rag/reranker', () => ({
  rerank: ({
    candidates,
    topN,
  }: {
    candidates: Array<{ similarity: number }>;
    topN: number;
  }) => Promise.resolve(candidates.slice(0, topN)),
}));
// The client business profile is read from Firestore; without this mock the
// test opens a real network connection and times out.
vi.mock('@/shared/repositories/client-business-profile', () => ({
  getClientBusinessProfile: async () => null,
  invalidateBusinessProfileCache: () => {},
}));
vi.mock('@/shared/lib/macro/bcb-sgs', () => ({
  getMacroSnapshot: () => Promise.resolve({ source: 'BCB_SGS' }),
}));

describe('cross-tenant adversarial gate (ADR-0006)', () => {
  beforeEach(() => {
    queryDocsMock.mockReset();
    queryDocsMock.mockImplementation(({ clientId }: { clientId: string }) =>
      Promise.resolve([
        {
          id: 'c1',
          sourcePath: 'doc.md',
          content: 'X',
          metadata: { clientId },
          similarity: 0.9,
        },
      ]),
    );
  });

  it('zero recall: every retrieved chunk has clientId === requested clientId', { timeout: 30_000 }, async () => {
    const { retrieveBusinessContext } = await import('../retrieve-business-context');
    const { clearCache } = await import('../cache');
    for (const q of queries) {
      clearCache();
      const ctx = await retrieveBusinessContext({
        clientId: q.actualClientId,
        personaId: 'cfo-securitizadora',
        briefing: q.query,
      });
      for (const chunk of ctx.retrieved) {
        expect(chunk.metadata.clientId).toBe(q.actualClientId);
      }
    }
  });

  it('queryDocs is always called with the requested clientId, never the leaked one', async () => {
    const { retrieveBusinessContext } = await import('../retrieve-business-context');
    const { clearCache } = await import('../cache');
    queryDocsMock.mockClear();
    for (const q of queries.slice(0, 5)) {
      clearCache();
      await retrieveBusinessContext({
        clientId: q.actualClientId,
        personaId: 'cfo-securitizadora',
        briefing: q.query,
      });
    }
    for (const call of queryDocsMock.mock.calls) {
      const arg = call[0] as { clientId?: string };
      expect(arg.clientId).toBeDefined();
      expect(arg.clientId).not.toBe('');
    }
  });

  it('vector_query rejects request without clientId (ADR-0006 hard requirement)', { timeout: 30_000 }, async () => {
    const { queryDocs } = (await vi.importActual(
      '@/shared/lib/rag/rag-service',
    )) as { queryDocs: (a: { embedding: number[]; topK: number; clientId?: string }) => Promise<unknown> };
    await expect(
      queryDocs({ embedding: [0.1], topK: 5 } as { embedding: number[]; topK: number; clientId?: string }),
    ).rejects.toThrow(/clientId/);
  });
});

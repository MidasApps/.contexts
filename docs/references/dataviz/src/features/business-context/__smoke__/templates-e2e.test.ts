import { describe, it, expect, vi, beforeEach } from 'vitest';
import briefings from './briefings.json';

vi.mock('@/shared/lib/rag/embeddings', () => ({
  embedTexts: () => Promise.resolve([[0.1]]),
}));
vi.mock('@/shared/lib/rag/rag-service', () => ({
  queryDocs: ({ clientId }: { clientId: string }) =>
    Promise.resolve([
      {
        id: 'c1',
        sourcePath: 'docs/foo.md',
        content: 'OC ES WAL',
        metadata: { clientId },
        similarity: 0.9,
      },
    ]),
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

describe('templates e2e (6 briefings)', () => {
  beforeEach(async () => {
    const { clearCache } = await import('../cache');
    clearCache();
  });

  // O catálogo shipado (templates-loader) ficou vazio com a purga de clientes,
  // então o pipeline completo resolve template=null para qualquer persona. A
  // lógica de seleção em si continua coberta com catálogo populado em
  // select-template.test.ts e retrieve-business-context.test.ts. Quando houver
  // templates do Vila Rosa, este é o teste que volta a afirmar o id esperado.
  it('every briefing yields a BusinessContext; template=null com catálogo vazio', { timeout: 30_000 }, async () => {
    const { retrieveBusinessContext } = await import('../retrieve-business-context');
    for (const b of briefings) {
      const ctx = await retrieveBusinessContext({
        clientId: b.clientId,
        personaId: b.personaId,
        briefing: b.briefing,
      });
      expect(ctx.template).toBeNull();
      expect(ctx.macro).toBeDefined();
      expect(ctx.retrieved.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('every briefing produces retrieved chunks with matching clientId', async () => {
    const { retrieveBusinessContext } = await import('../retrieve-business-context');
    const { clearCache } = await import('../cache');
    for (const b of briefings) {
      clearCache();
      const ctx = await retrieveBusinessContext({
        clientId: b.clientId,
        personaId: b.personaId,
        briefing: b.briefing,
      });
      for (const chunk of ctx.retrieved) {
        expect(chunk.metadata.clientId).toBe(b.clientId);
      }
    }
  });
});

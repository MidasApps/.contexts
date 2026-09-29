/**
 * Testes do scorer `business_correctness` (Task 6).
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createBusinessCorrectness } from '../business-correctness';
import type { ScorerInput } from '../types';

const baseInput = (narrative: string): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId: 'controller',
    clientId: 'vila-rosa',
    briefing: 'x',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
    expectedRegulatory: ['CMN_2682'],
  },
  agentOutput: { narrative },
  context: { clientId: 'vila-rosa', personaId: 'controller', macroAsOf: '2026-04-01' },
});

const mkJudge = (score: number, hallucinations: string[] = []) =>
  vi.fn(async (args: { schema: z.ZodTypeAny }) =>
    args.schema.parse({ score, rationale: `mock ${score}`, hallucinations }),
  );

describe('business_correctness', () => {
  it('output correto sem alucinações → score alto', async () => {
    const scorer = createBusinessCorrectness({ runJudgeImpl: mkJudge(0.95) as never });
    const out = await scorer.run(baseInput('CMN 2.682 prevê provisão de 3% no bucket H3.'));
    expect(out.score).toBeGreaterThanOrEqual(0.9);
    expect(out.metadata?.hallucinations).toEqual([]);
  });

  it('detecta alucinação regulatória', async () => {
    const scorer = createBusinessCorrectness({
      runJudgeImpl: mkJudge(0.2, ['Lei 13.786 art. 99 (inexistente)']) as never,
    });
    const out = await scorer.run(
      baseInput('Conforme Lei 13.786 art. 99 a retenção é de 90%.'),
    );
    expect(out.score).toBeLessThanOrEqual(0.3);
    expect(out.metadata?.hallucinations).toContain('Lei 13.786 art. 99 (inexistente)');
  });

  it('passa chunks RAG para o judge quando disponíveis', async () => {
    const judgeImpl = mkJudge(0.85);
    const scorer = createBusinessCorrectness({
      runJudgeImpl: judgeImpl as never,
      retrieveChunks: async () => [
        { id: 'c1', text: 'CMN 2.682 art. 6º', source: 'BACEN' },
      ],
    });
    const out = await scorer.run(baseInput('CMN 2.682.'));
    expect(judgeImpl).toHaveBeenCalledTimes(1);
    expect(out.metadata?.chunkIds).toEqual(['c1']);
  });

  it('número de provisão errado → score baixo', async () => {
    const scorer = createBusinessCorrectness({
      runJudgeImpl: mkJudge(0.25, ['provisão 100% para bucket H1']) as never,
    });
    const out = await scorer.run(baseInput('Bucket H1 exige provisão de 100%.'));
    expect(out.score).toBeLessThan(0.4);
  });
});

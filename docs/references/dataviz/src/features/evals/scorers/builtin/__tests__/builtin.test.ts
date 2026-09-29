/**
 * Testes dos scorers built-in (faithfulness, prompt_alignment,
 * tool_call_accuracy) — Task 8 / Sprint 3.D.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createFaithfulness } from '../faithfulness';
import { createPromptAlignment } from '../prompt-alignment';
import { createToolCallAccuracy } from '../tool-call-accuracy';
import type { ScorerInput } from '../../types';

const baseInput = (overrides: Partial<ScorerInput['agentOutput']> = {}): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId: 'controller',
    clientId: 'vila-rosa',
    briefing: 'Liste o PDD do trimestre.',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  agentOutput: { narrative: 'O PDD do trimestre é 3%.', ...overrides },
  context: { clientId: 'vila-rosa', personaId: 'controller', macroAsOf: '2026-04-01' },
});

const mkJudge =
  (score: number, extra: Record<string, unknown>) =>
  vi.fn(async (args: { schema: z.ZodTypeAny }) =>
    args.schema.parse({ score, rationale: `mock ${score}`, ...extra }),
  );

describe('faithfulness', () => {
  it('happy: output suportado pelo briefing → score alto', async () => {
    const scorer = createFaithfulness({
      runJudgeImpl: mkJudge(0.9, { unsupportedClaims: [] }) as never,
    });
    const out = await scorer.run(baseInput());
    expect(out.score).toBeGreaterThanOrEqual(0.8);
    expect(out.metadata?.unsupportedClaims).toEqual([]);
  });

  it('fail: invenção de número → score baixo + claim listado', async () => {
    const scorer = createFaithfulness({
      runJudgeImpl: mkJudge(0.2, { unsupportedClaims: ['PDD = 99% (não suportado)'] }) as never,
    });
    const out = await scorer.run(baseInput({ narrative: 'PDD é 99%.' }));
    expect(out.score).toBeLessThanOrEqual(0.3);
    expect(out.metadata?.unsupportedClaims).toContain('PDD = 99% (não suportado)');
  });
});

describe('prompt_alignment', () => {
  it('happy: respeita formato + tom → score alto', async () => {
    const scorer = createPromptAlignment({
      runJudgeImpl: mkJudge(0.85, { violations: [] }) as never,
    });
    const out = await scorer.run(baseInput());
    expect(out.score).toBeGreaterThanOrEqual(0.8);
  });

  it('fail: tom errado / fora de PT-BR → score baixo', async () => {
    const scorer = createPromptAlignment({
      runJudgeImpl: mkJudge(0.3, { violations: ['saída em inglês'] }) as never,
    });
    const out = await scorer.run(baseInput({ narrative: 'PDD is 3%' }));
    expect(out.score).toBeLessThanOrEqual(0.4);
    expect(out.metadata?.violations).toContain('saída em inglês');
  });
});

describe('tool_call_accuracy', () => {
  it('happy: todas tools chamadas com args válidos → 1.0', async () => {
    const scorer = createToolCallAccuracy({
      expectedTools: [
        { toolName: 'lookup_glossary', argSchema: z.object({ term: z.string() }) },
        { toolName: 'retrieve_business_context' },
      ],
    });
    const out = await scorer.run(
      baseInput({
        toolCalls: [
          { toolName: 'lookup_glossary', args: { term: 'pdd' } },
          { toolName: 'retrieve_business_context', args: {} },
        ],
      }),
    );
    expect(out.score).toBe(1);
  });

  it('fail: tool faltando → score baixo + missing listado', async () => {
    const scorer = createToolCallAccuracy({
      expectedTools: [
        { toolName: 'lookup_glossary' },
        { toolName: 'retrieve_business_context' },
      ],
    });
    const out = await scorer.run(
      baseInput({
        toolCalls: [{ toolName: 'lookup_glossary', args: {} }],
      }),
    );
    expect(out.score).toBeLessThan(1);
    expect(out.metadata?.missing).toContain('retrieve_business_context');
  });
});

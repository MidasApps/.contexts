/**
 * Testes do scorer `persona_fit` (Task 5).
 * Mock loader de persona + mock runJudge.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createPersonaFit } from '../persona-fit';
import type { ScorerInput } from '../types';
import type { PersonaProfile } from '@/shared/config/business-context/schemas';

const cfo: PersonaProfile = {
  id: 'cfo-securitizadora',
  name: 'CFO de Securitizadora',
  layer: 'estrategica',
  language: 'executiva',
  horizon: 'longo',
  priorityKpis: ['pdd', 'es'],
  preferredGranularity: 'carteira',
  preferredVisuals: ['kpi', 'line'],
  jargonAnchor: ['overcollateralization', 'subordinação'],
  forbidden: [],
};

const operator: PersonaProfile = {
  ...cfo,
  id: 'analista-cobranca',
  name: 'Analista de Cobrança',
  layer: 'operacional',
  language: 'operacional',
  horizon: 'curto',
  preferredGranularity: 'contrato',
  jargonAnchor: ['parcela', 'atraso'],
};

const ceo: PersonaProfile = {
  ...cfo,
  id: 'ceo-incorporadora',
  name: 'CEO Incorporadora',
  jargonAnchor: ['VGV', 'EBITDA', 'fluxo livre'],
};

const baseInput = (personaId: string, narrative: string): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId,
    clientId: 'vila-rosa',
    briefing: 'x',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  agentOutput: { narrative },
  context: { clientId: 'vila-rosa', personaId, macroAsOf: '2026-04-01' },
});

const mkJudge = (score: number) =>
  vi.fn(async (args: { schema: z.ZodTypeAny }) =>
    args.schema.parse({
      score,
      rationale: `mock ${score}`,
      breakdown: { language: score, jargon: score, granularity: score, horizon: score },
    }),
  );

describe('persona_fit', () => {
  it('persona certa + jargão correto → score alto', async () => {
    const scorer = createPersonaFit({
      loadPersona: async () => cfo,
      runJudgeImpl: mkJudge(0.9) as never,
    });
    const out = await scorer.run(
      baseInput('cfo-securitizadora', 'A subordinação da tranche sênior absorve o risco.'),
    );
    expect(out.score).toBeGreaterThanOrEqual(0.8);
    expect(out.metadata?.breakdown).toBeDefined();
  });

  it('persona errada → score baixo', async () => {
    const scorer = createPersonaFit({
      loadPersona: async () => operator,
      runJudgeImpl: mkJudge(0.3) as never,
    });
    const out = await scorer.run(
      baseInput('analista-cobranca', 'A overcollateralization da tranche...'),
    );
    expect(out.score).toBeLessThanOrEqual(0.4);
  });

  it('CEO com jargão executivo → score alto', async () => {
    const scorer = createPersonaFit({
      loadPersona: async () => ceo,
      runJudgeImpl: mkJudge(0.85) as never,
    });
    const out = await scorer.run(
      baseInput('ceo-incorporadora', 'O VGV e o EBITDA seguem em alta.'),
    );
    expect(out.score).toBeGreaterThanOrEqual(0.8);
  });

  it('persona não encontrada → score 0', async () => {
    const scorer = createPersonaFit({
      loadPersona: async () => null,
      runJudgeImpl: mkJudge(1) as never,
    });
    const out = await scorer.run(baseInput('inexistente', 'x'));
    expect(out.score).toBe(0);
  });
});

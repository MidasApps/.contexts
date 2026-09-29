/**
 * Testes do factory `createScorer` (Task 2 / Sprint 3.D).
 *
 * Cobertura:
 *  - Nome obrigatório (validation).
 *  - `run` é chamado e retorno é tipado como `ScoreResult`.
 *  - Captura de throw → `{score: 0, rationale: 'run threw: ...'}`.
 *  - Auto-carimbo de `clientId`, `personaId`, `glossaryVersion`,
 *    `regulatoryPackVersion` em metadata.
 *  - Auto-carimbo de `judgeModelVersion` para kind ∈ {judge, hybrid}.
 */
import { describe, it, expect } from 'vitest';
import { createScorer } from '../create-scorer';
import type { ScorerInput } from '../types';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';

const baseInput: ScorerInput = {
  briefing: {
    id: 'fix-1',
    templateId: 1,
    personaId: 'cfo-securitizadora',
    clientId: 'vila-rosa',
    briefing: 'qual o PDD?',
    expectedKpis: ['pdd'],
    expectedVisuals: ['kpi'],
    expectedTopics: ['risco'],
  },
  agentOutput: { narrative: 'ok' },
  context: {
    clientId: 'vila-rosa',
    personaId: 'cfo-securitizadora',
    macroAsOf: '2026-04-01',
  },
};

describe('createScorer', () => {
  it('exige `name`', () => {
    expect(() =>
      createScorer({
        name: '',
        kind: 'function',
        run: async () => ({ score: 1 }),
      }),
    ).toThrow(/name/i);
    expect(() =>
      createScorer({
        name: '   ',
        kind: 'function',
        run: async () => ({ score: 1 }),
      }),
    ).toThrow(/name/i);
  });

  it('chama `run` e retorna ScoreResult com metadata carimbada', async () => {
    const scorer = createScorer({
      name: 'foo',
      kind: 'function',
      run: async () => ({ score: 0.7, rationale: 'meh' }),
    });
    const out = await scorer.run(baseInput);
    expect(out.score).toBe(0.7);
    expect(out.rationale).toBe('meh');
    expect(out.metadata?.clientId).toBe('vila-rosa');
    expect(out.metadata?.personaId).toBe('cfo-securitizadora');
    expect(out.metadata?.glossaryVersion).toBe(GLOSSARY_VERSION);
    expect(out.metadata?.regulatoryPackVersion).toBeTypeOf('string');
    // Não-judge não carimba judgeModelVersion.
    expect(out.metadata?.judgeModelVersion).toBeUndefined();
  });

  it('captura throw → score 0 com rationale "run threw: ..."', async () => {
    const scorer = createScorer({
      name: 'boom',
      kind: 'function',
      run: async () => {
        throw new Error('explode');
      },
    });
    const out = await scorer.run(baseInput);
    expect(out.score).toBe(0);
    expect(out.rationale).toMatch(/run threw: .*explode/);
    expect(out.metadata?.clientId).toBe('vila-rosa');
  });

  it('carimba judgeModelVersion para kind=judge (ctor arg vence env)', async () => {
    const scorer = createScorer({
      name: 'judge-x',
      kind: 'judge',
      judgeModelVersion: 'gemini-2.5-pro-preview',
      run: async () => ({ score: 0.5 }),
    });
    const out = await scorer.run(baseInput);
    expect(out.metadata?.judgeModelVersion).toBe('gemini-2.5-pro-preview');
    expect(scorer.judgeModelVersion).toBe('gemini-2.5-pro-preview');
  });

  it('judge sem ctor arg usa env EVAL_JUDGE_MODEL ou default gemini-2.5-pro', async () => {
    const scorer = createScorer({
      name: 'judge-y',
      kind: 'hybrid',
      run: async () => ({ score: 0.9 }),
    });
    const out = await scorer.run(baseInput);
    expect(out.metadata?.judgeModelVersion).toBeTruthy();
  });

  it('preserva metadata custom retornada pelo run', async () => {
    const scorer = createScorer({
      name: 'meta',
      kind: 'function',
      run: async () => ({ score: 1, metadata: { sub: { a: 1 } } }),
    });
    const out = await scorer.run(baseInput);
    expect(out.metadata?.sub).toEqual({ a: 1 });
    expect(out.metadata?.clientId).toBe('vila-rosa');
  });
});

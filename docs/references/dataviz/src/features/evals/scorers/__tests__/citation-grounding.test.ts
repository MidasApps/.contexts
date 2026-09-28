/**
 * Testes do scorer `citation_grounding` (Task 7 / Sprint 3.D).
 */
import { describe, it, expect } from 'vitest';
import { CITATION_FIXTURES } from '../__fixtures__/citation';
import { createCitationGrounding, parseClaims } from '../citation-grounding';
import type { ScorerInput } from '../types';

const baseInput = (
  narrative: string,
  citations: Record<string, string> | undefined,
): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId: 'controller',
    clientId: 'vila-rosa',
    briefing: 'x',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  agentOutput: { narrative, citations },
  context: { clientId: 'vila-rosa', personaId: 'controller', macroAsOf: '2026-04-01' },
});

describe('citation_grounding', () => {
  for (const fix of CITATION_FIXTURES) {
    it(`${fix.id} → score ∈ [${fix.expectedRange[0]}, ${fix.expectedRange[1]}]`, async () => {
      const scorer = createCitationGrounding({ validDocIds: fix.validDocIds });
      const out = await scorer.run(baseInput(fix.narrative, fix.citations));
      expect(out.score).toBeGreaterThanOrEqual(fix.expectedRange[0]);
      expect(out.score).toBeLessThanOrEqual(fix.expectedRange[1]);
    });
  }

  it('narrative sem claims → 1.0 (nada a validar)', async () => {
    const scorer = createCitationGrounding({ validDocIds: [] });
    const out = await scorer.run(baseInput('Texto sem números nem normas.', undefined));
    expect(out.score).toBe(1.0);
  });

  it('parseClaims captura padrões regulatórios e numéricos', () => {
    const claims = parseClaims(
      'CMN 2.682 exige 50% de provisão segundo a Res. 4.676 e Lei 13.786 art. 67. Aumento de 250 bps.',
    );
    expect(claims.length).toBeGreaterThanOrEqual(3);
  });
});

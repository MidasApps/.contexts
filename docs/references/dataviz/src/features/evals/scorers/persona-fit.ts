/**
 * Scorer `persona_fit` (Task 5 / Sprint 3.D) — judge.
 *
 * Carrega o `PersonaProfile` do `personaId` em `input.context`, monta a
 * rubrica via `renderPersonaFitRubric` e aciona o judge `gemini-2.5-pro`
 * via `runJudge`. Output: `{score, rationale, breakdown}`.
 */

import { z } from 'zod';
import { createScorer } from './create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from './types';
import { runJudge, BaseJudgeOutputSchema } from './judges/judge-runner';
import {
  renderPersonaFitRubric,
  type PersonaFitContext,
} from './judges/rubrics/persona-fit.rubric';
import type { PersonaProfile } from '@/shared/config/business-context/schemas';

const PersonaFitSchema = BaseJudgeOutputSchema.extend({
  breakdown: z.object({
    language: z.number().min(0).max(1),
    jargon: z.number().min(0).max(1),
    granularity: z.number().min(0).max(1),
    horizon: z.number().min(0).max(1),
  }),
});

export interface PersonaFitDeps {
  /** Loader de persona (default: import dinâmico de
   *  `src/shared/config/business-context/personas/<id>.json`). */
  loadPersona?: (personaId: string) => Promise<PersonaProfile | null>;
  runJudgeImpl?: typeof runJudge;
}

const defaultLoader = async (personaId: string): Promise<PersonaProfile | null> => {
  try {
    const mod = (await import(
      `@/shared/config/business-context/personas/${personaId}.json`
    )) as { default: PersonaProfile };
    return mod.default ?? (mod as unknown as PersonaProfile);
  } catch {
    return null;
  }
};

function evaluatePersonaFit(deps: PersonaFitDeps) {
  const judge = deps.runJudgeImpl ?? runJudge;
  const loader = deps.loadPersona ?? defaultLoader;

  return async (input: ScorerInput): Promise<ScoreResult> => {
    const persona = await loader(input.context.personaId);
    if (!persona) {
      return {
        score: 0,
        rationale: `Persona "${input.context.personaId}" não encontrada.`,
      };
    }
    const ctx: PersonaFitContext = {
      personaId: persona.id,
      layer: persona.layer,
      language: persona.language,
      horizon: persona.horizon,
      preferredGranularity: persona.preferredGranularity,
      jargonAnchor: persona.jargonAnchor,
      forbidden: persona.forbidden,
    };

    const judgeOut = await judge({
      rubric: renderPersonaFitRubric(ctx),
      prompt: `Output do agente:\n${input.agentOutput.narrative ?? ''}\n\n` +
        `Layout (resumo): ${JSON.stringify(input.agentOutput.layout ?? null)}`,
      schema: PersonaFitSchema,
      scorerName: 'persona_fit',
    });

    return {
      score: judgeOut.score,
      rationale: judgeOut.rationale,
      metadata: {
        breakdown: judgeOut.breakdown,
        personaId: persona.id,
      },
    };
  };
}

export function createPersonaFit(deps: PersonaFitDeps = {}): Scorer {
  return createScorer({
    name: 'persona_fit',
    kind: 'judge',
    run: evaluatePersonaFit(deps),
  });
}

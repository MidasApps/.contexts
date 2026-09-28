/**
 * Scorer built-in `prompt_alignment` (Task 8 / Sprint 3.D).
 * Wrapper de judge: avalia aderência ao system prompt dinâmico
 * (persona/cliente). Verifica se o output respeita instruções de
 * formato, tom e foco solicitados.
 */

import { z } from 'zod';
import { createScorer } from '../create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from '../types';
import { runJudge, BaseJudgeOutputSchema } from '../judges/judge-runner';

const PROMPT_ALIGNMENT_RUBRIC = `Avalie se o output do agente respeita as restrições do system prompt:
formato (KPIs primeiro, narrativa em PT-BR), tom (executivo/técnico),
foco no cliente e persona indicados. Retorne JSON com {score, rationale,
violations[]}.`;

const Schema = BaseJudgeOutputSchema.extend({
  violations: z.array(z.string()),
});

export interface PromptAlignmentDeps {
  runJudgeImpl?: typeof runJudge;
}

export function createPromptAlignment(deps: PromptAlignmentDeps = {}): Scorer {
  const judge = deps.runJudgeImpl ?? runJudge;
  return createScorer({
    name: 'prompt_alignment',
    kind: 'judge',
    run: async (input: ScorerInput): Promise<ScoreResult> => {
      const out = await judge({
        rubric: PROMPT_ALIGNMENT_RUBRIC,
        prompt: `Persona: ${input.context.personaId} | Cliente: ${input.context.clientId}\n\n` +
          `Briefing:\n${input.briefing.briefing}\n\n` +
          `Output:\n${input.agentOutput.narrative ?? ''}`,
        schema: Schema,
        scorerName: 'prompt_alignment',
      });
      return {
        score: out.score,
        rationale: out.rationale,
        metadata: { violations: out.violations },
      };
    },
  });
}

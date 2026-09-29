/**
 * Scorer built-in `faithfulness` (Task 8 / Sprint 3.D).
 * Wrapper de judge: avalia se o output cita apenas fatos suportados
 * pelo briefing + RAG (sem fabricar números/datas/normas).
 */

import { z } from 'zod';
import { createScorer } from '../create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from '../types';
import { runJudge, BaseJudgeOutputSchema } from '../judges/judge-runner';

const FAITHFULNESS_RUBRIC = `Avalie se o output do agente afirma apenas fatos diretamente suportados
pelo briefing e por chunks RAG fornecidos. Penalize toda invenção
(números, datas, citações regulatórias, métricas) que não esteja explícita
ou logicamente derivável das fontes. Retorne JSON com {score, rationale,
unsupportedClaims[]}.`;

const Schema = BaseJudgeOutputSchema.extend({
  unsupportedClaims: z.array(z.string()),
});

export interface FaithfulnessDeps {
  runJudgeImpl?: typeof runJudge;
}

export function createFaithfulness(deps: FaithfulnessDeps = {}): Scorer {
  const judge = deps.runJudgeImpl ?? runJudge;
  return createScorer({
    name: 'faithfulness',
    kind: 'judge',
    run: async (input: ScorerInput): Promise<ScoreResult> => {
      const out = await judge({
        rubric: FAITHFULNESS_RUBRIC,
        prompt: `Briefing:\n${input.briefing.briefing}\n\n` +
          `Output do agente:\n${input.agentOutput.narrative ?? ''}`,
        schema: Schema,
        scorerName: 'faithfulness',
      });
      return {
        score: out.score,
        rationale: out.rationale,
        metadata: { unsupportedClaims: out.unsupportedClaims },
      };
    },
  });
}

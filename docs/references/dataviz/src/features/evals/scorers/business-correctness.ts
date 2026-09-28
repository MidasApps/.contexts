/**
 * Scorer `business_correctness` (Task 6 / Sprint 3.D) — judge regulatório.
 *
 * Recebe `agentOutput` + chunks RAG opcionais (Sprint 2.D namespace
 * `regulatorio`). O judge produz `{score, rationale, hallucinations[]}`.
 */

import { z } from 'zod';
import { createScorer } from './create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from './types';
import { runJudge, BaseJudgeOutputSchema } from './judges/judge-runner';
import { BUSINESS_CORRECTNESS_RUBRIC } from './judges/rubrics/business-correctness.rubric';

const BusinessCorrectnessSchema = BaseJudgeOutputSchema.extend({
  hallucinations: z.array(z.string()),
});

export interface RegulatoryChunk {
  id: string;
  text: string;
  source: string;
}

export interface BusinessCorrectnessDeps {
  /** Função que retorna chunks RAG normativos relevantes ao output. */
  retrieveChunks?: (input: ScorerInput) => Promise<RegulatoryChunk[]>;
  runJudgeImpl?: typeof runJudge;
}

function evaluateBusinessCorrectness(deps: BusinessCorrectnessDeps) {
  const judge = deps.runJudgeImpl ?? runJudge;
  const retrieve = deps.retrieveChunks ?? (async () => []);

  return async (input: ScorerInput): Promise<ScoreResult> => {
    const chunks = await retrieve(input);
    const chunksBlock = chunks.length
      ? chunks.map((c) => `[${c.id}] (${c.source}) ${c.text}`).join('\n---\n')
      : '(nenhum chunk RAG disponível — avalie apenas pelo conhecimento normativo da rubrica)';

    const judgeOut = await judge({
      rubric: BUSINESS_CORRECTNESS_RUBRIC,
      prompt:
        `Output do agente:\n${input.agentOutput.narrative ?? ''}\n\n` +
        `Chunks RAG normativos:\n${chunksBlock}\n\n` +
        `Persona: ${input.context.personaId} | Cliente: ${input.context.clientId}`,
      schema: BusinessCorrectnessSchema,
      scorerName: 'business_correctness',
    });

    return {
      score: judgeOut.score,
      rationale: judgeOut.rationale,
      metadata: {
        hallucinations: judgeOut.hallucinations,
        chunkIds: chunks.map((c) => c.id),
      },
    };
  };
}

export function createBusinessCorrectness(
  deps: BusinessCorrectnessDeps = {},
): Scorer {
  return createScorer({
    name: 'business_correctness',
    kind: 'judge',
    run: evaluateBusinessCorrectness(deps),
  });
}

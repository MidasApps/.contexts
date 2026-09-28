/**
 * Scorer built-in `tool_call_accuracy` (Task 8 / Sprint 3.D) — function.
 *
 * Valida `agentOutput.toolCalls` contra a lista de ferramentas esperadas
 * passada via `expectedTools`. Suporta:
 *  - exato: cada tool esperada deve aparecer ao menos uma vez.
 *  - argValidator opcional: validador Zod por tool para verificar args.
 *
 * Score = (toolsAtendidas + argsValidos) / (2 * totalEsperadas).
 */

import type { ZodTypeAny } from 'zod';
import { createScorer } from '../create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from '../types';

export interface ToolCallExpectation {
  /** Nome esperado da tool (ex.: 'lookup_glossary'). */
  toolName: string;
  /** Schema Zod opcional para validar `args`. */
  argSchema?: ZodTypeAny;
}

export interface ToolCallAccuracyDeps {
  expectedTools: ToolCallExpectation[];
}

export function createToolCallAccuracy(deps: ToolCallAccuracyDeps): Scorer {
  return createScorer({
    name: 'tool_call_accuracy',
    kind: 'function',
    run: async (input: ScorerInput): Promise<ScoreResult> => {
      const calls = Array.isArray(input.agentOutput.toolCalls)
        ? input.agentOutput.toolCalls
        : [];
      const total = deps.expectedTools.length;
      if (total === 0) {
        return { score: 1, rationale: 'Nenhuma tool esperada — passa.' };
      }

      let toolsHit = 0;
      let argsValid = 0;
      const missing: string[] = [];
      const argErrors: string[] = [];

      for (const exp of deps.expectedTools) {
        const matching = calls.filter((c) => c.toolName === exp.toolName);
        if (matching.length === 0) {
          missing.push(exp.toolName);
          continue;
        }
        toolsHit += 1;
        if (exp.argSchema) {
          const ok = matching.some((c) => exp.argSchema!.safeParse(c.args).success);
          if (ok) argsValid += 1;
          else argErrors.push(exp.toolName);
        } else {
          argsValid += 1;
        }
      }

      const score = (toolsHit + argsValid) / (2 * total);
      return {
        score,
        rationale: `tools=${toolsHit}/${total}; argsValid=${argsValid}/${total}`,
        metadata: { missing, argErrors, totalCalls: calls.length },
      };
    },
  });
}

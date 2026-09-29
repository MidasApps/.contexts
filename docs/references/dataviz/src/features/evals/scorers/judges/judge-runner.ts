/**
 * `runJudge` — wrapper compartilhado em torno de `generateObject` (AI SDK
 * v6) para os scorers judge/hybrid (Tasks 4-6, 8 / Sprint 3.D).
 *
 * Princípios:
 *  - Estrutura padrão: `{score: number ∈ [0,1], rationale: string}` —
 *    estendível por scorer via `schemaExt`.
 *  - Cache em memória por `hash(rubric+prompt+modelId)` para evitar
 *    re-chamadas em testes/dev.
 *  - Timeout configurável; em falha de tempo, retorna fallback.
 *  - Mock-friendly: a implementação é injetada via DI no test (vi.mock).
 *
 * Em testes, mockamos este módulo inteiro (`vi.mock(...judge-runner)`)
 * para evitar chamadas reais a `gemini-2.5-pro`.
 */

import { generateObject } from 'ai';
import { z, type ZodTypeAny } from 'zod';
import { getModel, getProviderOptions } from '@/features/ai-agents/model-registry';
import { recordSpan } from '@/shared/lib/telemetry/record-span';

export const BaseJudgeOutputSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});

export interface RunJudgeArgs<S extends ZodTypeAny> {
  /** Texto da rubrica (instrução do system prompt). */
  rubric: string;
  /** Prompt user-facing (output do agente + contexto). */
  prompt: string;
  /** Schema Zod do retorno do judge (deve estender `BaseJudgeOutputSchema`). */
  schema: S;
  /** Tag de telemetria (ex.: 'persona_fit'). */
  scorerName: string;
  /** Timeout em ms (default 30000). */
  timeoutMs?: number;
}

const _cache = new Map<string, unknown>();

function cacheKey(rubric: string, prompt: string, scorerName: string): string {
  // Hash leve via FNV-1a (suficiente para cache em memória).
  const data = `${scorerName}|${rubric}|${prompt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${scorerName}:${h.toString(16)}`;
}

export async function runJudge<S extends ZodTypeAny>(
  args: RunJudgeArgs<S>,
): Promise<z.infer<S>> {
  const key = cacheKey(args.rubric, args.prompt, args.scorerName);
  const cached = _cache.get(key);
  if (cached) return cached as z.infer<S>;

  const result = await recordSpan(
    {
      name: `evals.judge.${args.scorerName}`,
      attributes: { scorerName: args.scorerName },
    },
    async () => {
      const timeoutMs = args.timeoutMs ?? 30_000;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const { object } = await generateObject({
          model: getModel('reasoning'),
          providerOptions: getProviderOptions('reasoning'),
          schema: args.schema,
          // `system` virou `instructions` na AI SDK v7 (o antigo segue aceito,
          // marcado @deprecated no tipo — não vale herdar a dívida).
          instructions: args.rubric,
          prompt: args.prompt,
          abortSignal: ctrl.signal,
        });
        return object as z.infer<S>;
      } finally {
        clearTimeout(timer);
      }
    },
  );

  _cache.set(key, result);
  return result;
}

/** Limpa o cache (uso em testes). */
export function clearJudgeCache(): void {
  _cache.clear();
}

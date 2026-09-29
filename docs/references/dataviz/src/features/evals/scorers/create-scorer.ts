/**
 * Factory `createScorer` (Task 2 / Sprint 3.D / ADR-0010).
 *
 * Responsabilidades:
 *  - Validar `name` obrigatório.
 *  - Envolver `run` em try/catch (throws → `{score: 0, rationale: 'run threw: ...'}`).
 *  - Carimbar metadata canônica em todo `ScoreResult`:
 *      - `clientId`, `personaId` (de `input.context`, ADR-0006).
 *      - `glossaryVersion` (de `@/shared/config/glossary`).
 *      - `regulatoryPackVersion` (env `REGULATORY_PACK_VERSION`, default 'r1').
 *      - `judgeModelVersion` quando kind ∈ {judge, hybrid}, lendo de
 *        ctor arg → env `EVAL_JUDGE_MODEL` → default 'gemini-2.5-pro'.
 */

import type { Scorer, ScorerInput, ScoreResult } from './types';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';

const DEFAULT_JUDGE_MODEL = 'gemini-2.5-pro';
const DEFAULT_REGULATORY_PACK = 'r1';

export interface CreateScorerOptions {
  name: string;
  kind: 'function' | 'judge' | 'hybrid';
  judgeModelVersion?: string;
  run: (input: ScorerInput) => Promise<ScoreResult>;
}

function resolveJudgeModelVersion(
  kind: CreateScorerOptions['kind'],
  ctorArg: string | undefined,
): string | undefined {
  if (kind === 'function') return undefined;
  if (ctorArg) return ctorArg;
  return process.env.EVAL_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
}

function resolveRegulatoryPackVersion(): string {
  return process.env.REGULATORY_PACK_VERSION || DEFAULT_REGULATORY_PACK;
}

export function createScorer(opts: CreateScorerOptions): Scorer {
  if (!opts.name || opts.name.trim().length === 0) {
    throw new Error('createScorer: `name` é obrigatório.');
  }
  const judgeModelVersion = resolveJudgeModelVersion(opts.kind, opts.judgeModelVersion);

  const stamp = (input: ScorerInput, base: ScoreResult): ScoreResult => {
    const stamped: Record<string, unknown> = {
      ...(base.metadata ?? {}),
      clientId: input.context.clientId,
      personaId: input.context.personaId,
      glossaryVersion: GLOSSARY_VERSION,
      regulatoryPackVersion: resolveRegulatoryPackVersion(),
    };
    if (judgeModelVersion) stamped.judgeModelVersion = judgeModelVersion;
    return { ...base, metadata: stamped };
  };

  const run = async (input: ScorerInput): Promise<ScoreResult> => {
    try {
      const out = await opts.run(input);
      return stamp(input, out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return stamp(input, { score: 0, rationale: `run threw: ${msg}` });
    }
  };

  return {
    name: opts.name,
    kind: opts.kind,
    judgeModelVersion,
    run,
    evaluate: run,
  };
}

/**
 * Scorer `sql_correctness` (Task 3 / Sprint 3.D).
 *
 * 4 sub-scores ponderados igualmente (média aritmética):
 *  1. parsePass        — não usa `SELECT *`.
 *  2. partitionFilter  — referência a `data_competencia` ou `data_base_report`.
 *  3. bytesReasonable  — bytes processados ≤ 100 GiB (configurável).
 *  4. noAntipattern    — sem `CROSS JOIN`.
 *
 * Quando `performDryRun` falha, cai em análise estática (bytes assumido OK).
 *
 * Fonte da verdade de dry-run: `@/features/ai-agents/tools/bq-dry-run`
 * (Sprint 1.C). Em testes, mockar via `vi.mock`.
 */

import { createScorer } from './create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from './types';
import { performDryRun } from '@/features/ai-agents/tools/bq-dry-run';

const BYTES_LIMIT = 100 * 1024 ** 3; // 100 GiB

const SELECT_STAR_RE = /\bSELECT\s+\*/i;
const CROSS_JOIN_RE = /\bCROSS\s+JOIN\b/i;
const PARTITION_COL_RE = /\b(data_competencia|data_base_report)\b/i;

export interface SubScores {
  parsePass: number;
  partitionFilter: number;
  bytesReasonable: number;
  noAntipattern: number;
}

export function analyzeSqlStatic(sql: string): Pick<SubScores, 'parsePass' | 'partitionFilter' | 'noAntipattern'> {
  return {
    parsePass: SELECT_STAR_RE.test(sql) ? 0 : 1,
    partitionFilter: PARTITION_COL_RE.test(sql) ? 1 : 0,
    noAntipattern: CROSS_JOIN_RE.test(sql) ? 0 : 1,
  };
}

async function evaluateSql(input: ScorerInput): Promise<ScoreResult> {
  const sql = typeof input.agentOutput.sql === 'string' ? input.agentOutput.sql : '';
  if (!sql.trim()) {
    return { score: 0, rationale: 'agentOutput.sql ausente ou vazio.' };
  }

  const stat = analyzeSqlStatic(sql);

  let bytesReasonable = 1;
  let dryRunFallback = false;
  let bytesProcessed: number | undefined;
  try {
    const dr = await performDryRun(sql);
    if (dr.valid && typeof dr.bytesProcessed === 'number') {
      bytesProcessed = dr.bytesProcessed;
      bytesReasonable = dr.bytesProcessed <= BYTES_LIMIT ? 1 : 0;
    } else if (!dr.valid) {
      // Dry-run inválido (sintaxe etc.) penaliza parsePass.
      stat.parsePass = 0;
    }
  } catch {
    dryRunFallback = true;
  }

  const subs: SubScores = { ...stat, bytesReasonable };
  // Sub-falhas atuam como tetos. Usamos o mínimo dos tetos ativos para
  // garantir que qualquer anti-padrão grave (SELECT * / CROSS JOIN) cap
  // o score em 0.3 — alinhado com a spec do Sprint 3.D §Task 3.
  const caps: number[] = [];
  if (!subs.parsePass) caps.push(0.3);
  if (!subs.noAntipattern) caps.push(0.3);
  if (!subs.partitionFilter) caps.push(0.5);
  if (!subs.bytesReasonable) caps.push(0.4);
  const score = caps.length ? Math.min(...caps) : 1.0;

  const rationale = [
    `parsePass=${subs.parsePass}`,
    `partitionFilter=${subs.partitionFilter}`,
    `bytesReasonable=${subs.bytesReasonable}`,
    `noAntipattern=${subs.noAntipattern}`,
  ].join('; ');

  return {
    score,
    rationale,
    metadata: {
      subScores: subs,
      bytesProcessed,
      dryRunFallback,
    },
  };
}

export function createSqlCorrectness(): Scorer {
  return createScorer({
    name: 'sql_correctness',
    kind: 'function',
    run: evaluateSql,
  });
}

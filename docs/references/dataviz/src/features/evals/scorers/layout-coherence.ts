/**
 * Scorer `layout_coherence` (Task 4 / Sprint 3.D) — hybrid.
 *
 * Parte function (peso 0.7): 4 sub-métricas estruturais.
 *   - kpisFirst: bloco no top é tipo `kpi`/`headline`.
 *   - blockCount: 3..5 blocos = 1.0; fora cai linearmente.
 *   - priorityKpisCoverage: cobertura ≥0.8 = 1.0; <0.8 = ratio.
 *   - visualsAllowed: visuais ⊂ `expectedVisuals` da persona.
 *
 * Parte judge (peso 0.3): runJudge avalia narrativa do layout.
 */

import { z } from 'zod';
import { createScorer } from './create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from './types';
import { runJudge, BaseJudgeOutputSchema } from './judges/judge-runner';
import { LAYOUT_COHERENCE_RUBRIC } from './judges/rubrics/layout-coherence.rubric';

interface LayoutBlock {
  id?: string;
  type?: string;
  kpis?: string[];
  visual?: string;
  title?: string;
}

interface Layout {
  blocks?: LayoutBlock[];
}

const KPI_TYPES = new Set(['kpi', 'headline', 'kpiCard', 'big-number']);

export interface LayoutSubScores {
  kpisFirst: number;
  blockCount: number;
  priorityKpisCoverage: number;
  visualsAllowed: number;
}

export function evaluateLayoutFunction(input: ScorerInput): {
  score: number;
  subs: LayoutSubScores;
} {
  const layout = (input.agentOutput.layout ?? {}) as Layout;
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];

  const kpisFirst =
    blocks.length > 0 && KPI_TYPES.has(String(blocks[0].type ?? '').toLowerCase()) ? 1 : 0;

  let blockCount: number;
  if (blocks.length >= 3 && blocks.length <= 5) blockCount = 1;
  else if (blocks.length === 0) blockCount = 0;
  else if (blocks.length === 2 || blocks.length === 6) blockCount = 0.6;
  else blockCount = 0.3;

  const expectedKpis = input.briefing.expectedKpis ?? [];
  const layoutKpis = new Set<string>();
  for (const b of blocks) for (const k of b.kpis ?? []) layoutKpis.add(k);
  const covered = expectedKpis.filter((k) => layoutKpis.has(k)).length;
  const coverage = expectedKpis.length === 0 ? 1 : covered / expectedKpis.length;
  const priorityKpisCoverage = coverage >= 0.8 ? 1 : coverage;

  const expectedVisuals = new Set(input.briefing.expectedVisuals ?? []);
  const layoutVisuals = blocks.map((b) => b.visual).filter((v): v is string => Boolean(v));
  const visualsAllowed =
    layoutVisuals.length === 0
      ? 1
      : layoutVisuals.filter((v) => expectedVisuals.has(v)).length / layoutVisuals.length;

  const subs: LayoutSubScores = { kpisFirst, blockCount, priorityKpisCoverage, visualsAllowed };
  const score = (kpisFirst + blockCount + priorityKpisCoverage + visualsAllowed) / 4;
  return { score, subs };
}

const LayoutJudgeSchema = BaseJudgeOutputSchema.extend({
  narrativeFlow: z.number().min(0).max(1),
  grouping: z.number().min(0).max(1),
});

export interface LayoutCoherenceDeps {
  /** Override do runJudge (para testes). */
  runJudgeImpl?: typeof runJudge;
}

function evaluateLayout(deps: LayoutCoherenceDeps) {
  const judge = deps.runJudgeImpl ?? runJudge;
  return async (input: ScorerInput): Promise<ScoreResult> => {
    const { score: fnScore, subs } = evaluateLayoutFunction(input);

    const judgeOut = await judge({
      rubric: LAYOUT_COHERENCE_RUBRIC,
      prompt: `Persona: ${input.context.personaId}\nLayout JSON:\n${JSON.stringify(
        input.agentOutput.layout ?? {},
        null,
        2,
      )}`,
      schema: LayoutJudgeSchema,
      scorerName: 'layout_coherence',
    });

    const score = 0.7 * fnScore + 0.3 * judgeOut.score;
    return {
      score,
      rationale: `function=${fnScore.toFixed(2)}; judge=${judgeOut.score.toFixed(2)}: ${judgeOut.rationale}`,
      metadata: {
        functionScore: fnScore,
        judgeScore: judgeOut.score,
        subScores: subs,
        narrativeFlow: judgeOut.narrativeFlow,
        grouping: judgeOut.grouping,
      },
    };
  };
}

export function createLayoutCoherence(deps: LayoutCoherenceDeps = {}): Scorer {
  return createScorer({
    name: 'layout_coherence',
    kind: 'hybrid',
    run: evaluateLayout(deps),
  });
}

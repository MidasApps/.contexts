/**
 * Testes do scorer `layout_coherence` (Task 4).
 * Mocka `runJudge` para evitar chamadas reais a Vertex.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createLayoutCoherence, evaluateLayoutFunction } from '../layout-coherence';
import type { ScorerInput } from '../types';

const baseInput = (
  layout: unknown,
  overrides: Partial<ScorerInput['briefing']> = {},
): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId: 'cfo-securitizadora',
    clientId: 'vila-rosa',
    briefing: 'x',
    expectedKpis: ['pdd', 'inadimplencia', 'fluxo_caixa'],
    expectedVisuals: ['kpi', 'line', 'bar'],
    expectedTopics: [],
    ...overrides,
  },
  agentOutput: { layout },
  context: { clientId: 'vila-rosa', personaId: 'cfo-securitizadora', macroAsOf: '2026-04-01' },
});

const goodLayout = {
  blocks: [
    { id: 'b1', type: 'kpi', kpis: ['pdd', 'inadimplencia'], visual: 'kpi' },
    { id: 'b2', type: 'chart', kpis: ['fluxo_caixa'], visual: 'line' },
    { id: 'b3', type: 'chart', visual: 'bar' },
  ],
};

const badNoKpiFirst = {
  blocks: [
    { id: 'b1', type: 'chart', visual: 'line' },
    { id: 'b2', type: 'kpi', kpis: ['pdd'], visual: 'kpi' },
    { id: 'b3', type: 'chart', visual: 'bar' },
  ],
};

const badTooFewBlocks = {
  blocks: [{ id: 'b1', type: 'kpi', kpis: ['pdd'], visual: 'kpi' }],
};

const badForbiddenVisuals = {
  blocks: [
    { id: 'b1', type: 'kpi', kpis: ['pdd', 'inadimplencia'], visual: 'kpi' },
    { id: 'b2', type: 'chart', kpis: ['fluxo_caixa'], visual: 'pie' },
    { id: 'b3', type: 'chart', visual: 'radar' },
  ],
};

const badEmpty = { blocks: [] };

const fakeJudge = (score: number) =>
  vi.fn(async (args: { schema: z.ZodTypeAny }) => {
    return args.schema.parse({
      score,
      rationale: `mock judge ${score}`,
      narrativeFlow: score,
      grouping: score,
    });
  });

describe('layout_coherence (function part)', () => {
  it('layout bom → score function ≥0.85', () => {
    const { score, subs } = evaluateLayoutFunction(baseInput(goodLayout));
    expect(score).toBeGreaterThanOrEqual(0.85);
    expect(subs.kpisFirst).toBe(1);
  });

  it('KPI fora do topo → kpisFirst = 0', () => {
    const { subs } = evaluateLayoutFunction(baseInput(badNoKpiFirst));
    expect(subs.kpisFirst).toBe(0);
  });

  it('poucos blocos → blockCount baixo', () => {
    const { subs } = evaluateLayoutFunction(baseInput(badTooFewBlocks));
    expect(subs.blockCount).toBeLessThan(1);
  });

  it('visuais fora do permitido → visualsAllowed baixo', () => {
    const { subs } = evaluateLayoutFunction(baseInput(badForbiddenVisuals));
    expect(subs.visualsAllowed).toBeLessThan(0.7);
  });

  it('layout vazio → score baixo em todos', () => {
    const { score } = evaluateLayoutFunction(baseInput(badEmpty));
    expect(score).toBeLessThan(0.6);
  });
});

describe('layout_coherence (hybrid full)', () => {
  it('combina 0.7*function + 0.3*judge', async () => {
    const judgeImpl = fakeJudge(0.8);
    const scorer = createLayoutCoherence({ runJudgeImpl: judgeImpl as never });
    const out = await scorer.run(baseInput(goodLayout));
    expect(judgeImpl).toHaveBeenCalledTimes(1);
    expect(out.score).toBeGreaterThan(0.8);
    expect(out.metadata?.functionScore).toBeDefined();
    expect(out.metadata?.judgeScore).toBe(0.8);
  });

  it('layout ruim com judge severo → score baixo', async () => {
    const scorer = createLayoutCoherence({ runJudgeImpl: fakeJudge(0.2) as never });
    const out = await scorer.run(baseInput(badEmpty));
    expect(out.score).toBeLessThan(0.4);
  });
});

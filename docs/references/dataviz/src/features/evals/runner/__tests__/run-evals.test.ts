import { describe, expect, it, beforeEach } from 'vitest';
import { runEvals, percentile, parseArgs } from '../run-evals';
import { clearCache } from '../cache';
import type { BriefingFixture, Scorer } from '../../scorers/types';
import type { EvalRun } from '../../scorers/types';

const fixtures: BriefingFixture[] = [
  {
    id: 'f1',
    templateId: 1,
    personaId: 'cfo-securitizadora',
    clientId: 'vila-rosa',
    briefing: 'b1',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  {
    id: 'f2',
    templateId: 2,
    personaId: 'controller',
    clientId: 'vila-rosa',
    briefing: 'b2',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  {
    id: 'f3',
    templateId: 3,
    personaId: 'analista-credito',
    clientId: 'vila-rosa',
    briefing: 'b3',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
];

function makeStubScorer(name: string, scores: number[]): Scorer {
  let i = 0;
  return {
    name,
    kind: 'function',
    run: async () => {
      const score = scores[i % scores.length];
      i += 1;
      return { score, rationale: `${name}-${score}`, metadata: { tokensIn: 10, tokensOut: 5, costUsd: 0.0001 } };
    },
  };
}

describe('runner/percentile', () => {
  it('p50 of [1,2,3,4,5] is 3', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });
  it('p95 of [1..100] is ~95', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBeGreaterThanOrEqual(95);
    expect(percentile(arr, 95)).toBeLessThanOrEqual(96);
  });
  it('empty list returns 0', () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe('runner/runEvals', () => {
  beforeEach(() => clearCache());

  it('runs scorers over a 3-entry dataset and aggregates p50/p95', async () => {
    const scorers = {
      sql_correctness: makeStubScorer('sql_correctness', [0.6, 0.8, 1.0]),
      persona_fit: makeStubScorer('persona_fit', [0.5, 0.5, 0.9]),
    };

    const summary = await runEvals(
      {
        suite: 'smoke',
        loadDataset: () => fixtures,
        scorers,
        dryRun: true,
        glossaryVersion: 'gv',
        regulatoryPackVersion: 'rv',
        judgeModelVersion: 'jv',
      },
    );

    expect(summary.totalFixtures).toBe(3);
    expect(summary.totalScorers).toBe(2);
    expect(summary.results).toHaveLength(6); // 3 fixtures x 2 scorers
    expect(summary.suite).toBe('smoke');
    expect(summary.judgeModelVersion).toBe('jv');
    // p50 of sorted [0.6, 0.8, 1.0] = 0.8
    expect(summary.totals.p50.sql_correctness).toBeCloseTo(0.8, 5);
    // sum cost = 6 * 0.0001
    expect(summary.totals.costUsd).toBeCloseTo(0.0006, 5);
  });

  it('cache hit avoids second scorer invocation for same key', async () => {
    let invocations = 0;
    const scorer: Scorer = {
      name: 's',
      kind: 'function',
      run: async () => {
        invocations += 1;
        return { score: 0.7 };
      },
    };
    const single: BriefingFixture[] = [fixtures[0]];

    await runEvals(
      {
        suite: 'smoke',
        loadDataset: () => single,
        scorers: { s: scorer },
        dryRun: true,
        glossaryVersion: 'gv',
        regulatoryPackVersion: 'rv',
        judgeModelVersion: 'jv',
      },
    );
    expect(invocations).toBe(1);

    await runEvals(
      {
        suite: 'smoke',
        loadDataset: () => single,
        scorers: { s: scorer },
        dryRun: true,
        glossaryVersion: 'gv',
        regulatoryPackVersion: 'rv',
        judgeModelVersion: 'jv',
      },
    );
    // second run should hit cache
    expect(invocations).toBe(1);
  });

  it('stamps clientId/personaId from fixture context (multi-tenancy)', async () => {
    const summary = await runEvals(
      {
        suite: 'smoke',
        loadDataset: () => fixtures,
        scorers: { x: makeStubScorer('x', [0.5]) },
        dryRun: true,
      },
    );
    expect(summary.results.map((r) => r.clientId).sort()).toEqual(['vila-rosa', 'vila-rosa', 'vila-rosa']);
    expect(summary.results.every((r) => r.personaId.length > 0)).toBe(true);
  });
});

describe('runner/parseArgs (a6-ia-05)', () => {
  it('--persist desativa dryRun; --dry-run ativa; default indefinido', () => {
    expect(parseArgs(['--suite=smoke']).dryRun).toBeUndefined();
    expect(parseArgs(['--persist']).dryRun).toBe(false);
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });
});

describe('runner/persistência (a6-ia-05)', () => {
  beforeEach(() => clearCache());

  it('persiste via dep injetada quando dryRun=false', async () => {
    const runs: EvalRun[] = [];
    await runEvals(
      { suite: 'smoke', loadDataset: () => fixtures, scorers: { x: makeStubScorer('x', [0.5]) }, dryRun: false, glossaryVersion: 'gv', regulatoryPackVersion: 'rv', judgeModelVersion: 'jv' },
      { persist: async ({ run }) => { runs.push(run); } },
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].results).toHaveLength(3);
  });

  it('NÃO persiste quando dryRun=true', async () => {
    const runs: EvalRun[] = [];
    await runEvals(
      { suite: 'smoke', loadDataset: () => fixtures, scorers: { x: makeStubScorer('x', [0.5]) }, dryRun: true },
      { persist: async ({ run }) => { runs.push(run); } },
    );
    expect(runs).toHaveLength(0);
  });
});

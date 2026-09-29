/**
 * Sprint 3.D, Task 14 — drift detector tests (Bulk F5: Firestore-backed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeDoc {
  id: string;
  ref: { id: string };
  data: () => Record<string, unknown>;
}

interface SetCall {
  ref: { id: string };
  data: Record<string, unknown>;
}

const makeFirestoreMock = () => {
  const collections = new Map<string, FakeDoc[]>();
  const setCalls: SetCall[] = [];
  const commitFn = vi.fn(async () => undefined);
  let docCounter = 0;

  const collectionFn = (name: string) => {
    interface Filter { field: string; op: string; value: unknown }
    const buildQuery = (filters: Filter[]) => ({
      where: (field: string, op: string, value: unknown) =>
        buildQuery([...filters, { field, op, value }]),
      get: vi.fn(async () => {
        const all = collections.get(name) ?? [];
        const docs = all.filter((d) => {
          const data = d.data();
          for (const f of filters) {
            const v = data[f.field];
            if (f.op === '==' && v !== f.value) return false;
            if (f.op === '>' && !(v instanceof Date && f.value instanceof Date && v > f.value)) {
              return false;
            }
          }
          return true;
        });
        return { docs };
      }),
    });
    return {
      ...buildQuery([]),
      doc: () => ({ id: `auto-${docCounter++}` }),
    };
  };

  const batchFn = () => ({
    set: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
      setCalls.push({ ref, data });
    }),
    commit: commitFn,
  });

  return {
    db: { collection: collectionFn, batch: batchFn },
    state: { collections, setCalls, commitFn },
  };
};

let firestoreMock = makeFirestoreMock();

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => firestoreMock.db,
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (d: Date) => ({ _date: d, toDate: () => d }),
  },
}));

beforeEach(() => {
  firestoreMock = makeFirestoreMock();
  vi.resetModules();
});

import type { BriefingFixture, EvalRun } from '../../scorers/types';
// `detectDrift` já é importado dinamicamente por teste abaixo (padrão do
// arquivo, necessário para respeitar o `vi.resetModules()` do beforeEach).
import { shouldPersistFromEnv } from '../detect-drift';

function fx(id: string, gold: number): BriefingFixture {
  return {
    id,
    templateId: 1,
    personaId: 'cfo-securitizadora',
    clientId: 'vila-rosa',
    briefing: 'b',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
    goldScores: { sql_correctness: gold },
  };
}

function judgeRun(scoresById: Record<string, number>): EvalRun {
  return {
    runId: 'r',
    startedAt: '2026-05-04T00:00:00Z',
    finishedAt: '2026-05-04T00:01:00Z',
    suite: 'gold',
    judgeModelVersion: 'gemini-2.5-pro',
    glossaryVersion: 'v0',
    regulatoryPackVersion: 'v0',
    results: Object.entries(scoresById).map(([fixtureId, score]) => ({
      fixtureId,
      scorerName: 'sql_correctness',
      score,
      durationMs: 1,
      clientId: 'vila-rosa',
      personaId: 'cfo-securitizadora',
    })),
    totals: { p50: {}, p95: {}, costUsd: 0 },
  };
}

describe('detectDrift', () => {
  it('flags 5 alerts when delta=0.15 in 5 fixtures (threshold 0.1)', async () => {
    const ids = ['gold-001', 'gold-002', 'gold-003', 'gold-004', 'gold-005'];
    const fixtures = ids.map((id) => fx(id, 0.5));
    const judge = judgeRun(Object.fromEntries(ids.map((id) => [id, 0.65])));

    const { detectDrift } = await import('../detect-drift');
    const result = await detectDrift({
      judgeRun: judge,
      goldDataset: fixtures,
      thresholdAbs: 0.1,
    });
    expect(result.rows).toHaveLength(5);
    expect(result.alertCount).toBe(5);
    for (const r of result.rows) {
      expect(r.alert).toBe(true);
      expect(r.delta).toBeCloseTo(0.15, 5);
    }
  });

  it('produces no alert when delta=0.05', async () => {
    const fixtures = [fx('gold-001', 0.5)];
    const judge = judgeRun({ 'gold-001': 0.55 });
    const { detectDrift } = await import('../detect-drift');
    const result = await detectDrift({
      judgeRun: judge,
      goldDataset: fixtures,
      thresholdAbs: 0.1,
    });
    expect(result.alertCount).toBe(0);
    expect(result.rows[0].alert).toBe(false);
  });

  it('computes rolling 3m avg delta from Firestore history', async () => {
    const fixtures = [fx('gold-001', 0.5)];
    const judge = judgeRun({ 'gold-001': 0.65 });
    // Seed two recent docs: deltas 0.10 and 0.14 -> avg 0.12.
    const recent = new Date('2026-04-01T00:00:00Z');
    firestoreMock.state.collections.set('judgeDrift', [
      {
        id: 'h1',
        ref: { id: 'h1' },
        data: () => ({
          detectedAt: recent,
          scorerName: 'sql_correctness',
          fixtureId: 'gold-001',
          delta: 0.1,
        }),
      },
      {
        id: 'h2',
        ref: { id: 'h2' },
        data: () => ({
          detectedAt: recent,
          scorerName: 'sql_correctness',
          fixtureId: 'gold-001',
          delta: 0.14,
        }),
      },
    ]);

    const { detectDrift } = await import('../detect-drift');
    const result = await detectDrift({
      judgeRun: judge,
      goldDataset: fixtures,
      thresholdAbs: 0.1,
      persist: false,
      now: new Date('2026-05-04T00:00:00Z'),
    });
    expect(result.rows[0].rolling3mAvgDelta).toBeCloseTo(0.12, 5);
  });

  it('persists rows to judgeDrift collection via WriteBatch when persist=true', async () => {
    const fixtures = [fx('gold-001', 0.5)];
    const judge = judgeRun({ 'gold-001': 0.7 });

    const { detectDrift } = await import('../detect-drift');
    await detectDrift({
      judgeRun: judge,
      goldDataset: fixtures,
      thresholdAbs: 0.1,
      persist: true,
      now: new Date('2026-05-04T00:00:00Z'),
    });

    expect(firestoreMock.state.setCalls).toHaveLength(1);
    expect(firestoreMock.state.commitFn).toHaveBeenCalledTimes(1);
    const data = firestoreMock.state.setCalls[0].data;
    expect(data.fixtureId).toBe('gold-001');
    expect(data.scorerName).toBe('sql_correctness');
    expect(data.judgeModelVersion).toBe('gemini-2.5-pro');
    expect(data.alert).toBe(true);
    expect(data.delta).toBeCloseTo(0.2, 5);
  });

  it('skips persist no-ops when no rows to write', async () => {
    const judge = judgeRun({}); // empty results
    const { detectDrift } = await import('../detect-drift');
    await detectDrift({
      judgeRun: judge,
      goldDataset: [],
      thresholdAbs: 0.1,
      persist: true,
    });
    expect(firestoreMock.state.commitFn).not.toHaveBeenCalled();
  });
});

describe('drift/shouldPersistFromEnv (a6-ia-05)', () => {
  it('default false; --persist ou EVAL_DRIFT_PERSIST habilita', () => {
    expect(shouldPersistFromEnv([], {})).toBe(false);
    expect(shouldPersistFromEnv(['--persist'], {})).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: '1' })).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: 'true' })).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: '0' })).toBe(false);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Firestore-backed persist tests (Bulk F5 / ADR-0013).
 *
 * Mock surface:
 *   db.collection(name).doc() -> { ref }
 *   db.batch().set(ref, data).commit()
 */

interface FakeDocRef {
  id: string;
}

interface SetCall {
  ref: FakeDocRef;
  data: Record<string, unknown>;
}

const makeFirestoreMock = () => {
  const setCalls: SetCall[] = [];
  const commitFn = vi.fn(async () => undefined);
  let docCounter = 0;

  const collectionFn = (_name: string) => ({
    doc: () => ({ id: `auto-${docCounter++}` }),
  });

  const batchFn = () => ({
    set: vi.fn((ref: FakeDocRef, data: Record<string, unknown>) => {
      setCalls.push({ ref, data });
    }),
    commit: commitFn,
  });

  return {
    db: { collection: collectionFn, batch: batchFn },
    state: { setCalls, commitFn },
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

import type { EvalRun } from '../../scorers/types';

function makeRun(): EvalRun {
  return {
    runId: 'run-1',
    startedAt: '2026-05-04T00:00:00Z',
    finishedAt: '2026-05-04T00:01:00Z',
    suite: 'smoke',
    judgeModelVersion: 'gemini-2.5-pro',
    glossaryVersion: 'v1',
    regulatoryPackVersion: 'v1',
    results: [
      {
        fixtureId: 'smoke-001',
        scorerName: 'sql_correctness',
        score: 0.9,
        rationale: 'good',
        durationMs: 12,
        tokensIn: 100,
        tokensOut: 30,
        costUsd: 0.001,
        clientId: 'vila-rosa',
        personaId: 'cfo-securitizadora',
      },
      {
        fixtureId: 'smoke-001',
        scorerName: 'persona_fit',
        score: 0.8,
        durationMs: 9,
        clientId: 'vila-rosa',
        personaId: 'cfo-securitizadora',
      },
    ],
    totals: { p50: { sql_correctness: 0.9 }, p95: { sql_correctness: 0.9 }, costUsd: 0.001 },
  };
}

describe('runner/persist (Firestore)', () => {
  it('writes one Firestore doc per result via WriteBatch.set', async () => {
    const { persistEvalRun } = await import('../persist');
    await persistEvalRun({ run: makeRun() });

    expect(firestoreMock.state.setCalls).toHaveLength(2);
    expect(firestoreMock.state.commitFn).toHaveBeenCalledTimes(1);

    const first = firestoreMock.state.setCalls[0].data;
    expect(first.runId).toBe('run-1');
    expect(first.fixtureId).toBe('smoke-001');
    expect(first.scorerName).toBe('sql_correctness');
    expect(first.score).toBe(0.9);
    expect(first.suite).toBe('smoke');
    expect(first.judgeModelVersion).toBe('gemini-2.5-pro');
    expect(first.tokensIn).toBe(100);
    expect(first.clientId).toBe('vila-rosa');
    expect(first.personaId).toBe('cfo-securitizadora');

    const second = firestoreMock.state.setCalls[1].data;
    expect(second.scorerName).toBe('persona_fit');
    expect(second.tokensIn).toBeNull();
    expect(second.tokensOut).toBeNull();
    expect(second.costUsd).toBeNull();
    expect(second.rationale).toBeNull();
  });

  it('converts startedAt / finishedAt ISO strings to Timestamp.fromDate', async () => {
    const { persistEvalRun } = await import('../persist');
    await persistEvalRun({ run: makeRun() });

    const data = firestoreMock.state.setCalls[0].data as {
      startedAt: { _date: Date };
      finishedAt: { _date: Date };
    };
    expect(data.startedAt._date).toEqual(new Date('2026-05-04T00:00:00Z'));
    expect(data.finishedAt._date).toEqual(new Date('2026-05-04T00:01:00Z'));
  });

  it('chunks WriteBatch at 500 ops per commit', async () => {
    const run = makeRun();
    const base = run.results[0];
    run.results = Array.from({ length: 1200 }, (_, i) => ({
      ...base,
      fixtureId: `smoke-${i}`,
    }));

    const { persistEvalRun } = await import('../persist');
    await persistEvalRun({ run });

    expect(firestoreMock.state.setCalls).toHaveLength(1200);
    // 1200 / 500 = ceil(2.4) -> 3 batches
    expect(firestoreMock.state.commitFn).toHaveBeenCalledTimes(3);
  });

  it('no-ops when results is empty (no batch commit)', async () => {
    const run = makeRun();
    run.results = [];
    const { persistEvalRun } = await import('../persist');
    await persistEvalRun({ run });
    expect(firestoreMock.state.setCalls).toHaveLength(0);
    expect(firestoreMock.state.commitFn).not.toHaveBeenCalled();
  });
});

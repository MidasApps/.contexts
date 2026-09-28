/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Call { method: 'where' | 'orderBy'; field: string; op: string }

const { requireAdminMock, estado: state } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  estado: { calls: [] as Call[], docs: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));

/** Firestore de mentira que só grava a forma da consulta. */
vi.mock('@/shared/lib/firebase/admin', () => {
  const query = {
    where(field: string, op: string) {
      state.calls.push({ method: 'where', field, op });
      return query;
    },
    orderBy(field: string, op = 'asc') {
      state.calls.push({ method: 'orderBy', field, op });
      return query;
    },
    async get() {
      return { docs: state.docs.map((d) => ({ data: () => d })) };
    },
  };
  return { getDb: () => ({ collection: () => query }) };
});

import { GET } from '../route';
import type { EvalRunsResponse } from '../route';

interface DeclaredIndex {
  collectionGroup: string;
  fields: Array<{ fieldPath: string; order?: 'ASCENDING' | 'DESCENDING' }>;
}

const indices = (
  JSON.parse(readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf8')) as {
    indexes: DeclaredIndex[];
  }
).indexes.filter((i) => i.collectionGroup === 'evalRuns');

/**
 * Igualdades primeiro, depois o campo do range na direção da ordenação — a
 * forma que o Firestore exige de um índice composto. Sem `orderBy`, o range
 * vale como ASC.
 */
function indexThatServes(calls: Call[]): DeclaredIndex | undefined {
  const equalities = calls.filter((c) => c.method === 'where' && c.op === '==').map((c) => c.field);
  const range = calls.find((c) => c.method === 'where' && c.op !== '==');
  if (!range) return undefined;
  const ordem = calls.find((c) => c.method === 'orderBy' && c.field === range.field);
  const direction = ordem?.op === 'desc' ? 'DESCENDING' : 'ASCENDING';
  return indices.find((i) => {
    const last = i.fields.at(-1);
    const rest = i.fields.slice(0, -1).map((f) => f.fieldPath);
    return last?.fieldPath === range.field
      && last.order === direction
      && rest.length === equalities.length
      && equalities.every((field) => rest.includes(field));
  });
}

const run = (scorerName: string, judgeModelVersion: string, score: number) => ({
  suite: 'smoke', scorerName, judgeModelVersion, personaId: 'p1', clientId: 'c1', score,
});

async function runQuery(query = ''): Promise<EvalRunsResponse> {
  const res = await GET(new Request(`http://localhost/api/admin/eval-runs?suite=smoke${query}`));
  return (await res.json()) as EvalRunsResponse;
}

describe('GET /api/admin/eval-runs', () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ uid: 'admin' });
    state.calls = [];
    state.docs = [run('faithfulness', 'judge-a', 0.8), run('relevance', 'judge-b', 0.6)];
  });

  /**
   * O defeito: `startedAt >=` sem `orderBy` pede `startedAt` ASC, o índice
   * declarado é DESC, e a rota caía sempre no stub (FAILED_PRECONDITION).
   */
  it('builds a query that a declared composite index serves', async () => {
    const body = await runQuery();
    expect(body.stub).toBeUndefined();
    expect(indexThatServes(state.calls)).toBeDefined();
  });

  it('keeps the query on the same index when filters are passed', async () => {
    await runQuery('&judgeModelVersion=judge-a&clientId=c1&personaId=p1');
    expect(indexThatServes(state.calls)).toBeDefined();
  });

  it('applies the judge, client and persona filters to the rows', async () => {
    const byJudge = await runQuery('&judgeModelVersion=judge-a');
    expect(byJudge.rows.map((r) => r.scorerName)).toEqual(['faithfulness']);

    const otherClient = await runQuery('&clientId=c2');
    expect(otherClient.rows).toEqual([]);

    const samePersona = await runQuery('&personaId=p1');
    expect(samePersona.rows).toHaveLength(2);
  });
});

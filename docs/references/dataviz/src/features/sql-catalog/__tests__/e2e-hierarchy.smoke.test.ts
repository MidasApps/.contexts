/* @vitest-environment node */
/**
 * Sprint 3.C — Task 11.
 *
 * Smoke E2E: valida hierarquia curated > recall > empty no fluxo do tool
 * `bq.list_validated_queries`. Setup com 10 briefings sintéticos:
 *   - 4 retornam curated (catálogo seedado).
 *   - 4 retornam recall (vector store seedado mock).
 *   - 2 retornam empty (sem match em nenhum dos níveis).
 *
 * Asserts (spec lines 389-393):
 *   - 4 curated, 4 recall, 2 empty;
 *   - combined hit rate (curated + recall) / total >= 0.55.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';

const { listByClientMock, recallMock } = vi.hoisted(() => ({
  listByClientMock: vi.fn(),
  recallMock: vi.fn(),
}));

vi.mock('@/features/sql-catalog/repository', async () => {
  const actual = await vi.importActual<typeof import('@/features/sql-catalog/repository')>(
    '@/features/sql-catalog/repository',
  );
  return {
    ...actual,
    createRepository: () => ({
      listByClient: listByClientMock,
      countByClient: vi.fn(),
      getById: vi.fn(),
      updateFields: vi.fn(),
      insertDraft: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      incrementUse: vi.fn(),
      markNeedsRevalidation: vi.fn(),
      findByHash: vi.fn(),
    }),
  };
});

vi.mock('@/features/ai-agents/tools/recall-fallback', () => ({
  recallSqlFallback: recallMock,
}));

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    query: vi.fn().mockResolvedValue([[]]),
  }),
}));

import { createBqListValidatedQueriesTool } from '@/features/ai-agents/tools/bq-list-validated-queries';
import type { ToolContext } from '@/features/ai-agents/tools/tool-context';

const ctx: ToolContext = {
  dataset: 'liquid_om',
  filters: {
    dataBase: '2026-04-30',
    dateRange: { start: '2026-01-01', end: '2026-04-30' },
    projetos: [],
    advancedFilters: {},
    viewMode: 'snapshot',
    compareEnabled: false,
  } as unknown as ToolContext['filters'],
  sessionId: 'sess-test',
  clientId: 'OM',
  personaId: 'originador',
};

const BRIEFINGS = [
  // 4 com curated match
  'safra OM curated #1',
  'safra OM curated #2',
  'safra OM curated #3',
  'safra OM curated #4',
  // 4 com recall match
  'inadimplencia recall #1',
  'inadimplencia recall #2',
  'concentracao recall #3',
  'rating recall #4',
  // 2 sem match
  'briefing sem match #1',
  'briefing sem match #2',
];

function makeCuratedRow(id: string, intent: string): SqlCatalogRow {
  return {
    id,
    intent,
    sql: `SELECT '${id}'`,
    sql_hash: `hash-${id}`,
    schema_snapshot: null,
    client_id: 'OM',
    persona_id: 'originador',
    tags: null,
    quality_score: 0.85,
    curated_by: 'admin',
    curated_at: '2026-05-01',
    glossary_version: 'v',
    regulatory_pack_version: 'r1',
    status: 'approved',
    use_count: 5,
    last_used_at: null,
    created_at: '2026-04-01',
    updated_at: '2026-05-01',
  };
}

describe('sql-catalog hierarchy E2E smoke', () => {
  beforeEach(() => {
    listByClientMock.mockReset();
    recallMock.mockReset();
  });

  it('4 curated + 4 recall + 2 empty across 10 briefings; combined hit rate >= 0.55', async () => {
    // For each briefing, set up the mocks based on its expected source.
    listByClientMock.mockImplementation(async ({ }: { clientId: string }) => {
      // Returns curated only when the current briefing context says so. Driver below sets this per call.
      return curatedQueue.shift() ?? [];
    });
    recallMock.mockImplementation(async () => {
      return recallQueue.shift() ?? [];
    });

    // Pre-populate per-briefing queues:
    const curatedQueue: SqlCatalogRow[][] = [];
    const recallQueue: { id: string; sql: string; intent: string; score: number }[][] = [];
    for (let i = 0; i < BRIEFINGS.length; i++) {
      if (i < 4) {
        curatedQueue.push([makeCuratedRow(`c-${i}`, BRIEFINGS[i])]);
        recallQueue.push([]);
      } else if (i < 8) {
        curatedQueue.push([]);
        recallQueue.push([
          { id: `r-${i}`, sql: `SELECT 'r-${i}'`, intent: BRIEFINGS[i], score: 0.8 },
        ]);
      } else {
        curatedQueue.push([]);
        recallQueue.push([]);
      }
    }

    const tool = createBqListValidatedQueriesTool(ctx);
    const execute = tool.execute as unknown as (
      input: unknown,
      options: unknown,
    ) => Promise<{
      items: { source: 'curated' | 'recall' }[];
      curatedHits: number;
      recallHits: number;
    }>;

    let curatedTotal = 0;
    let recallTotal = 0;
    let emptyTotal = 0;
    for (const briefing of BRIEFINGS) {
      const out = await execute(
        { intent: briefing, personaId: null, tags: null, topK: 5 },
        { toolCallId: 't', messages: [] },
      );
      if (out.curatedHits > 0) curatedTotal += 1;
      else if (out.recallHits > 0) recallTotal += 1;
      else emptyTotal += 1;
    }

    expect(curatedTotal).toBe(4);
    expect(recallTotal).toBe(4);
    expect(emptyTotal).toBe(2);
    const combined = (curatedTotal + recallTotal) / BRIEFINGS.length;
    expect(combined).toBeGreaterThanOrEqual(0.55);
  });
});

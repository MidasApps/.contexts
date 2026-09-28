import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BigQuery } from '@google-cloud/bigquery';
import type { SqlCatalogRepository } from '@/features/sql-catalog/repository';
import { seedCatalogFromLogs } from '../seed-catalog-from-logs';

/**
 * Bulk F4 (ADR-0013): seed sources from BigQuery `liquid_meta.sql_generations`
 * but persists to Firestore via `repository.findByHash` / `repository.insertDraft`.
 * Tests inject a stub repo plus a stub BQ client.
 */

function makeMockBq(rows: unknown[]) {
  const queryFn = vi.fn(async (_call: { query: string; params: Record<string, unknown> }) => {
    return [rows];
  });
  return { client: { query: queryFn } as unknown as BigQuery, queryFn };
}

function makeFakeRepo(opts: { existingHashes?: Set<string> } = {}): {
  repo: SqlCatalogRepository;
  inserts: { sqlHash: string; clientId: string }[];
  findByHashCalls: { sqlHash: string; clientId: string }[];
} {
  const existing = opts.existingHashes ?? new Set<string>();
  const inserts: { sqlHash: string; clientId: string }[] = [];
  const findByHashCalls: { sqlHash: string; clientId: string }[] = [];
  let auto = 0;

  const repo: SqlCatalogRepository = {
    insertDraft: vi.fn(async ({ sql, clientId }) => {
      // Compute a deterministic hash mirror so that tests can correlate.
      const sqlHash = `hash-${++auto}`;
      inserts.push({ sqlHash, clientId });
      return { id: `id-${auto}`, sqlHash };
    }),
    findByHash: vi.fn(async ({ sqlHash, clientId }) => {
      findByHashCalls.push({ sqlHash, clientId });
      if (existing.has(`${clientId}::${sqlHash}`)) {
        return {
          id: 'existing-id',
          intent: '',
          sql: '',
          sql_hash: sqlHash,
          schema_snapshot: null,
          client_id: clientId,
          persona_id: null,
          tags: null,
          quality_score: null,
          curated_by: null,
          curated_at: null,
          glossary_version: null,
          regulatory_pack_version: null,
          status: 'approved' as const,
          use_count: 0,
          last_used_at: null,
          created_at: '',
          updated_at: '',
        };
      }
      return null;
    }),
    listByClient: vi.fn(),
    countByClient: vi.fn(),
    getById: vi.fn(),
    updateFields: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    incrementUse: vi.fn(),
    markNeedsRevalidation: vi.fn(),
  };

  return { repo, inserts, findByHashCalls };
}

describe('seedCatalogFromLogs (Firestore-backed)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dedups by canonicalSqlHash + clientId before inserting', async () => {
    const rows: unknown[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({
        final_sql: `SELECT ${i} FROM contratos`,
        intent: `intent ${i}`,
        client_id: 'OM',
        persona_id: 'originador',
        reuse: 5,
        avg_latency: 100,
        schema_snapshot: { tables: [] },
      });
    }
    // 20 dups (whitespace-only differences → same canonical hash)
    for (let i = 0; i < 20; i++) {
      rows.push({
        final_sql: `  SELECT  ${i}\n FROM contratos `,
        intent: `dup ${i}`,
        client_id: 'OM',
        persona_id: 'originador',
        reuse: 1,
        avg_latency: 200,
        schema_snapshot: null,
      });
    }
    const { client } = makeMockBq(rows);
    const { repo, inserts } = makeFakeRepo();
    const res = await seedCatalogFromLogs({
      days: 30,
      top: 100,
      dryRun: false,
      bqClient: client,
      repository: repo,
    });
    expect(res.scanned).toBe(50);
    expect(res.unique).toBe(30);
    expect(res.inserted).toBe(30);
    expect(inserts).toHaveLength(30);
    expect(inserts.every((i) => i.clientId === 'OM')).toBe(true);
  });

  it('skips inserts when --dry-run is set', async () => {
    const rows = [
      {
        final_sql: 'SELECT 1',
        intent: 'i',
        client_id: 'OM',
        persona_id: null,
        reuse: 1,
        avg_latency: 100,
        schema_snapshot: null,
      },
    ];
    const { client } = makeMockBq(rows);
    const { repo, inserts } = makeFakeRepo();
    const res = await seedCatalogFromLogs({
      days: 30,
      top: 10,
      dryRun: true,
      bqClient: client,
      repository: repo,
    });
    expect(res.dryRun).toBe(true);
    expect(res.inserted).toBe(0);
    expect(res.unique).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it('skips rows already present in catalog (findByHash returns existing)', async () => {
    const rows = [
      {
        final_sql: 'SELECT existing',
        intent: 'x',
        client_id: 'OM',
        persona_id: null,
        reuse: 5,
        avg_latency: 100,
        schema_snapshot: null,
      },
    ];
    const { client } = makeMockBq(rows);
    // Pre-populate the existing hash for OM. The seed script computes
    // canonicalSqlHash('SELECT existing') for the lookup; we mark all hashes
    // for OM as existing by having findByHash always return a match.
    const repo: SqlCatalogRepository = {
      insertDraft: vi.fn(),
      findByHash: vi.fn(async () => ({
        id: 'existing-id',
        intent: '',
        sql: '',
        sql_hash: 'h',
        schema_snapshot: null,
        client_id: 'OM',
        persona_id: null,
        tags: null,
        quality_score: null,
        curated_by: null,
        curated_at: null,
        glossary_version: null,
        regulatory_pack_version: null,
        status: 'approved' as const,
        use_count: 0,
        last_used_at: null,
        created_at: '',
        updated_at: '',
      })),
      listByClient: vi.fn(),
      countByClient: vi.fn(),
      getById: vi.fn(),
      updateFields: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      incrementUse: vi.fn(),
      markNeedsRevalidation: vi.fn(),
    };
    const res = await seedCatalogFromLogs({
      days: 30,
      top: 10,
      dryRun: false,
      bqClient: client,
      repository: repo,
    });
    expect(res.unique).toBe(1);
    expect(res.inserted).toBe(0);
    expect(repo.insertDraft).not.toHaveBeenCalled();
  });

  it('honors --client filter when provided in BQ source query', async () => {
    const { client, queryFn } = makeMockBq([]);
    const { repo } = makeFakeRepo();
    await seedCatalogFromLogs({
      days: 30,
      top: 10,
      client: 'OM',
      dryRun: true,
      bqClient: client,
      repository: repo,
    });
    expect(queryFn).toHaveBeenCalledTimes(1);
    const call = queryFn.mock.calls[0][0] as { query: string; params: Record<string, unknown> };
    expect(call.params.clientFilter).toBe('OM');
    expect(call.query).toContain('client_id = @clientFilter');
  });
});

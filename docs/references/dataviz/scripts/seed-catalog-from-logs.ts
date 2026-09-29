#!/usr/bin/env tsx
/**
 * Bootstrap do catálogo SQL (`sqlCatalog` Firestore) a partir de logs em
 * BigQuery (`liquid_meta.sql_generations`). (ADR-0009 §Bootstrap / Bulk F4
 * ADR-0013).
 *
 * Fonte: `liquid_meta.sql_generations` permanece em BigQuery — é dataset de
 * cliente legítimo. Destino: collection `sqlCatalog` no Firestore via
 * `createRepository()` (ADR-0013).
 *
 * Uso:
 *   pnpm tsx scripts/seed-catalog-from-logs.ts --days=30 --top=100 --client=OM [--allow-prod]
 *   pnpm tsx scripts/seed-catalog-from-logs.ts --days=30 --top=50 --dry-run
 *
 * Args:
 *   --days=N     janela em dias (default 30)
 *   --top=N      LIMIT da query (default 100)
 *   --client=ID  filtra por client_id (opcional; se ausente, todos os tenants)
 *   --dry-run    apenas conta, não insere
 *   --allow-prod exigido para gravar no banco `dataviz` (produção)
 *
 * Grava por padrão (sem `--dry-run`). Por isso a trava de produção trata toda
 * execução sem `--dry-run` como escrita.
 */
import type { BigQuery } from '@google-cloud/bigquery';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { canonicalSqlHash } from '@/features/sql-catalog/hash';
import {
  createRepository,
  type SqlCatalogRepository,
} from '@/features/sql-catalog/repository';

export interface SeedOptions {
  days: number;
  top: number;
  client?: string;
  dryRun: boolean;
  /** Override BigQuery source client (test-only). */
  bqClient?: BigQuery;
  /** Override repository (test-only). */
  repository?: SqlCatalogRepository;
  logger?: (msg: string) => void;
}

interface LogRow {
  final_sql: string;
  intent: string | null;
  client_id: string;
  persona_id: string | null;
  reuse: number;
  avg_latency: number;
  schema_snapshot: Record<string, unknown> | null;
}

export interface SeedResult {
  scanned: number;
  unique: number;
  inserted: number;
  duplicates: number;
  dryRun: boolean;
}

const SOURCE_QUERY = `
  SELECT
    final_sql,
    intent,
    client_id,
    persona_id,
    COUNT(*) AS reuse,
    AVG(latency_ms) AS avg_latency,
    ANY_VALUE(schema_snapshot) AS schema_snapshot
  FROM dataviz_meta.sql_generations
  WHERE success = TRUE
    AND rows > 0
    AND latency_ms < 10000
    AND repair_attempts <= 1
    AND bytes_billed < 2147483648
    AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
    \${CLIENT_FILTER}
  GROUP BY final_sql, intent, client_id, persona_id
  ORDER BY reuse DESC, avg_latency ASC
  LIMIT @top
`;

export async function seedCatalogFromLogs(opts: SeedOptions): Promise<SeedResult> {
  const log = opts.logger ?? (() => {});
  const bqClient = opts.bqClient ?? getBigQueryClient();
  const repo = opts.repository ?? createRepository();

  const params: Record<string, unknown> = { days: opts.days, top: opts.top };
  let clientFilter = '';
  if (opts.client) {
    clientFilter = 'AND client_id = @clientFilter';
    params.clientFilter = opts.client;
  }
  const query = SOURCE_QUERY.replace('${CLIENT_FILTER}', clientFilter);

  log(`[seed-catalog] querying logs: days=${opts.days} top=${opts.top} client=${opts.client ?? 'ALL'}`);
  const [rowsRaw] = await bqClient.query({ query, useLegacySql: false, params });
  const rows = (rowsRaw ?? []) as LogRow[];
  log(`[seed-catalog] scanned ${rows.length} candidate rows.`);

  // Dedup por canonicalSqlHash + clientId (mesmo SQL em tenants diferentes
  // pode coexistir; mas dentro do mesmo tenant nunca duplica).
  const seen = new Set<string>();
  const unique: LogRow[] = [];
  for (const r of rows) {
    if (!r.final_sql || !r.client_id) continue;
    const key = `${r.client_id}::${canonicalSqlHash(r.final_sql)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  log(`[seed-catalog] ${unique.length} unique after canonical hash dedup.`);

  if (opts.dryRun) {
    log('[seed-catalog] DRY RUN — not inserting.');
    return {
      scanned: rows.length,
      unique: unique.length,
      inserted: 0,
      duplicates: rows.length - unique.length,
      dryRun: true,
    };
  }

  let inserted = 0;
  for (const r of unique) {
    try {
      // Skip se já existe no catálogo (cross-run dedup).
      const sqlHash = canonicalSqlHash(r.final_sql);
      const existing = await repo.findByHash({ sqlHash, clientId: r.client_id });
      if (existing) continue;
      await repo.insertDraft({
        intent: r.intent ?? '(sem intent)',
        sql: r.final_sql,
        clientId: r.client_id,
        personaId: r.persona_id,
        schemaSnapshot: r.schema_snapshot ?? null,
        tags: null,
      });
      inserted += 1;
    } catch (err) {
      log(
        `[seed-catalog] insert failed for client=${r.client_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  log(`[seed-catalog] inserted ${inserted} drafts.`);

  return {
    scanned: rows.length,
    unique: unique.length,
    inserted,
    duplicates: rows.length - unique.length,
    dryRun: false,
  };
}

function parseArgs(argv: string[]): { days: number; top: number; client?: string; dryRun: boolean } {
  let days = 30;
  let top = 100;
  let client: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    const m = arg.match(/^--([a-zA-Z-]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, key, val] = m;
    switch (key) {
      case 'days':
        days = Number(val);
        break;
      case 'top':
        top = Number(val);
        break;
      case 'client':
        client = val;
        break;
      case 'dry-run':
        dryRun = true;
        break;
    }
  }
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive integer');
  if (!Number.isFinite(top) || top <= 0) throw new Error('--top must be a positive integer');
  return { days, top, client, dryRun };
}

// CLI entrypoint — only when executed directly.
if (process.argv[1] && /seed-catalog-from-logs\.ts$/.test(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  // Writes unless --dry-run, so the guard sees every other run as `--apply`.
  assertSeedWriteAllowed({
    databaseId: DATAVIZ_DATABASE_ID,
    argv: args.dryRun ? process.argv : [...process.argv, '--apply'],
    label: 'seed-catalog-from-logs',
  });
  seedCatalogFromLogs({ ...args, logger: (m) => console.log(m) })
    .then((res) => {
      console.log('[seed-catalog] result:', res);
    })
    .catch((err) => {
      console.error('[seed-catalog] FAILED:', err);
      process.exit(2);
    });
}

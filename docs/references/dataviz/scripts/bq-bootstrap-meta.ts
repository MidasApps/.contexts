#!/usr/bin/env tsx
/**
 * Bootstrap dataset + tabela `dataviz_meta.sql_generations` para observability
 * cross-tenant das gerações de SQL dos agentes.
 *
 * Idempotente: re-executar é seguro (CREATE ... IF NOT EXISTS).
 * Decisão: ADR-0004 (Cloud SQL + pgvector é storage de memória; BQ continua
 * sendo storage analítico, e `dataviz_meta.*` é cross-tenant para observability).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';

async function main() {
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  const location = process.env.BIGQUERY_LOCATION ?? 'US';
  if (!projectId) {
    console.error('BIGQUERY_PROJECT_ID is required');
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), 'scripts/bq-create-sql-generations.sql');
  const template = readFileSync(sqlPath, 'utf8');
  const sql = template
    .replaceAll('${PROJECT_ID}', projectId)
    .replaceAll('${BQ_LOCATION}', location);

  const client = getBigQueryClient();
  console.log(`[bootstrap-meta] applying schema to ${projectId} (${location})...`);
  // BQ aceita múltiplos statements quando separados por `;` se nenhum tiver
  // bind parameters. Para evitar pegadinhas, executamos statement-a-statement.
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await client.query({ query: stmt, useLegacySql: false });
  }
  console.log('[bootstrap-meta] dataset/table OK (created or already existed).');
}

main().catch((err) => {
  console.error('[bootstrap-meta] FAILED:', err);
  process.exit(2);
});

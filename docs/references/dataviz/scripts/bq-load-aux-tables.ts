#!/usr/bin/env tsx
/**
 * scripts/bq-load-aux-tables.ts — carrega as bases auxiliares compartilhadas
 * (COMPE + taxonomia de categorias Pluggy), hoje mantidas em Google Sheets,
 * para `dataviz_aux.ba_bancos` / `dataviz_aux.ba_pluggy_categorias` no
 * BigQuery. Fase 2 do plano Covenants v2 (Task 8) — essas tabelas são
 * consumidas via join pelas recipes de transações bancárias (Task 11).
 *
 * Uso:
 *   pnpm exec tsx scripts/bq-load-aux-tables.ts            # dry-run (default): parse + contagens + amostra + location, SEM escrever
 *   pnpm exec tsx scripts/bq-load-aux-tables.ts --apply     # grava no BigQuery
 *
 * Credenciais: env `BIGQUERY_CREDENTIALS` (keyFilename) — fallback ADC se
 * ausente. Necessária mesmo em dry-run, pois o script consulta a location
 * do dataset `vila_rosa_covenants` para decidir onde `dataviz_aux` deve ser
 * criado (joins cross-dataset no BigQuery exigem mesma location).
 *
 * Nota: este script instancia seu próprio `BigQuery` client em vez de
 * reusar `getBigQueryClient()` de `@/shared/lib/bigquery/client` — aquele
 * módulo importa o pacote `server-only`, que não está instalado em
 * `node_modules` (Next.js resolve/faz shim dele apenas dentro do próprio
 * bundler). Rodando via `tsx` puro, o import falha com
 * `Cannot find module 'server-only'`. O mesmo afetaria outros scripts que
 * importam esse client fora do Next (ex.: bq-bootstrap-meta.ts).
 *
 * Idempotência: a cada run, cada tabela é deletada (se existir), recriada
 * com o schema explícito abaixo e recarregada via load job (não streaming
 * insert — streaming tem buffer de escrita que pode atrasar a
 * disponibilidade para query logo após o insert; load job fica
 * imediatamente consistente, o que é necessário para a verificação
 * pós-apply). São tabelas de referência pequenas (centenas de linhas),
 * então recriar do zero a cada run é seguro e mais simples que um upsert.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { BigQuery, type BigQueryOptions, type Dataset, type TableField } from '@google-cloud/bigquery';
import {
  mapBankRow,
  mapPluggyCategoryRow,
  type BankRow,
  type PluggyCategoryRow,
} from './lib/aux-tables-parse';
import { AUX_SCHEMA, toTableFields } from './lib/vila-rosa-schemas.mjs';

const DATASET_ID = 'dataviz_aux';
// Dataset de referência para casar a location — joins cross-dataset no
// BigQuery exigem que ambos os datasets estejam na mesma location.
const REFERENCE_DATASET_ID = 'vila_rosa_covenants';
const BASE_DIR = path.join('docs', 'bases', 'vila-rosa', 'Google Sheets');
const BANKS_CSV =
  'Covenants - Bases Auxiliares - Bancos & Pluggy Transactions Category - BA - Bancos.csv';
const PLUGGY_CSV =
  'Covenants - Bases Auxiliares - Bancos & Pluggy Transactions Category - BA - Pluggy - Transactions ID.csv';
const SAMPLE_SIZE = 3;
const APPLY = process.argv.includes('--apply');

// Espelha `buildDefaultOpts` de `@/shared/lib/bigquery/client.ts` (mesmas
// env vars e escopos), sem importar aquele módulo — ver nota acima.
const BQ_SCOPES = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/drive.readonly',
];

function buildBigQueryClient(): BigQuery {
  const opts: BigQueryOptions = {
    projectId: process.env.BIGQUERY_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
    scopes: BQ_SCOPES,
  };
  const location = process.env.BIGQUERY_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION;
  if (location) opts.location = location;
  if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  return new BigQuery(opts);
}

const BA_BANKS_SCHEMA: TableField[] = toTableFields(AUX_SCHEMA.ba_bancos);
const BA_PLUGGY_CATEGORIES_SCHEMA: TableField[] = toTableFields(AUX_SCHEMA.ba_pluggy_categorias);

function readCsvRows(fileName: string): Record<string, string>[] {
  const fullPath = path.join(BASE_DIR, fileName);
  return parse(readFileSync(fullPath), { columns: true, skip_empty_lines: true });
}

/** Cria (ou recria) a tabela com schema explícito e carrega `rows` via load job NDJSON. */
async function loadTable(
  dataset: Dataset,
  tableName: string,
  schema: TableField[],
  rows: object[],
): Promise<void> {
  const table = dataset.table(tableName);
  const [exists] = await table.exists();
  if (exists) await table.delete();
  await dataset.createTable(tableName, { schema });

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'bq-load-aux-'));
  const tmpFile = path.join(tmpDir, `${tableName}.ndjson`);
  try {
    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
    await writeFile(tmpFile, ndjson, 'utf8');

    const [jobMetadata] = await table.load(tmpFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_TRUNCATE',
    });
    const errors = jobMetadata.status?.errors;
    if (errors && errors.length > 0) {
      throw new Error(`Load job de ${tableName} falhou: ${JSON.stringify(errors)}`);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`  OK ${tableName} (${rows.length} linhas)`);
}

async function main(): Promise<void> {
  const banks: BankRow[] = readCsvRows(BANKS_CSV).map(mapBankRow);
  const categories: PluggyCategoryRow[] = readCsvRows(PLUGGY_CSV).map(mapPluggyCategoryRow);

  console.log(
    `[bq-load-aux] ba_bancos: ${banks.length} linhas | ba_pluggy_categorias: ${categories.length} linhas`,
  );
  console.log('[bq-load-aux] amostra ba_bancos:', JSON.stringify(banks.slice(0, SAMPLE_SIZE), null, 2));
  console.log(
    '[bq-load-aux] amostra ba_pluggy_categorias:',
    JSON.stringify(categories.slice(0, SAMPLE_SIZE), null, 2),
  );

  const bq = buildBigQueryClient();
  const [refMeta] = await bq.dataset(REFERENCE_DATASET_ID).getMetadata();
  const location: string | undefined = refMeta.location;
  if (!location) {
    throw new Error(`Não foi possível determinar a location de ${REFERENCE_DATASET_ID}.`);
  }
  console.log(
    `[bq-load-aux] location de ${REFERENCE_DATASET_ID}: ${location} — dataviz_aux será criado/validado nessa mesma location.`,
  );

  if (!APPLY) {
    console.log('[bq-load-aux] dry-run: nada foi escrito no BigQuery. Rode com --apply para gravar.');
    return;
  }

  const [dataset] = await bq.dataset(DATASET_ID, { location }).get({ autoCreate: true });
  const [dsMeta] = await dataset.getMetadata();
  if (dsMeta.location !== location) {
    throw new Error(
      `Dataset ${DATASET_ID} já existe em location "${dsMeta.location}", diferente de "${location}" (${REFERENCE_DATASET_ID}). Joins cross-dataset exigem mesma location — resolva manualmente antes de reexecutar.`,
    );
  }

  await loadTable(dataset, 'ba_bancos', BA_BANKS_SCHEMA, banks);
  await loadTable(dataset, 'ba_pluggy_categorias', BA_PLUGGY_CATEGORIES_SCHEMA, categories);

  console.log('[bq-load-aux] concluído.');
}

main().catch((err) => {
  console.error('[bq-load-aux] FAILED:', err);
  process.exit(2);
});

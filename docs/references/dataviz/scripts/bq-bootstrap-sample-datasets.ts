#!/usr/bin/env tsx
/**
 * Datasets BigQuery de uma instalação NOVA, no formato que os seeds do Vila
 * Rosa esperam — sem depender dos dumps de cliente (gitignored).
 *
 *   vila_rosa_monitor    contratos / pagamentos / fluxo_caixa a partir dos
 *                        CSVs de amostra em docs/, MAIS as colunas do contrato
 *                        que a amostra não traz (criadas nulas). Sem isso o
 *                        SQL das métricas falha com "Unrecognized name".
 *   vila_rosa_covenants  7 tabelas vazias com o schema do contrato.
 *   dataviz_aux          ba_bancos / ba_pluggy_categorias vazias — o SQL das
 *                        métricas de extrato faz JOIN literal nelas; vazias
 *                        devolvem zero linhas em vez de erro. `pnpm bq:load-aux`
 *                        carrega as reais quando os CSVs existirem.
 *
 * Idempotente: dataset/tabela existente não é recriado; só colunas faltantes
 * são adicionadas. Nunca apaga nada.
 *
 * Uso:
 *   pnpm bq:bootstrap-sample -- --project=<id> [--location=US] [--dry-run]
 *   (ou exporte BIGQUERY_PROJECT_ID / GOOGLE_CLOUD_PROJECT via --env-file)
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { BigQuery, type BigQueryOptions, type Dataset, type TableField } from '@google-cloud/bigquery';
import {
  AUX_SCHEMA,
  COVENANTS_SCHEMA,
  MONITOR_SCHEMA,
  missingColumns,
  toTableFields,
} from './lib/vila-rosa-schemas.mjs';

type Columns = Array<[string, string]>;

const argv = process.argv.slice(2);
const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const DRY_RUN = argv.includes('--dry-run');
const PROJECT_ID = arg('project') ?? process.env.BIGQUERY_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = arg('location') ?? process.env.BIGQUERY_LOCATION ?? 'US';
const SAMPLES_DIR = 'docs';

if (!PROJECT_ID) {
  console.error('Projeto ausente: --project=<id> ou BIGQUERY_PROJECT_ID/GOOGLE_CLOUD_PROJECT.');
  process.exit(2);
}

// Mesmas env vars/escopos de `@/shared/lib/bigquery/client.ts`, sem importar
// o módulo do app (`server-only`).
const buildBigQueryClient = (): BigQuery => {
  const opts: BigQueryOptions = {
    projectId: PROJECT_ID,
    location: LOCATION,
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  };
  if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  return new BigQuery(opts);
};

const ensureDataset = async (bq: BigQuery, id: string): Promise<Dataset> => {
  const ds = bq.dataset(id, { location: LOCATION });
  const [exists] = await ds.exists();
  if (exists) {
    console.log(`  = dataset ${id}`);
    return ds;
  }
  console.log(`  + dataset ${id} (${LOCATION})`);
  if (!DRY_RUN) await ds.create();
  return ds;
};

const ensureEmptyTable = async (ds: Dataset, tableId: string, columns: Columns): Promise<void> => {
  const table = ds.table(tableId);
  const [exists] = await table.exists();
  if (exists) {
    console.log(`    = ${ds.id}.${tableId}`);
    return;
  }
  console.log(`    + ${ds.id}.${tableId} (vazia, ${columns.length} colunas)`);
  if (!DRY_RUN) await ds.createTable(tableId, { schema: toTableFields(columns) as TableField[] });
};

/** Carrega o CSV de amostra (autodetect) se a tabela não existir; depois completa colunas do contrato. */
const ensureSampleTable = async (bq: BigQuery, ds: Dataset, tableId: string, columns: Columns): Promise<void> => {
  const table = ds.table(tableId);
  const [exists] = await table.exists();
  if (!exists) {
    const csv = path.join(SAMPLES_DIR, `${tableId}_amostra.csv`);
    if (!existsSync(csv)) {
      console.log(`    + ${ds.id}.${tableId} (sem ${csv}; criada vazia com o schema do contrato)`);
      if (!DRY_RUN) await ds.createTable(tableId, { schema: toTableFields(columns) as TableField[] });
      return;
    }
    console.log(`    + ${ds.id}.${tableId} ← ${csv}`);
    if (DRY_RUN) return;
    const [job] = await table.load(csv, { sourceFormat: 'CSV', skipLeadingRows: 1, autodetect: true });
    const errors = job.status?.errors;
    if (errors?.length) throw new Error(`load ${tableId}: ${JSON.stringify(errors)}`);
  }

  const [meta] = DRY_RUN && !exists ? [{ schema: { fields: [] } }] : await table.getMetadata();
  const existingNames: string[] = (meta.schema?.fields ?? []).map((f: TableField) => f.name ?? '');
  const missing = missingColumns(existingNames, columns) as Columns;
  if (missing.length === 0) {
    console.log(`    = ${ds.id}.${tableId} (schema completo)`);
    return;
  }
  console.log(`    ~ ${ds.id}.${tableId}: +${missing.length} colunas do contrato (${missing.slice(0, 4).map(([n]) => n).join(', ')}…)`);
  if (DRY_RUN) return;
  const adds = missing.map(([name, type]) => `ADD COLUMN ${name} ${type}`).join(', ');
  await bq.query({ query: `ALTER TABLE \`${PROJECT_ID}.${ds.id}.${tableId}\` ${adds}`, location: LOCATION });
};

const main = async (): Promise<void> => {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — datasets de amostra em ${PROJECT_ID} (${LOCATION})\n`);
  const bq = buildBigQueryClient();

  const monitor = await ensureDataset(bq, 'vila_rosa_monitor');
  for (const [tableId, columns] of Object.entries(MONITOR_SCHEMA)) {
    await ensureSampleTable(bq, monitor, tableId, columns as Columns);
  }

  const covenants = await ensureDataset(bq, 'vila_rosa_covenants');
  for (const [tableId, columns] of Object.entries(COVENANTS_SCHEMA)) {
    await ensureEmptyTable(covenants, tableId, columns as Columns);
  }

  const aux = await ensureDataset(bq, 'dataviz_aux');
  for (const [tableId, columns] of Object.entries(AUX_SCHEMA)) {
    await ensureEmptyTable(aux, tableId, columns as Columns);
  }

  console.log(DRY_RUN ? '\n(dry-run — nada foi escrito)' : '\nConcluído.');
};

main().catch((err) => {
  console.error('[bq-bootstrap-sample] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

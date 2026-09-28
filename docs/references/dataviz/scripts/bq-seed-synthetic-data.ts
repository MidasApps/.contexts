#!/usr/bin/env tsx
/**
 * Carrega uma carteira SINTÉTICA no BigQuery, substituindo o conteúdo dos
 * datasets do domínio escolhido:
 *
 *   --domain=vila-rosa   (default) `lib/synthetic-portfolio.ts` →
 *                        `vila_rosa_monitor`, `vila_rosa_covenants`, `dataviz_aux`
 *   --domain=real-estate `lib/synthetic-real-estate.ts` → `imobiliaria_demo`
 *                        (20 tabelas, tenant demo `imob-demo`)
 *
 * Para desenvolvimento e demonstração. Os dados são inventados e
 * determinísticos (mesma seed → mesma carga); nenhum dado de cliente entra.
 *
 * Cada tabela é recriada com o schema explícito de `lib/vila-rosa-schemas.mjs`
 * e carregada por load job NDJSON — consistente logo após o job, sem buffer
 * de streaming. Por isso o script APAGA e recria as tabelas: é a única forma
 * de garantir schema e conteúdo alinhados. Não rode contra dataset real.
 * `--dry-run` só gera e conta as linhas: não cria cliente BigQuery e dispensa
 * `--project`.
 *
 * Uso:
 *   pnpm exec tsx scripts/bq-seed-synthetic-data.ts --domain=vila-rosa --project=<id>
 *     [--location=US] [--seed=2026] [--months=18] [--contracts=40]
 *     [--last-snapshot=2025-12-31] [--dry-run]
 *   pnpm exec tsx scripts/bq-seed-synthetic-data.ts --domain=real-estate --project=<id>
 *     [--seed=2026] [--months=24] [--properties=4800] [--leads=480]
 *     [--last-snapshot=2026-08-31] [--dry-run]
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BigQuery, type BigQueryOptions, type Dataset, type TableField } from '@google-cloud/bigquery';
import { generatePortfolio } from './lib/synthetic-portfolio';
import { AUX_SCHEMA, COVENANTS_SCHEMA, MONITOR_SCHEMA, toTableFields } from './lib/vila-rosa-schemas.mjs';
import { generateRealEstate } from './lib/synthetic-real-estate';
import { REAL_ESTATE_SCHEMA } from './lib/real-estate-schemas.mjs';
import { withRetry } from './lib/retry';

const argv = process.argv.slice(2);
const arg = (key: string) => argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const DRY_RUN = argv.includes('--dry-run');
const PROJECT_ID = arg('project') ?? process.env.BIGQUERY_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = arg('location') ?? process.env.BIGQUERY_LOCATION ?? 'US';
// Só a carga real precisa de projeto: o dry-run não cria cliente BigQuery.
if (!PROJECT_ID && !DRY_RUN) {
  console.error('Projeto ausente: --project=<id> ou BIGQUERY_PROJECT_ID/GOOGLE_CLOUD_PROJECT.');
  process.exit(2);
}

type Destination = Record<string, { dataset: string; schema: Record<string, Array<[string, string]>> }>;
type GeneratedTables = Record<string, Array<Record<string, unknown>>>;
type Domain = { label: string; destination: Destination; generate: () => GeneratedTables };

/** Cada domínio: para onde carregar + como gerar. Adicionar domínio = adicionar entrada. */
const DOMAINS: Record<string, Domain> = {
  'vila-rosa': {
    label: 'carteira sintética Vila Rosa',
    destination: {
      vila_rosa_monitor: { dataset: 'vila_rosa_monitor', schema: MONITOR_SCHEMA as never },
      vila_rosa_covenants: { dataset: 'vila_rosa_covenants', schema: COVENANTS_SCHEMA as never },
      dataviz_aux: { dataset: 'dataviz_aux', schema: AUX_SCHEMA as never },
    },
    generate: () => generatePortfolio({
      seed: Number(arg('seed') ?? 2026),
      months: Number(arg('months') ?? 18),
      contractsPerProject: Number(arg('contracts') ?? 40),
      lastSnapshot: arg('last-snapshot') ?? '2025-12-31',
    }),
  },
  'real-estate': {
    label: 'imobiliária sintética (imob-demo)',
    destination: { imobiliaria_demo: { dataset: 'imobiliaria_demo', schema: REAL_ESTATE_SCHEMA as never } },
    generate: () => generateRealEstate({
      seed: Number(arg('seed') ?? 2026),
      months: Number(arg('months') ?? 24),
      properties: Number(arg('properties') ?? 4800),
      leadsPerMonth: Number(arg('leads') ?? 480),
      lastSnapshot: arg('last-snapshot') ?? '2026-08-31',
    }),
  },
};

const DOMAIN_KEY = arg('domain') ?? 'vila-rosa';
const domain = DOMAINS[DOMAIN_KEY];
if (!domain) {
  console.error(`Domínio desconhecido: ${DOMAIN_KEY}. Use --domain=${Object.keys(DOMAINS).join('|')}.`);
  process.exit(2);
}

function buildBigQueryClient(): BigQuery {
  const options: BigQueryOptions = { projectId: PROJECT_ID, location: LOCATION, scopes: ['https://www.googleapis.com/auth/bigquery'] };
  if (process.env.BIGQUERY_CREDENTIALS) options.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  return new BigQuery(options);
}

const UPLOAD_ATTEMPTS = 4;

async function recreateAndLoad(dataset: Dataset, tableId: string, schema: TableField[], rows: object[], tmpDir: string): Promise<void> {
  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (exists) await table.delete();
  await dataset.createTable(tableId, { schema });
  const file = path.join(tmpDir, `${tableId}.ndjson`);
  await writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n'), 'utf8');
  // The multipart upload is not resumable; a dropped connection (EPIPE) killed a
  // whole run once. WRITE_TRUNCATE makes the retry safe: it replaces, never appends.
  const [job] = await withRetry(
    () => table.load(file, { sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: 'WRITE_TRUNCATE', schema: { fields: schema } }),
    {
      attempts: UPLOAD_ATTEMPTS,
      onRetry: ({ attempt, delayMs, error }) => process.stdout.write(
        `falhou (${error instanceof Error ? error.message : String(error)}); tentativa ${attempt + 1}/${UPLOAD_ATTEMPTS} em ${delayMs / 1000}s … `,
      ),
    },
  );
  const errors = job.status?.errors;
  if (errors?.length) throw new Error(`load ${tableId}: ${JSON.stringify(errors.slice(0, 3))}`);
}

async function main(): Promise<void> {
  const tables = domain.generate();

  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — ${domain.label} em ${PROJECT_ID ?? '(sem projeto)'} (${LOCATION})\n`);
  for (const [tableId, rows] of Object.entries(tables)) console.log(`  ${tableId.padEnd(28)} ${String(rows.length).padStart(7)} linhas`);
  if (DRY_RUN) {
    console.log('\n(dry-run — nada foi escrito)');
    return;
  }

  const bq = buildBigQueryClient();
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'bq-seed-synthetic-'));
  try {
    for (const { dataset: datasetId, schema } of Object.values(domain.destination)) {
      const [dataset] = await bq.dataset(datasetId, { location: LOCATION }).get({ autoCreate: true });
      for (const [tableId, columns] of Object.entries(schema)) {
        const rows = tables[tableId] as object[] | undefined;
        if (!rows) throw new Error(`gerador não produziu ${tableId}`);
        process.stdout.write(`  ↑ ${datasetId}.${tableId} … `);
        await recreateAndLoad(dataset, tableId, toTableFields(columns) as TableField[], rows, tmpDir);
        console.log('ok');
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
  console.log('\nConcluído. Recarregue o relatório; o seletor de período agora tem várias datas-base.');
}

main().catch((err: unknown) => {
  console.error('[bq-seed-synthetic] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});

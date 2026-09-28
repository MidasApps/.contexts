#!/usr/bin/env tsx
/**
 * Bootstrap BQML datasets per tenant + registry/invocations tables.
 * ADR-0007: dataset `dataviz_bqml_<client>` por tenant; cache em `dataviz_meta.bqml_model_registry`.
 * Idempotente.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { tenantDatasetSegment } from '@/shared/config/tenants';
import { loadActiveClients, connectFirestore, resolveProject } from './lib/firestore-connection';

/**
 * Clientes ativos vêm do cadastro, não de lista no código.
 *
 * Era `['om','brz','conx','imcasa']`, depois `['vila-rosa']`. As duas versões
 * estiveram erradas em algum momento pelo mesmo motivo: a lista não acompanha
 * o cadastro. E o erro é silencioso nos dois sentidos — cria dataset para
 * cliente que não existe, e deixa sem dataset o cliente que existe.
 */
async function activeClients(): Promise<string[]> {
  const database = process.argv.find((a) => a.startsWith('--database='))?.split('=')[1];
  const projectArg = process.argv.find((a) => a.startsWith('--project='))?.split('=')[1];
  if (!database) {
    console.error('Faltou --database=<id> (de onde ler os clientes cadastrados).');
    process.exit(1);
  }
  return loadActiveClients(connectFirestore(database, resolveProject(projectArg)));
}

async function execStatements(sql: string): Promise<void> {
  const client = getBigQueryClient();
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await client.query({ query: stmt, useLegacySql: false });
  }
}

async function main() {
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  const location = process.env.BIGQUERY_LOCATION ?? 'US';
  if (!projectId) {
    console.error('BIGQUERY_PROJECT_ID is required');
    process.exit(1);
  }

  const datasetTpl = readFileSync(
    join(process.cwd(), 'scripts/bq-bootstrap-bqml-datasets.sql'),
    'utf8',
  );
  const registryTpl = readFileSync(
    join(process.cwd(), 'scripts/bq-bootstrap-bqml-registry.sql'),
    'utf8',
  );

  const clients = await activeClients();
  if (clients.length === 0) {
    console.error('Nenhum cliente cadastrado neste banco — nada a provisionar.');
    process.exit(1);
  }

  for (const client of clients) {
    // O nome do dataset usa o segmento normalizado, não o id: com `vila-rosa`
    // isto montava `dataviz_bqml_vila-rosa`, que o BigQuery recusa (hífen não é
    // aceito em nome de dataset) e que não é o nome que `deriveBqmlDataset`
    // procura em runtime. O id canônico continua indo para o label.
    const segment = tenantDatasetSegment(client);
    const sql = datasetTpl
      .replaceAll('${PROJECT_ID}', projectId)
      .replaceAll('${BQ_LOCATION}', location)
      .replaceAll('${CLIENT_ID}', client)
      .replaceAll('${CLIENT}', segment);
    console.log(`[bootstrap-bqml] dataset dataviz_bqml_${segment} (cliente ${client})...`);
    await execStatements(sql);
  }

  const registrySql = registryTpl
    .replaceAll('${PROJECT_ID}', projectId)
    .replaceAll('${BQ_LOCATION}', location);
  console.log('[bootstrap-bqml] registry + invocations...');
  await execStatements(registrySql);

  console.log('[bootstrap-bqml] OK (created or already existed).');
}

main().catch((err) => {
  console.error('[bootstrap-bqml] FAILED:', err);
  process.exit(2);
});

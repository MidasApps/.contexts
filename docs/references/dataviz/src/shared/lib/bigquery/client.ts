import 'server-only';
import { BigQuery } from '@google-cloud/bigquery';
import type { BigQueryOptions } from '@google-cloud/bigquery';
import { getDataSource } from '@/shared/repositories/data-source-repo';
import { safeDatasetRef, safeIdentifier, quoteTableRef } from './identifier';

/**
 * Factory de clientes BigQuery com cache por dataSource.
 *
 * - `getBigQueryClient()` (sync, sem args) → cliente default via env vars (compat).
 * - `getBigQueryClientFor(dataSourceId)` (async) → lookup em Firestore.
 *
 * Cache é in-memory; válido durante o lifecycle do processo Node.
 */

const DEFAULT_KEY = '__default__';
const clients = new Map<string, BigQuery>();

/**
 * Escopos OAuth que o BQ client requisita ao usar service-account keys.
 * - `bigquery` cobre todas as APIs do BigQuery.
 * - `drive.readonly` é necessário pra ler external tables apontando para
 *   Google Sheets / Drive (ex: vila_rosa_covenants.*). Sem isso, o
 *   GCP retorna "Permission denied while getting Drive credentials"
 *   mesmo com a planilha compartilhada com a SA.
 *
 * Quando rodando sob ADC (usuário humano), os escopos são definidos no
 * `gcloud auth application-default login` e essa lista é ignorada.
 */
const BQ_SCOPES = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/drive.readonly',
];

function buildDefaultOpts(): BigQueryOptions {
  const opts: BigQueryOptions = {
    projectId: process.env.BIGQUERY_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
    scopes: BQ_SCOPES,
  };
  const location = process.env.BIGQUERY_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION;
  if (location) opts.location = location;
  if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  return opts;
}

/**
 * Cliente BQ default (sync) — usa env vars. Compatível com código existente.
 */
export function getBigQueryClient(): BigQuery {
  const cached = clients.get(DEFAULT_KEY);
  if (cached) return cached;
  const client = new BigQuery(buildDefaultOpts());
  clients.set(DEFAULT_KEY, client);
  return client;
}

/**
 * Cliente BQ para um DataSource específico (async) — lookup no Firestore.
 * Use esta variante quando for operar em múltiplos projetos GCP.
 */
export async function getBigQueryClientFor(dataSourceId: string): Promise<BigQuery> {
  const cached = clients.get(dataSourceId);
  if (cached) return cached;

  const source = await getDataSource(dataSourceId);
  if (!source) {
    throw new Error(`DataSource "${dataSourceId}" não encontrado no Firestore.`);
  }

  const opts: BigQueryOptions = {
    projectId: source.projectId,
    location: source.location,
    scopes: BQ_SCOPES,
  };
  if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;

  const client = new BigQuery(opts);
  clients.set(dataSourceId, client);
  return client;
}

/** Default dataset from env — preservado para retrocompat. */
export const DEFAULT_DATASET = process.env.BIGQUERY_DATASET ?? 'liquid_dataviz';

/** Retrocompat: tabelas hard-coded do produto Credit. */
export const TABLES = {
  contratos: 'contratos',
  pagamentos: 'pagamentos',
  fluxo_caixa: 'fluxo_caixa',
} as const;

export type TableName = keyof typeof TABLES;

export interface DatasetRef {
  raw: string;
  datasetId: string;
  projectId?: string;
}

/**
 * Retrocompat. Novas chamadas devem usar `safeDatasetRef` de `./identifier`.
 */
export function parseDatasetRef(dataset?: string): DatasetRef {
  const raw = (dataset ?? DEFAULT_DATASET).trim();
  const parsed = safeDatasetRef(raw);
  return { raw, datasetId: parsed.datasetId, projectId: parsed.projectId };
}

/**
 * Retrocompat. Constrói `projeto.dataset.tabela` validado.
 *
 * Names outside `TABLES` (the securitization domain) pass through as-is — that is
 * the case of filter sources resolved from the client binding. Either way the
 * physical name goes through `safeIdentifier`.
 */
export function formatTableRef(dataset: string | undefined, table: TableName | string): string {
  const parsed = parseDatasetRef(dataset);
  const physicalTable = (TABLES as Record<string, string>)[table] ?? table;
  return quoteTableRef({
    projectId: parsed.projectId,
    datasetId: parsed.datasetId,
    tableId: safeIdentifier(physicalTable, 'table'),
  });
}

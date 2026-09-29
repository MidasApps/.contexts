import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient, parseDatasetRef, TABLES } from '@/shared/lib/bigquery/client';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { recordSpan } from '@/shared/lib/telemetry/record-span';
import type { ToolContext } from './tool-context';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

/**
 * Qualquer tabela do dataset que a rota autorizou (`ctx.dataset`) — o mesmo
 * que o `execute_sql` lê sem qualificar. Era uma lista fixa do domínio de
 * crédito (`contratos | pagamentos | fluxo_caixa`), inútil para outro cliente
 * (`vendas` na imobiliária), justo quando a guarda passou a recusar
 * `INFORMATION_SCHEMA` e a mandar o modelo usar esta tool. Nome simples, sem
 * ponto: não há como apontar para outro dataset.
 */
const TABLE_NAME = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/, 'Nome de tabela simples, sem dataset (ex.: vendas).')
  // Meta-tabelas (`__TABLES__`) e metadados: a amostra de valores devolveria o
  // id do projeto, que a guarda de SQL esconde.
  .refine((t) => !t.startsWith('__') && !/^INFORMATION_SCHEMA$/i.test(t), 'Tabela de metadados não é aceita.');

/** Nome lógico antigo (`contratos`) → nome físico em `TABLES`; o resto, como veio. */
const physicalTableName = (name: string): string => {
  // `Object.hasOwn`: `constructor`/`toString` não são tabela herdada do objeto.
  return Object.hasOwn(TABLES, name) ? (TABLES as Record<string, string>)[name]! : name;
};

const SAMPLEABLE_TYPES = new Set([
  'STRING',
  'INT64',
  'INTEGER',
  'FLOAT64',
  'FLOAT',
  'NUMERIC',
  'BIGNUMERIC',
  'BOOL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
]);

interface BqField {
  name?: string;
  type?: string;
  mode?: string;
  description?: string;
  fields?: BqField[];
}

interface SchemaColumn {
  name: string;
  type: string;
  mode: string;
  description: string;
  nullRatio: number | null;
  distinctCount: number | null;
  sampleValues: string[];
}

interface CacheEntry {
  value: SchemaColumn[];
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

const evictIfNeeded = () => {
  if (cache.size <= MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestExpires = Infinity;
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < oldestExpires) {
      oldestExpires = v.expiresAt;
      oldestKey = k;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
};

const safeIdentifier = (name: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return `\`${name}\``;
};

const buildStatsQuery = (
  projectId: string | undefined,
  datasetId: string,
  tableId: string,
  fields: BqField[],
): string => {
  const projectPrefix = projectId ? `\`${projectId}\`.` : '';
  const tableRef = `${projectPrefix}\`${datasetId}\`.\`${tableId}\``;
  const exprs: string[] = [];
  exprs.push('COUNT(*) AS total_rows');
  for (const f of fields) {
    if (!f.name) continue;
    const col = safeIdentifier(f.name);
    const type = (f.type ?? '').toUpperCase();
    exprs.push(`SAFE_DIVIDE(COUNTIF(${col} IS NULL), COUNT(*)) AS null_ratio_${f.name}`);
    if (SAMPLEABLE_TYPES.has(type)) {
      exprs.push(`APPROX_COUNT_DISTINCT(${col}) AS distinct_${f.name}`);
      exprs.push(
        `ARRAY(SELECT CAST(x AS STRING) FROM (SELECT DISTINCT ${col} AS x FROM ${tableRef} WHERE ${col} IS NOT NULL ORDER BY x LIMIT 5)) AS sample_${f.name}`,
      );
    }
  }
  return `SELECT ${exprs.join(', ')} FROM ${tableRef}`;
};

const fetchStats = async (
  client: ReturnType<typeof getBigQueryClient>,
  projectId: string | undefined,
  datasetId: string,
  tableId: string,
  fields: BqField[],
): Promise<Record<string, unknown>> => {
  const BATCH = 30;
  const merged: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i += BATCH) {
    const batch = fields.slice(i, i + BATCH);
    const sql = buildStatsQuery(projectId, datasetId, tableId, batch);
    const [job] = await client.createQueryJob({ query: sql, useLegacySql: false, maximumBytesBilled: String(maxBytesBilled()) });
    const [rows] = await job.getQueryResults();
    Object.assign(merged, (rows as Record<string, unknown>[])[0] ?? {});
  }
  return merged;
};

export const createGetTableSchemaV2Tool = (ctx: ToolContext) => {
  const { dataset } = ctx;
  return tool({
    description:
      'Retorna schema enriquecido (colunas + nullRatio + distinctCount + sampleValues) de uma tabela do cliente, com cache 1h. Use para ver colunas e tipos antes de compor SQL.',
    inputSchema: z.object({
      table: TABLE_NAME.describe('Nome da tabela do cliente, sem dataset (ex.: contratos, vendas).'),
    }),
    execute: async ({ table }: { table: string }) => {
      // O framework já valida o input; repetir aqui mantém a regra se alguém
      // chamar `execute` direto.
      if (!TABLE_NAME.safeParse(table).success) {
        return { success: false, error: 'Nome de tabela inválido: use o nome simples da tabela do cliente.', table, columns: [] as SchemaColumn[] };
      }
      const cacheKey = `${dataset}:${table}`;
      const t0 = Date.now();
      const now = t0;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        cacheHits++;
        // fire-and-forget telemetry; recordSpan captures duration internally
        void recordSpan(
          { name: 'schema_v2.lookup', attributes: { table, cacheHit: true, dataset } },
          () => undefined,
        );
        emitCacheStatsIfDue(dataset);
        return { success: true, table, columns: cached.value, cacheHit: true };
      }
      cacheMisses++;
      try {
        const client = getBigQueryClient();
        const { datasetId, projectId } = parseDatasetRef(dataset);
        const tableId = physicalTableName(table);
        const tableRef = client.dataset(datasetId, projectId ? { projectId } : undefined).table(tableId);
        const [metadata] = await tableRef.getMetadata();
        const fields: BqField[] = (metadata.schema?.fields as BqField[]) ?? [];

        const stats = fields.length > 0 ? await fetchStats(client, projectId, datasetId, tableId, fields) : {};

        const columns: SchemaColumn[] = fields.map((f) => {
          const name = f.name ?? '';
          const type = (f.type ?? 'UNKNOWN').toUpperCase();
          const sampleable = SAMPLEABLE_TYPES.has(type);
          const nullRatio = stats[`null_ratio_${name}`];
          const distinct = stats[`distinct_${name}`];
          const sample = stats[`sample_${name}`];
          return {
            name,
            type: f.type ?? 'UNKNOWN',
            mode: f.mode ?? 'NULLABLE',
            description: f.description ?? '',
            nullRatio: typeof nullRatio === 'number' ? nullRatio : nullRatio == null ? null : Number(nullRatio),
            distinctCount: sampleable && distinct != null ? Number(distinct) : null,
            sampleValues: sampleable && Array.isArray(sample) ? (sample as unknown[]).map(String) : [],
          };
        });

        cache.set(cacheKey, { value: columns, expiresAt: now + TTL_MS });
        evictIfNeeded();

        void recordSpan(
          { name: 'schema_v2.lookup', attributes: { table, cacheHit: false, dataset, durationMs: Date.now() - t0 } },
          () => undefined,
        );
        emitCacheStatsIfDue(dataset);
        return { success: true, table, columns, cacheHit: false };
      } catch (err) {
        void recordSpan(
          { name: 'schema_v2.lookup', attributes: { table, cacheHit: false, dataset, error: true } },
          () => undefined,
        );
        return {
          success: false,
          error: formatToolError(err),
          table,
          columns: [] as SchemaColumn[],
        };
      }
    },
  });
};

let lookupsSinceLastStats = 0;
const STATS_EMIT_EVERY = 10;
const emitCacheStatsIfDue = (dataset: string) => {
  lookupsSinceLastStats++;
  if (lookupsSinceLastStats >= STATS_EMIT_EVERY) {
    lookupsSinceLastStats = 0;
    void recordSpan(
      { name: 'schema_v2.cache_stats', attributes: { ...getCacheStats(), dataset } },
      () => undefined,
    );
  }
};

export const getCacheStats = () => {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    size: cache.size,
    hitRate: total === 0 ? 0 : cacheHits / total,
  };
};

export const clearSchemaV2Cache = () => {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
};

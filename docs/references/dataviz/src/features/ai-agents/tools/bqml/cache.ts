import { createHash } from 'node:crypto';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

export interface ColumnSchema {
  name: string;
  type: string;
  mode?: string;
}

export function computeSourceColumnsDdlHash(columns: ColumnSchema[]): string {
  const serialized = columns
    .map((c) => `${c.name}|${c.type}|${c.mode ?? 'NULLABLE'}`)
    .sort()
    .join('||');
  return createHash('sha1').update(serialized).digest('hex');
}

export function computeFeaturesCanonical(features: string[]): string {
  return [...features].map((f) => f.toLowerCase()).sort().join('|');
}

export interface ModelHashParts {
  clientId: string;
  intent: string;
  featuresCanonical: string;
  target: string;
  safraWindowEnd: string;
  sourceColumnsDdlHash: string;
}

export function computeModelHash(parts: ModelHashParts): string {
  const serial = `${parts.clientId}|${parts.intent}|${parts.featuresCanonical}|${parts.target}|${parts.safraWindowEnd}|${parts.sourceColumnsDdlHash}`;
  return createHash('sha1').update(serial).digest('hex');
}

export interface RegistryEntry {
  hash: string;
  clientId: string;
  intent: string;
  modelType: string;
  modelRef: string;
  featuresCanonical: string;
  target: string | null;
  safraWindowEnd: string | null;
  sourceColumnsDdlHash: string;
  trainBytes?: number;
  trainCostUsd?: number;
  metricsJson?: Record<string, unknown>;
}

function metaTableRef(): string {
  const projectId = process.env.BIGQUERY_PROJECT_ID ?? '';
  return `\`${projectId}.dataviz_meta.bqml_model_registry\``;
}

export async function lookupCachedModel(
  hash: string,
  clientId: string,
): Promise<RegistryEntry | null> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT hash, client_id, intent, model_type, model_ref, features_canonical,
                   target, safra_window_end, source_columns_ddl_hash
            FROM ${metaTableRef()}
            WHERE hash = @hash AND client_id = @client_id
            LIMIT 1`,
    params: { hash, client_id: clientId.toLowerCase() },
    useLegacySql: false,
    maximumBytesBilled: String(maxBytesBilled()),
  });
  const r = (rows as Array<Record<string, unknown>>)[0];
  if (!r) return null;
  return {
    hash: r.hash as string,
    clientId: r.client_id as string,
    intent: r.intent as string,
    modelType: r.model_type as string,
    modelRef: r.model_ref as string,
    featuresCanonical: r.features_canonical as string,
    target: (r.target as string) ?? null,
    safraWindowEnd: (r.safra_window_end as string) ?? null,
    sourceColumnsDdlHash: r.source_columns_ddl_hash as string,
  };
}

export async function recordModelInRegistry(entry: RegistryEntry): Promise<void> {
  await getBigQueryClient().query({
    query: `INSERT INTO ${metaTableRef()} (
              hash, client_id, intent, model_type, model_ref,
              features_canonical, target, safra_window_end,
              source_columns_ddl_hash, train_bytes, train_cost_usd,
              metrics_json, created_at, last_used_at, use_count
            ) VALUES (
              @hash, @client_id, @intent, @model_type, @model_ref,
              @features_canonical, @target, @safra_window_end,
              @source_columns_ddl_hash, @train_bytes, @train_cost_usd,
              PARSE_JSON(@metrics_json), CURRENT_TIMESTAMP(), NULL, 0
            )`,
    params: {
      hash: entry.hash,
      client_id: entry.clientId.toLowerCase(),
      intent: entry.intent,
      model_type: entry.modelType,
      model_ref: entry.modelRef,
      features_canonical: entry.featuresCanonical,
      target: entry.target,
      safra_window_end: entry.safraWindowEnd,
      source_columns_ddl_hash: entry.sourceColumnsDdlHash,
      train_bytes: entry.trainBytes ?? null,
      train_cost_usd: entry.trainCostUsd ?? null,
      metrics_json: JSON.stringify(entry.metricsJson ?? {}),
    },
    useLegacySql: false,
    maximumBytesBilled: String(maxBytesBilled()),
  });
}

export async function bumpUsage(hash: string, clientId: string): Promise<void> {
  await getBigQueryClient().query({
    query: `UPDATE ${metaTableRef()}
            SET last_used_at = CURRENT_TIMESTAMP(), use_count = use_count + 1
            WHERE hash = @hash AND client_id = @client_id`,
    params: { hash, client_id: clientId.toLowerCase() },
    useLegacySql: false,
    maximumBytesBilled: String(maxBytesBilled()),
  });
}

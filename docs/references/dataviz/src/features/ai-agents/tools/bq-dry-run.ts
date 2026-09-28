/**
 * Dry-run helper extraído como função pura para reuso fora do AI SDK
 * tool wrapper.
 *
 * `performDryRun` NÃO tem escopo de tenant nem dataset padrão: roda o SQL como
 * veio. Fica só para o scorer offline de eval. O catálogo de SQL validado usa
 * `dryRunInClientScope`, que valida como o `execute_sql`.
 */
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { checkTenantQuery, type TenantQueryRefusalCode } from '@/features/ai-agents/lib/tenant-query';
import { catalogQueryScope } from '@/features/ai-agents/lib/client-query-scope';

const READ_ONLY_RE = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|GRANT|REVOKE)\b/i;

export type DryRunErrorClass = 'syntax' | 'permission' | 'reference' | 'forbidden' | 'unknown';

export interface DryRunResult {
  valid: boolean;
  schema?: { name: string; type: string; mode: string }[];
  bytesProcessed?: number;
  statementType?: string;
  error?: string;
  errorClass?: DryRunErrorClass;
}

const classifyBqError = (message: string): DryRunErrorClass => {
  const m = message.toLowerCase();
  if (m.includes('syntax')) return 'syntax';
  if (m.includes('permission') || m.includes('access denied')) return 'permission';
  if (m.includes('not found') || m.includes('does not exist')) return 'reference';
  return 'unknown';
};

export const performDryRun = async (sql: string): Promise<DryRunResult> => {
  if (!READ_ONLY_RE.test(sql) || FORBIDDEN_RE.test(sql)) {
    return {
      valid: false,
      error: 'Apenas SELECT/WITH são permitidos em dry-run.',
      errorClass: 'forbidden',
    };
  }
  try {
    const client = getBigQueryClient();
    const [job] = await client.createQueryJob({
      query: sql,
      dryRun: true,
      useLegacySql: false,
    });
    const stats = job.metadata?.statistics ?? {};
    const fields = stats.query?.schema?.fields ?? [];
    return {
      valid: true,
      schema: fields.map((f: { name?: string; type?: string; mode?: string }) => ({
        name: f.name ?? '',
        type: f.type ?? 'STRING',
        mode: f.mode ?? 'NULLABLE',
      })),
      bytesProcessed: Number(stats.totalBytesProcessed ?? 0),
      statementType: stats.query?.statementType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: message,
      errorClass: classifyBqError(message),
    };
  }
};

const REFUSAL_ERROR_CLASS: Record<TenantQueryRefusalCode, DryRunErrorClass> = {
  SQL_RECUSADO: 'forbidden',
  NAO_E_SELECT: 'forbidden',
  FORA_DO_TENANT: 'reference',
  DRY_RUN_FALHOU: 'syntax',
};

/**
 * Dry-run de uma entrada do catálogo de SQL, no escopo do cliente dela.
 *
 * O SQL aprovado no catálogo é recuperado e executado pelo modelo daquele
 * cliente. Validar sem escopo aprovava leitura de dataset de outro cliente, e
 * sem dataset padrão recusava justamente o SQL não qualificado
 * (`FROM contratos`) que o `execute_sql` roda. Mesma validação do
 * `execute_sql`: guarda de texto, SELECT único e escopo.
 */
export const dryRunInClientScope = async (sql: string, clientId: string): Promise<DryRunResult> => {
  const scope = await catalogQueryScope(clientId);
  if (!scope) {
    return {
      valid: false,
      error: 'O cliente não tem dataset vinculado: não há onde validar este SQL.',
      errorClass: 'reference',
    };
  }
  const check = await checkTenantQuery(sql, scope);
  if (!check.ok) return { valid: false, error: check.error, errorClass: REFUSAL_ERROR_CLASS[check.code] };
  return { valid: true, schema: check.schema, bytesProcessed: check.bytes, statementType: 'SELECT' };
};

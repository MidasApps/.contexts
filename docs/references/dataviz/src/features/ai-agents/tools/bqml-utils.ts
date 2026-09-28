import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
import { scanSql, FORBIDDEN, outOfScopeConstruct } from '@/features/ai-agents/lib/sql-guard';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

const BQML_TIMEOUT = 180_000; // 3 min for model training + prediction

/** Builds a fully-qualified model reference: `dataset.bqml_{name}` */
export function modelRef(dataset: string, name: string): string {
  return `\`${dataset}.bqml_${name}\``;
}

/** Runs a CREATE OR REPLACE MODEL DDL statement. */
export async function trainModel(dataset: string, ddl: string): Promise<void> {
  const bq = getBigQueryClient();
  const { datasetId, projectId } = parseDatasetRef(dataset);
  await bq.query({
    query: ddl,
    useLegacySql: false,
    defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
    jobTimeoutMs: BQML_TIMEOUT,
    maximumBytesBilled: String(maxBytesBilled()),
  });
}

/** Runs a SELECT query (typically ML.FORECAST / ML.PREDICT / ML.DETECT_ANOMALIES). */
export async function queryBQML(
  dataset: string,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const bq = getBigQueryClient();
  const { datasetId, projectId } = parseDatasetRef(dataset);
  const [rows] = await bq.query({
    query: sql,
    useLegacySql: false,
    defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
    jobTimeoutMs: BQML_TIMEOUT,
    maximumBytesBilled: String(maxBytesBilled()),
  });
  return rows as Record<string, unknown>[];
}

/** Validates a column name against the schema whitelist. Throws on invalid. */
export function safeColumn(col: string): string {
  const result = validateColumn(col, 'numeric');
  if (!result.valid) throw new Error(result.error);
  return result.column;
}

/**
 * Valida o fragmento de WHERE que o modelo manda (`whereClause`) e o devolve
 * ENTRE PARÊNTESES, pronto para `AND <fragmento>`.
 *
 * A versão anterior testava a denylist no texto CRU e só depois tirava os
 * comentários: `SEL/**​/ECT` passava pela checagem e virava `SELECT` — subquery
 * lendo qualquer dataset que a service account alcança. E, sem parênteses,
 * `1=1) OR (1=1` escapava do AND que prende o filtro do tenant.
 *
 * Agora a análise é sobre o texto normalizado pelo mesmo léxico da guarda de SQL
 * (`scanSql`), e o fragmento é recusado — não "consertado" — quando tem:
 * comentário, literal/crase sem fechamento, `;`, crase (nome qualificado),
 * subquery/UNION, `FROM` fora de `EXTRACT(<parte> FROM …)`, qualquer palavra
 * da denylist da guarda, modelo de ML/conexão/função de IA, ou parêntese
 * desbalanceado.
 */
export function safeWhereClause(clause: string): string {
  const { normalized, hasComment, unterminated } = scanSql(clause);
  const recusa = (motivo: string): never => {
    throw new Error(`Filtro recusado (${motivo}). Envie só uma condição sobre colunas de contratos, sem subquery nem comentário.`);
  };

  if (!normalized.trim()) recusa('vazio');
  if (hasComment) recusa('comentário');
  if (unterminated) recusa('literal ou identificador sem fechamento');
  if (normalized.includes(';')) recusa('";"');
  if (normalized.includes('`')) recusa('nome entre crases');
  if (/\b(SELECT|UNION|INTERSECT|EXCEPT)\b/i.test(normalized)) recusa('subquery');
  // `FROM` só é legítimo como separador de `EXTRACT(<parte> FROM <expr>)`.
  // Fora disso, abriria uma consulta (a sintaxe pipe `(FROM t |> …)` não
  // precisa de SELECT). Remove só o FROM que segue `EXTRACT(<parte>`; qualquer
  // outro que sobrar é recusado.
  const withoutExtract = normalized.replace(
    /\bEXTRACT\s*\(\s*[A-Za-z_]+(?:\s*\(\s*[A-Za-z_]+\s*\))?\s+FROM\b/gi,
    'EXTRACT(',
  );
  if (/\bFROM\b/i.test(withoutExtract)) recusa('FROM fora de EXTRACT');
  // `TABLE x` é a outra forma de nomear tabela sem SELECT (`EXISTS(TABLE x)`,
  // `APPENDS(TABLE x, …)`). Hoje o BigQuery a rejeita em expressão, mas um
  // filtro sobre colunas de contratos nunca precisa dela.
  if (/\bTABLE\b/i.test(normalized)) recusa('TABLE');
  for (const { re, motivo } of FORBIDDEN) {
    if (re.test(normalized)) recusa(motivo);
  }
  // Função escalar de IA/ML e conexão cabem num filtro sem FROM nem SELECT
  // (`AI.GENERATE_BOOL(…, connection_id => …)`), e o escopo não as vê.
  const outOfScope = outOfScopeConstruct(normalized);
  if (outOfScope) recusa(outOfScope);

  let depth = 0;
  for (const ch of normalized) {
    if (ch === '(') depth++;
    if (ch === ')' && --depth < 0) recusa('parêntese desbalanceado');
  }
  if (depth !== 0) recusa('parêntese desbalanceado');

  return `(${clause.trim()})`;
}

/** Validates and sanitizes a date string (YYYY-MM-DD) from LLM input. */
export function safeDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Validates and sanitizes a date or year-month string (YYYY-MM-DD or YYYY-MM) from LLM input. */
export function safeDateOrMonth(dateStr: string): string {
  const full = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const month = dateStr.match(/^(\d{4})-(\d{2})$/);
  if (month) return `${month[1]}-${month[2]}`;
  throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD or YYYY-MM.`);
}

/** Builds a session-scoped model reference to prevent concurrent user collisions. */
export function sessionModelRef(dataset: string, name: string, sessionId: string): string {
  const shortId = sessionId.substring(0, 8);
  return `\`${dataset}.bqml_${name}_${shortId}\``;
}

/** Drops a BQML model (best-effort cleanup, does not throw). */
export async function dropModel(dataset: string, modelName: string): Promise<void> {
  try {
    const bq = getBigQueryClient();
    const { datasetId, projectId } = parseDatasetRef(dataset);
    await bq.query({
      query: `DROP MODEL IF EXISTS ${modelName}`,
      useLegacySql: false,
      defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
      jobTimeoutMs: 10_000,
      maximumBytesBilled: String(maxBytesBilled()),
    });
  } catch {
    // Best-effort cleanup
  }
}

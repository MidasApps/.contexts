import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { guardGeneratedSql } from '@/features/ai-agents/lib/sql-guard';
import { classifyDryRunError, errorDetail } from '@/shared/lib/bigquery/dry-run-error';
import {
  referencesOutsideScope,
  type AllowedDataset,
  type DryRunReferences,
} from '@/shared/lib/bigquery/query-scope';

export type { AllowedDataset };

/**
 * Validação de SQL escrito pelo modelo ANTES de qualquer execução: a query do
 * `execute_sql`, o `sourceQuery` do CREATE MODEL e o `inputQuery` do
 * ML.PREDICT.
 *
 * Essas queries vêm do modelo, e o modelo lê texto do usuário e dos dados —
 * prompt injection é o vetor. O BigQuery roda script de vários comandos num job
 * só, então SQL sem guarda executa `; DROP …` ou `; EXPORT DATA …` com a
 * service account do app, ou lê o dataset de outro tenant.
 *
 * Três camadas, na ordem:
 * 1. `guardGeneratedSql` — guarda de texto: um comando só, SELECT/WITH, nada de
 *    DML/DDL/scripting/EXPORT, e nada que a camada 3 não enxergue (modelo de
 *    ML, `EXTERNAL_QUERY`, função com CONNECTION — fora de `referencedTables`).
 *    Recusa aqui não chega ao BigQuery. É um MODELO do léxico do BigQuery, e
 *    já errou (comentário terminado em `\r`).
 * 2. Dry-run com `defaultDataset` = dataset que a rota autorizou.
 *    `statementType` precisa ser `SELECT` — é o BigQuery dizendo, com o léxico
 *    DELE, que aquilo é um comando só de leitura. É esta camada, não a 1, que
 *    garante "um comando só".
 * 3. Escopo (`QueryScope.allowed`): toda tabela em `referencedTables` e toda
 *    rotina em `referencedRoutines` precisam estar nos datasets do cliente. É a
 *    resolução do próprio BigQuery — pega `FROM a, b`, função de tabela,
 *    wildcard e nome qualificado de qualquer forma.
 *
 * Sem dry-run bem-sucedido não há como verificar tipo, escopo nem custo, então
 * a falha do dry-run é RECUSA (fail closed) — nunca "0 bytes".
 */

export type TenantQueryRefusalCode =
  | 'SQL_RECUSADO'
  | 'NAO_E_SELECT'
  | 'FORA_DO_TENANT'
  | 'DRY_RUN_FALHOU';

/** Coluna do resultado previsto pelo dry-run. */
export interface PredictedField {
  name: string;
  type: string;
  mode: string;
}

export type TenantQueryCheck =
  | { ok: true; sql: string; bytes: number; schema: PredictedField[] }
  | { ok: false; code: TenantQueryRefusalCode; error: string };

/**
 * Onde a query pode ler. `null` = sem checagem de escopo (só SELECT único).
 * `projectId` ausente = projeto do cliente BigQuery.
 */
export interface QueryScope {
  /** Dataset que resolve nome não qualificado (o mesmo que o `execute_sql` sempre usou). */
  defaultDataset: string;
  allowed: AllowedDataset[] | null;
}

/** Escopo de um dataset só — o dataset que a rota autorizou. */
export function singleDatasetScope(dataset: string): QueryScope {
  const { datasetId, projectId } = parseDatasetRef(dataset);
  return { defaultDataset: dataset, allowed: [{ datasetId, ...(projectId ? { projectId } : {}) }] };
}

/** Tira o `;` final: a query vai embutida em outro comando (`AS …`, `(…)`). */
function withoutTerminator(sql: string): string {
  return sql.trim().replace(/;\s*$/, '').trimEnd();
}

/** Job options que fixam o dataset do tenant para nomes não qualificados. */
export function tenantDefaultDataset(dataset: string): { datasetId: string; projectId?: string } {
  const { datasetId, projectId } = parseDatasetRef(dataset);
  return { datasetId, ...(projectId ? { projectId } : {}) };
}

/**
 * O que o MODELO vê numa recusa: código estável + mensagem genérica.
 *
 * A mensagem crua do BigQuery trazia o id do projeto do app e dizia se uma
 * tabela existe: "Not found: Table P:outro.x" para a inexistente, "fora do
 * tenant" para a existente — um oráculo de existência de tabela de outro
 * cliente. Por isso "não existe", "sem acesso" e "fora do escopo" respondem
 * EXATAMENTE igual, e o detalhe vai só para o log do servidor.
 *
 * Pela mesma razão, a resposta é por CLASSE de erro (`classifyDryRunError`):
 * - erro de sintaxe — acusado antes de o BigQuery resolver nomes — devolve só
 *   a posição `[linha:coluna]`, que é o que o modelo precisa para corrigir;
 * - TODO erro semântico (nome, tipo, "not found", acesso, falha não
 *   reconhecida) e toda query que compila mas lê fora do escopo recebem a
 *   MESMA resposta, byte a byte — dentro ou fora do escopo, exista ou não o
 *   objeto. Sem isso, `DRY_RUN_FALHOU [1:8]` para coluna inexistente numa
 *   tabela de outro tenant versus `FORA_DO_TENANT` para tabela inexistente
 *   era um oráculo de existência de tabela, de coluna e de tipo.
 *
 * O preço: erro de nome ou de tipo na tabela do PRÓPRIO cliente também perde a
 * posição. A mensagem manda conferir nomes e tipos.
 */
const OUT_OF_TENANT_MESSAGE =
  'A query não pôde ser validada: referencia tabela, coluna ou rotina que não existe, não está acessível '
  + 'ou fica fora dos datasets do cliente, ou compara tipos incompatíveis. Nada foi executado. Use só as '
  + 'tabelas do cliente, sem qualificar o nome (ex.: FROM contratos), e confira os nomes e os tipos das colunas.';

function logRefusal(code: TenantQueryRefusalCode, detail: string): void {
  // Log estruturado no servidor; o SQL não vai junto (pode carregar literal com dado).
  console.error(JSON.stringify({ level: 'warn', msg: 'tenant_query_refused', code, detail }));
}

const GENERIC_REFUSAL = { ok: false, code: 'FORA_DO_TENANT', error: OUT_OF_TENANT_MESSAGE } as const;

function dryRunRefusal(err: unknown): Extract<TenantQueryCheck, { ok: false }> {
  const detail = errorDetail(err);
  const errorClass = classifyDryRunError(err);
  if (errorClass.kind === 'semantico') {
    logRefusal('FORA_DO_TENANT', detail);
    return GENERIC_REFUSAL;
  }
  logRefusal('DRY_RUN_FALHOU', detail);
  return {
    ok: false,
    code: 'DRY_RUN_FALHOU',
    error: `A query não compila no BigQuery (erro de sintaxe${errorClass.position ? ` em ${errorClass.position}` : ''}). `
      + 'Revise a query e tente de novo; nada foi executado.',
  };
}

/**
 * `scope` pode vir como função: só é resolvido (leitura de Firestore) depois
 * que a guarda de texto aceitou — recusa barata não paga I/O.
 */
export async function checkTenantQuery(
  sql: string,
  scopeOrLoader: QueryScope | (() => Promise<QueryScope>),
): Promise<TenantQueryCheck> {
  const guard = guardGeneratedSql(sql);
  if (!guard.ok) return { ok: false, code: 'SQL_RECUSADO', error: guard.error };
  const scope = typeof scopeOrLoader === 'function' ? await scopeOrLoader() : scopeOrLoader;

  const query = withoutTerminator(sql);
  const client = getBigQueryClient();
  const defaultProject = client.projectId;

  let stats: {
    totalBytesProcessed?: string | number;
    query?: DryRunReferences & {
      statementType?: string;
      schema?: { fields?: Array<{ name?: string; type?: string; mode?: string }> };
    };
  };
  try {
    const [job] = await client.createQueryJob({
      query,
      dryRun: true,
      useLegacySql: false,
      defaultDataset: tenantDefaultDataset(scope.defaultDataset),
    });
    stats = job.metadata?.statistics ?? {};
  } catch (err) {
    return dryRunRefusal(err);
  }

  const statementType = stats.query?.statementType;
  if (statementType !== 'SELECT') {
    return {
      ok: false,
      code: 'NAO_E_SELECT',
      error: `A query precisa ser um único SELECT; o BigQuery a classificou como ${statementType ?? 'desconhecida'}.`,
    };
  }

  if (scope.allowed) {
    const outside = referencesOutsideScope(stats.query, scope.allowed, defaultProject);
    if (outside.length > 0) {
      logRefusal('FORA_DO_TENANT', `referências fora do escopo: ${outside.join(', ')}`);
      return GENERIC_REFUSAL;
    }
  }

  // Schema só DEPOIS do escopo: o de uma tabela de outro tenant é justamente o
  // que não pode chegar ao modelo.
  const schema = (stats.query?.schema?.fields ?? []).map((f) => ({
    name: f.name ?? '',
    type: f.type ?? 'STRING',
    mode: f.mode ?? 'NULLABLE',
  }));
  return { ok: true, sql: query, bytes: Number(stats.totalBytesProcessed ?? 0), schema };
}

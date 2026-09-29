import 'server-only';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { verifyDatasetAccess, verifyRouteAccess } from '@/shared/lib/api-auth';
import { ClientProductBinding, type Metric } from '@/shared/schemas';
import { getDataSource } from '@/shared/repositories/data-source-repo';
import { getBigQueryClientFor } from '@/shared/lib/bigquery/client';
import type { BigQuery } from '@google-cloud/bigquery';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import {
  referencesOutsideScope,
  SHARED_REFERENCE_TABLES,
  type AllowedDataset,
} from '@/shared/lib/bigquery/query-scope';
import { unwrapRows } from '@/shared/lib/bigquery/cell';
import { quoteIdentifier, UnsafeIdentifierError } from '@/shared/lib/bigquery/identifier';
import {
  resolveMetric,
  resolveDerivedMetric,
  MetricResolutionError,
  type PageFilterValue,
} from '@/shared/lib/metrics/resolve-metric';
import { flattenLegacyBinding } from '@/shared/lib/semantic/flatten-binding';
import { collectBindingGaps, type CoverageGap } from '@/shared/lib/metrics/coverage';
import type { Relation } from '@/shared/schemas/relation';
import type { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';
import { routeForMetric } from '@/shared/lib/permissions/metric-route-map';
import { classifyDryRunError, errorDetail } from '@/shared/lib/bigquery/dry-run-error';

/**
 * Resposta ÚNICA da compilação de template para todo erro semântico e para
 * toda leitura fora dos datasets do cliente — ver `compile`.
 */
const GENERIC_COMPILE_MESSAGE =
  'A consulta não pôde ser validada: referencia entidade, atributo, tabela ou rotina que não existe, não está '
  + 'acessível ou fica fora dos datasets do cliente, ou compara tipos incompatíveis. Use só os placeholders das '
  + 'entidades do contrato (ex.: FROM {contratos}, {contratos.saldo_devedor}) e confira os atributos com '
  + 'list_metric_fields.';

function logCompileFailure(detail: string): void {
  // Log do servidor; o template não vai junto (pode carregar literal com dado).
  console.error(JSON.stringify({ level: 'warn', msg: 'metric_compile_refused', detail }));
}

/**
 * Resultado da execução de UMA métrica. Erros de negócio (cobertura, tenant,
 * propriedade, resolução) nunca lançam: viram `ok:false`. Erros inesperados
 * (BQ/Firestore) viram `ok:false` 500 com mensagem genérica (sem vazar SQL/topologia).
 */
export type MetricExecResult =
  | { ok: true; metricId: string; data: unknown[]; sql: string; outputColumns: string[] }
  | { ok: false; metricId: string; status: number; error: string; missing?: CoverageGap[] };

type DataSourceResult = Awaited<ReturnType<typeof getDataSource>>;
type AccessResult = Awaited<ReturnType<typeof verifyDatasetAccess>>;

/** Recursos compartilhados entre métricas de um mesmo request (dedupe de I/O). */
export interface MetricExecCaches {
  dataSources: Map<string, DataSourceResult>;
  accessChecked: Map<string, AccessResult>;
  routeAccessChecked: Map<string, AccessResult>;
}

export function newMetricExecCaches(): MetricExecCaches {
  return { dataSources: new Map(), accessChecked: new Map(), routeAccessChecked: new Map() };
}

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

export type LoadBindingsResult =
  | { ok: true; bindings: ClientProductBinding[] }
  | { ok: false; status: number; error: string };

/** Carrega + parseia os productBindings do cliente (uma vez por request). */
export async function loadClientBindings(clientId: string): Promise<LoadBindingsResult> {
  const snap = await firestore().collection('clients').doc(clientId).get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: `Cliente "${clientId}" não encontrado` };
  }
  const data = snap.data() as { productBindings?: unknown };
  const raw = Array.isArray(data.productBindings) ? data.productBindings : [];
  if (raw.length === 0) {
    return { ok: false, status: 422, error: `Cliente "${clientId}" sem productBindings configurado` };
  }
  const bindings = raw
    .map((b) => {
      const r = ClientProductBinding.safeParse(b);
      return r.success ? r.data : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
  return { ok: true, bindings };
}

async function cachedDataSource(caches: MetricExecCaches, id: string): Promise<DataSourceResult> {
  const hit = caches.dataSources.get(id);
  if (hit !== undefined) return hit;
  const src = await getDataSource(id);
  caches.dataSources.set(id, src);
  return src;
}

async function cachedAccess(
  caches: MetricExecCaches,
  email: string,
  datasetId: string,
  clientId: string,
): Promise<AccessResult> {
  const hit = caches.accessChecked.get(datasetId);
  if (hit !== undefined) return hit;
  const ac = await verifyDatasetAccess(email, datasetId, clientId);
  caches.accessChecked.set(datasetId, ac);
  return ac;
}

async function cachedRouteAccess(
  caches: MetricExecCaches,
  email: string,
  clientId: string,
  route: string,
): Promise<AccessResult> {
  const hit = caches.routeAccessChecked.get(route);
  if (hit !== undefined) return hit;
  const ra = await verifyRouteAccess(email, clientId, route);
  caches.routeAccessChecked.set(route, ra);
  return ra;
}

export interface ExecuteMetricArgs {
  metric: Metric;
  parsedBindings: ClientProductBinding[];
  clientId: string;
  productId?: string;
  email: string;
  /** Relações conhecidas (vazio quando nenhuma métrica é derived). */
  relations: Relation[];
  pageFilters?: Record<string, PageFilterValue>;
  ambientFilters?: AmbientFilter[];
  caches: MetricExecCaches;
  /**
   * Valida sem executar: o BigQuery compila a query, informa o schema de saída
   * e não lê byte nenhum (custo zero, nenhuma escrita).
   *
   * Existe para a criação de métrica pela IA: antes de um documento entrar no
   * catálogo do cliente ele precisa provar que resolve contra o binding real e
   * que devolve as colunas que declarou. Roda por AQUI, e não por um caminho
   * paralelo, porque tudo que vem antes da query — posse, gate de rota, acesso
   * ao dataset, escolha do binding, resolução dos placeholders — é justamente o
   * que precisa valer também na validação.
   *
   * Com `dryRun`, `data` volta vazio e `outputColumns` traz os nomes REAIS das
   * colunas, na ordem do SELECT (o resolver devolve `[]` para recipe `sql`).
   */
  dryRun?: boolean;
  /**
   * Em vez das linhas da métrica, os VALORES DISTINTOS de um campo dela — as
   * opções do seletor de página (ADR-0026).
   *
   * Passa por aqui, e não por uma consulta paralela à tabela da entidade, para
   * que o seletor ofereça exatamente o que a tela mostra: a query resolvida já
   * traz os JOINs da métrica, então "BANCO INTER" chega ao dropdown em vez do
   * código `77`. De quebra, herda posse, gate de rota, escolha de binding e
   * teto de bytes — tudo que valia para executar a métrica vale para listar
   * seus valores.
   */
  distinctField?: string;
}

/** Teto de opções de um seletor — dropdown maior que isso não se navega. */
const OPTIONS_LIMIT = 200;

/**
 * Envolve a query da métrica num DISTINCT de um campo do resultado.
 *
 * O campo vem do documento da página (escrito pelo assistente), então passa
 * pelo mesmo `quoteIdentifier` de qualquer outro identificador — sem isso, um
 * nome com crase emendaria SQL no meio da cláusula.
 */
function wrapInDistinct(
  resolved: { sql: string; params: Record<string, unknown> },
  field: string,
): { sql: string; params: Record<string, unknown>; outputColumns: string[] } {
  const col = quoteIdentifier(field, 'column');
  return {
    sql: `SELECT DISTINCT ${col} AS value FROM (${resolved.sql}) `
      + `WHERE ${col} IS NOT NULL ORDER BY 1 LIMIT ${OPTIONS_LIMIT}`,
    params: resolved.params,
    outputColumns: ['value'],
  };
}

export async function executeMetric(args: ExecuteMetricArgs): Promise<MetricExecResult> {
  const { metric, parsedBindings, clientId, productId, email, relations, pageFilters, ambientFilters, caches, dryRun, distinctField } = args;
  type DatasetBinding = (typeof parsedBindings)[number]['datasets'][number];

  const fail = (status: number, error: string, missing?: CoverageGap[]): MetricExecResult => ({
    ok: false,
    metricId: metric.id,
    status,
    error,
    ...(missing ? { missing } : {}),
  });
  /*
   * `unwrapRows` aqui, e não em cada consumidor: este é o ÚNICO ponto
   * por onde a linha do BigQuery entra no aplicativo, e o embrulho de data
   * (`{ value: '2026-09-15' }`) atravessa o JSON da API intacto. Quem o
   * recebia tinha de desembrulhar por conta própria — e cada bloco cobria um
   * subconjunto diferente dos casos, até três indicadores do Vila Rosa
   * exibirem `[object Object]` no lugar da data.
   */
  const okResult = (r: { sql: string; outputColumns: string[] }, rows: unknown[]): MetricExecResult => ({
    ok: true,
    metricId: metric.id,
    data: unwrapRows(rows),
    sql: r.sql,
    outputColumns: r.outputColumns,
  });
  /** Compila a query no BigQuery e devolve o schema previsto, sem ler dados. */
  /**
   * Datasets que a métrica deste cliente pode ler: os de TODOS os bindings do
   * cliente (já carregados no servidor, `parsedBindings`), no projeto do seu
   * dataSource, mais as tabelas de referência compartilhadas. Binding cujo
   * dataSource não existe fica de fora.
   */
  const clientScope = async (): Promise<AllowedDataset[]> => {
    const out: AllowedDataset[] = [];
    for (const b of parsedBindings) {
      for (const d of b.datasets) {
        const src = await cachedDataSource(caches, d.dataSourceId);
        if (src?.projectId) out.push({ projectId: src.projectId, datasetId: d.datasetId });
      }
    }
    return [...out, ...SHARED_REFERENCE_TABLES];
  };
  /**
   * Compila a query no BigQuery e devolve o schema previsto, sem ler dados.
   *
   * Só o caminho `dryRun` passa aqui — hoje, só `validateDraft`, isto é, a
   * AUTORIA de métrica pelo assistente (`create_metric`/`update_metric`). O
   * render (`/api/metrics/batch`, `/api/metrics/[id]/data`, `filter-values`)
   * executa direto, sem dry-run; por isso o escopo é conferido aqui, reusando o
   * dry-run que já existe, e não no render, onde exigiria um round trip a mais
   * por métrica exibida.
   */
  const compile = async (
    bq: BigQuery,
    resolved: { sql: string; params: Record<string, unknown> },
    defaultProject: string,
  ) => {
    try {
      const [job] = await bq.createQueryJob({
        query: resolved.sql,
        params: resolved.params,
        dryRun: true,
        useLegacySql: false,
      });
      /*
       * O template de métrica pode ter nascido de LLM e, depois deste
       * dry-run, a validação roda uma amostra DE VERDADE. A guarda de texto
       * (`guardGeneratedSql`) é um modelo do léxico do BigQuery e já divergiu
       * dele (comentário terminado em `\r`); aqui quem decide é o próprio
       * BigQuery: só um SELECT compila como métrica.
       */
      const statementType = job.metadata?.statistics?.query?.statementType;
      if (statementType !== 'SELECT') {
        return fail(
          422,
          `A consulta precisa ser um único SELECT; o BigQuery a classificou como ${statementType ?? 'desconhecida'}.`,
        );
      }
      /*
       * I3: o template pode ter vindo de LLM, e a guarda de texto só olha o
       * token depois de FROM/JOIN — `{contratos}, outro.tabela`,
       * `outro . tabela`, `APPENDS(TABLE outro.tabela, …)` passavam. O
       * dry-run sabe tudo o que a query lê; fora dos datasets do cliente, a
       * métrica não compila (e, na autoria, não é gravada nem amostrada).
       */
      const outside = referencesOutsideScope(job.metadata?.statistics?.query, await clientScope(), defaultProject);
      if (outside.length > 0) {
        // Mesma resposta de um erro semântico: nomear a tabela alheia, ou só
        // responder diferente de "não existe", diria que ela existe.
        logCompileFailure(`referências fora do escopo: ${outside.join(', ')}`);
        return fail(422, GENERIC_COMPILE_MESSAGE);
      }
      const fields = job.metadata?.statistics?.query?.schema?.fields ?? [];
      const outputColumns = (fields as Array<{ name?: string }>).map((f) => f.name ?? '');
      return okResult({ sql: resolved.sql, outputColumns }, []);
    } catch (err) {
      /*
       * Por CLASSE de erro (`classifyDryRunError`). A mensagem do BigQuery
       * voltava inteira ao assistente — "Not found: Table <projeto>:outro.x",
       * "argument types: STRING, INT64", "Did you mean <coluna>?" —, um
       * oráculo de schema de outro tenant pela autoria de métrica. Erro de
       * sintaxe (acusado antes de resolver nomes) devolve a posição; todo o
       * resto, a mesma resposta genérica, e o detalhe vai só para o log.
       */
      const errorClass = classifyDryRunError(err);
      logCompileFailure(errorDetail(err));
      if (errorClass.kind === 'sintaxe') {
        return fail(
          422,
          `A consulta não compila no BigQuery (erro de sintaxe${errorClass.position ? ` em ${errorClass.position}` : ''}). `
          + 'Revise o template e tente de novo.',
        );
      }
      return fail(422, GENERIC_COMPILE_MESSAGE);
    }
  };

  // Escopo de propriedade: global (null) visível a todos; de cliente só no próprio.
  const owner = (metric as { ownerClientId?: string | null }).ownerClientId ?? null;
  if (owner !== null && owner !== clientId) {
    return fail(403, 'Métrica pertence a outro cliente');
  }
  if (!metric.recipe) {
    return fail(422, `Métrica "${metric.id}" sem recipe — não é executável`);
  }

  try {
    // Permissão de rota (G1): se a métrica serve uma página específica, exige
    // canAccessRoute — paridade com /api/bigquery. Métricas compartilhadas
    // (routeForMetric → null) ficam só com o tenant-check (cachedAccess) abaixo.
    const route = routeForMetric(metric.id);
    if (route) {
      const ra = await cachedRouteAccess(caches, email, clientId, route);
      if (!ra.allowed) return fail(ra.status ?? 403, ra.error ?? 'Sem permissão para esta página');
    }

    // ── Recipe derived (cross-contract, multi-binding) ──────────────────────
    if (metric.recipe.kind === 'derived') {
      const recipe = metric.recipe;
      const contractIds = new Set<string>();
      contractIds.add(recipe.primaryEntity.split('.')[0]);
      recipe.terms.forEach((t) => { if (t.valueRef) contractIds.add(t.valueRef.split('.')[0]); });
      (recipe.groupByRefs ?? []).forEach((r) => contractIds.add(r.split('.')[0]));
      (recipe.filters ?? []).forEach((f) => contractIds.add(f.attribute.split('.')[0]));
      if (recipe.timeRef) contractIds.add(recipe.timeRef.split('.')[0]);
      for (const j of recipe.joins) {
        const rel = relations.find((r) => r.id === j.relationId);
        if (!rel) return fail(422, `Relação "${j.relationId}" não encontrada`);
        contractIds.add(rel.leftRef.split('.')[0]);
        contractIds.add(rel.rightRef.split('.')[0]);
      }

      const primaryContractId = recipe.primaryEntity.split('.')[0];
      const bindingsByContract: Record<string, DatasetBinding> = {};
      const projectIdByContract: Record<string, string> = {};
      let bqDataSourceId: string | undefined;

      for (const contractId of contractIds) {
        let found: DatasetBinding | undefined;
        for (const b of parsedBindings) {
          const d = b.datasets.find((ds) => ds.contractRef === contractId);
          if (d) { found = d; break; }
        }
        if (!found) return fail(422, `Cliente não cobre o contrato "${contractId}" exigido pela métrica`);

        const ac = await cachedAccess(caches, email, found.datasetId, clientId);
        if (!ac.allowed) return fail(ac.status ?? 403, ac.error ?? 'Sem permissão');

        const hasFlat = found.schemaBindings && Object.keys(found.schemaBindings).length > 0;
        const resolvedDs = hasFlat ? found : { ...found, schemaBindings: flattenLegacyBinding(found.schema) };

        const src = await cachedDataSource(caches, found.dataSourceId);
        if (!src) return fail(422, `DataSource "${found.dataSourceId}" não encontrada`);

        bindingsByContract[contractId] = resolvedDs;
        projectIdByContract[contractId] = src.projectId;
        if (contractId === primaryContractId) bqDataSourceId = found.dataSourceId;
      }

      if (new Set(Object.values(projectIdByContract)).size > 1) {
        return fail(422, 'Métrica cross-contract exige datasets no mesmo projeto BigQuery');
      }

      const derived = resolveDerivedMetric({ metric, bindingsByContract, relations, projectIdByContract, pageFilters, ambientFilters });
      const resolved = distinctField ? wrapInDistinct(derived, distinctField) : derived;
      const bqd = await getBigQueryClientFor(bqDataSourceId ?? bindingsByContract[primaryContractId].dataSourceId);
      if (dryRun) return compile(bqd, resolved, projectIdByContract[primaryContractId]);
      const [rows] = await bqd.query({
        query: resolved.sql,
        params: resolved.params,
        /*
         * Teto de bytes em toda execução de derived, render e seletor
         * (rules/cost.md: sem exceção). A execução normal ficava sem teto para
         * não derrubar métrica que passasse do limite — mas não há métrica
         * derived no catálogo (as 332 são `sql`), então nada regride, e o
         * render é disparado por qualquer usuário que abra a página.
         */
        maximumBytesBilled: String(maxBytesBilled()),
      });
      return okResult(resolved, rows as unknown[]);
    }

    // ── Recipe single-contract (aggregation | sql) ──────────────────────────
    const metricContractId = metric.requires[0]?.split('.')[0];
    const pickByContract = (b: (typeof parsedBindings)[number]): DatasetBinding | null =>
      metricContractId ? b.datasets.find((d) => d.contractRef === metricContractId) ?? null : null;

    let binding: (typeof parsedBindings)[number] | undefined;
    let dataset: DatasetBinding | null | undefined;
    if (metricContractId) {
      const ordered = productId
        ? [...parsedBindings.filter((b) => b.productId === productId), ...parsedBindings.filter((b) => b.productId !== productId)]
        : parsedBindings;
      for (const b of ordered) {
        const d = pickByContract(b);
        if (d) { binding = b; dataset = d; break; }
      }
      if (!dataset) return fail(422, `Nenhum dataset do cliente cobre o contrato "${metricContractId}"`);
    }

    if (!binding) {
      binding = (productId && parsedBindings.find((b) => b.productId === productId)) || parsedBindings[0];
    }
    if (!binding) return fail(422, 'Cliente sem productBindings utilizáveis');
    if (!dataset) dataset = binding.datasets.find((d) => d.isPrimary) ?? binding.datasets[0];
    if (!dataset) return fail(422, 'Product binding sem dataset');

    const ac = await cachedAccess(caches, email, dataset.datasetId, clientId);
    if (!ac.allowed) return fail(ac.status ?? 403, ac.error ?? 'Sem permissão');

    const hasFlat = dataset.schemaBindings && Object.keys(dataset.schemaBindings).length > 0;
    const resolvedDataset = hasFlat ? dataset : { ...dataset, schemaBindings: flattenLegacyBinding(dataset.schema) };

    if (metricContractId && metric.recipe.kind !== 'sql') {
      const gaps = collectBindingGaps(metric.requires, resolvedDataset, metricContractId);
      if (gaps.length > 0) {
        return fail(422, `Cliente não cobre todos os atributos exigidos pela métrica no contrato "${metricContractId}"`, gaps);
      }
    }

    const source = await cachedDataSource(caches, dataset.dataSourceId);
    if (!source) return fail(422, `DataSource "${dataset.dataSourceId}" não encontrada`);

    const base = resolveMetric({ metric, binding: resolvedDataset, projectId: source.projectId, pageFilters, ambientFilters });
    const resolved = distinctField ? wrapInDistinct(base, distinctField) : base;
    const bq = await getBigQueryClientFor(resolvedDataset.dataSourceId);
    // Mesmo teto do execute_sql: a recipe da métrica pode ter sido gerada por
    // LLM (chat-metric) e persistida, então executá-la sem limite deixa
    // a exposição de custo aberta por outra porta.
    if (dryRun) return compile(bq, resolved, source.projectId);
    const [rows] = await bq.query({
      query: resolved.sql,
      params: resolved.params,
      maximumBytesBilled: String(maxBytesBilled()),
    });
    return okResult(resolved, rows as unknown[]);
  } catch (err) {
    if (err instanceof MetricResolutionError) return fail(422, err.message);
    // Campo de seletor que não é identificador: erro de quem pediu, não do servidor.
    if (err instanceof UnsafeIdentifierError) return fail(422, err.message);
    // Mensagem genérica: ApiError do BQ/Firestore vazaria SQL/topologia.
    return fail(500, 'Erro ao executar métrica');
  }
}

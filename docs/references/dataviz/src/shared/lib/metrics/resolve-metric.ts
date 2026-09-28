import 'server-only';
import type { Metric, MetricFilter, MetricRecipe } from '@/shared/schemas/metric';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';
import type { Relation } from '@/shared/schemas/relation';
import { quoteIdentifier, quoteTableRef, safeDatasetRef } from '@/shared/lib/bigquery/identifier';
import { renderExpression, validateExpression } from './expression';
import type { AmbientFilter } from './ambient-filter';

/**
 * Resolve uma Metric contra o binding de um cliente, produzindo SQL
 * BigQuery executável e parâmetros.
 *
 * Inputs:
 *   metric  — definição canônica (recipe em vocabulário entity.attribute)
 *   binding — dataset bound do cliente (datasetId + schemaBindings)
 *   filters — filtros globais da página (date range, projetos, etc.)
 *
 * Garantias:
 *   - Identificadores SQL sempre sanitizados (`safe*` helpers).
 *   - Valores SEMPRE em params nomeados (`@nome`), nunca interpolados.
 *   - Falha cedo: attribute sem binding lança MetricResolutionError.
 */

export interface ResolveMetricOptions {
  metric: Metric;
  binding: ClientDatasetBinding;
  /** Project GCP (vem do DataSource, não do binding). Necessário para `projeto.dataset.tabela`. */
  projectId?: string;
  /** Filtros globais da página. Mapa pelo id usado em filter.* (ex: `date_range`, `projetos`). */
  pageFilters?: Record<string, PageFilterValue>;
  /** Filtros avançados de página, aplicados a recipes aggregation (best-effort). */
  ambientFilters?: AmbientFilter[];
}

export type PageFilterValue =
  | { kind: 'date_range'; start: string; end: string; attribute: string }
  | { kind: 'snapshot'; value: string; attribute: string }
  /**
   * "Em ou antes de" — a posição VIGENTE ao fim do período.
   *
   * Existe porque as entidades têm cadências diferentes: `contratos` tem
   * snapshot de julho, `covenants_calculo` e `certidoes` param em junho. Com
   * `BETWEEN`, escolher julho esvaziava esses cartões — e uma posição de
   * estoque não deixa de valer por não ter sido remedida: a certidão
   * consultada em junho continua sendo a situação vigente em julho.
   */
  | { kind: 'ate'; value: string; attribute: string }
  /**
   * `attribute` é opcional desde a ADR-0026: quando a métrica declara
   * `filterFields[key]`, é ela quem diz o que comparar — a página só manda os
   * valores escolhidos. Filtro gravado antes disso continua trazendo o
   * attribute, e continua valendo.
   */
  | { kind: 'in'; values: Array<string | number>; attribute?: string };

export interface ResolvedMetric {
  sql: string;
  params: Record<string, unknown>;
  /** Colunas no SELECT (na ordem). Útil para o cliente saber o shape. */
  outputColumns: string[];
}

export class MetricResolutionError extends Error {
  constructor(message: string, public readonly metricId: string) {
    super(`[metric ${metricId}] ${message}`);
    this.name = 'MetricResolutionError';
  }
}

const TIME_GRAIN_TO_BQ: Record<string, string> = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  quarter: 'QUARTER',
  year: 'YEAR',
};

/**
 * Resolve `entity.attribute` para coluna real do cliente.
 *
 * Regras (ADR-0015 §Resolution rules):
 *   - binding mapeia para string → usa essa coluna.
 *   - binding mapeia para null  → métrica falha (cliente declarou indisponível).
 *   - binding ausente            → assume attribute_id como coluna real
 *                                  (back-compat com spec 2026-03-16).
 */
function resolveColumn(
  binding: ClientDatasetBinding,
  ref: string,
  metricId: string,
): string {
  const bound = binding.schemaBindings?.[ref];
  if (bound === null) {
    throw new MetricResolutionError(
      `Attribute "${ref}" marcado como indisponível neste cliente.`,
      metricId,
    );
  }
  if (typeof bound === 'string') {
    return quoteIdentifier(bound, 'column');
  }
  // Binding ausente para esta key.
  const attributeId = ref.split('.')[1];
  if (!attributeId) {
    throw new MetricResolutionError(`Ref inválida "${ref}".`, metricId);
  }
  // Cliente migrado (schemaBindings não-vazio) mas sem mapping para esta key:
  // falha-cedo. Assumir attributeId como coluna real arriscaria consultar uma
  // coluna inexistente (erro de runtime no BQ / dado errado).
  const isMigrated = !!binding.schemaBindings && Object.keys(binding.schemaBindings).length > 0;
  if (isMigrated) {
    throw new MetricResolutionError(
      `Attribute "${ref}" sem mapping em schemaBindings deste cliente.`,
      metricId,
    );
  }
  // Cliente legado (schemaBindings vazio) — fallback back-compat: attributeId é
  // o próprio nome da coluna. Observável via warn.
  console.warn(
    `[metric ${metricId}] resolveColumn fallback: "${ref}" sem binding; usando "${attributeId}" como coluna (cliente legado).`,
  );
  return quoteIdentifier(attributeId, 'column');
}

/**
 * Como `resolveColumn`, mas retorna `null` em vez de lançar quando o attribute
 * está indisponível (mapeado null, ou migrado sem mapping). Usado por filtros
 * ambiente, que são best-effort (pulam quando a coluna não existe).
 */
function tryResolveColumn(binding: ClientDatasetBinding, ref: string): string | null {
  const bound = binding.schemaBindings?.[ref];
  if (bound === null) return null;
  if (typeof bound === 'string') return quoteIdentifier(bound, 'column');
  const migrated = !!binding.schemaBindings && Object.keys(binding.schemaBindings).length > 0;
  if (migrated) return null;
  const attr = ref.split('.')[1];
  return attr ? quoteIdentifier(attr, 'column') : null;
}

/**
 * Resolve a tabela física de uma entidade no binding do cliente, aplicando
 * `tableBindings` (entityId → tableId divergente) quando presente. Exportada
 * para reuso fora do resolver de métricas (ex: `/api/metrics/filter-values`,
 * que monta `SELECT DISTINCT` fora do pipeline de recipe).
 */
export function tableRef(
  binding: ClientDatasetBinding,
  entityId: string,
  projectId?: string,
): string {
  // Por padrão entityId corresponde 1:1 ao tableId no BigQuery; `tableBindings`
  // permite mapear a entidade para uma tabela física com nome divergente.
  const physical = binding.tableBindings?.[entityId] ?? entityId;
  const ds = safeDatasetRef(binding.datasetId);
  return quoteTableRef({
    projectId: projectId ?? ds.projectId,
    datasetId: ds.datasetId,
    tableId: physical,
  });
}

function nextParam(params: Record<string, unknown>, prefix: string): string {
  let i = 0;
  let name = `${prefix}`;
  while (name in params) {
    i += 1;
    name = `${prefix}_${i}`;
  }
  return name;
}

function buildFilterClause(
  filter: MetricFilter,
  binding: ClientDatasetBinding,
  metricId: string,
  params: Record<string, unknown>,
  pageFilters: Record<string, PageFilterValue> | undefined,
): string {
  const col = resolveColumn(binding, filter.attribute, metricId);

  if (filter.op === 'is_null') return `${col} IS NULL`;
  if (filter.op === 'is_not_null') return `${col} IS NOT NULL`;

  // Page filter reference: value = "filter.date_range" etc.
  if (typeof filter.value === 'string' && filter.value.startsWith('filter.')) {
    const filterKey = filter.value.slice('filter.'.length);
    const pf = pageFilters?.[filterKey];
    if (!pf) {
      // Filtro de página não preenchido — vira no-op (TRUE), métrica continua executando.
      return '1=1';
    }
    if (pf.kind === 'date_range') {
      const startName = nextParam(params, `${filterKey}_start`);
      const endName = nextParam(params, `${filterKey}_end`);
      params[startName] = pf.start;
      params[endName] = pf.end;
      return `${col} BETWEEN @${startName} AND @${endName}`;
    }
    if (pf.kind === 'snapshot') {
      const name = nextParam(params, filterKey);
      params[name] = pf.value;
      return `${col} = @${name}`;
    }
    if (pf.kind === 'ate') {
      const name = nextParam(params, filterKey);
      params[name] = pf.value;
      return `${col} <= @${name}`;
    }
    if (pf.kind === 'in') {
      if (pf.values.length === 0) return '1=1';
      const name = nextParam(params, filterKey);
      params[name] = pf.values;
      return `${col} IN UNNEST(@${name})`;
    }
    return '1=1';
  }

  // Literal value(s).
  const name = nextParam(params, filter.attribute.replace('.', '_'));
  params[name] = filter.value;
  switch (filter.op) {
    case '=':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return `${col} ${filter.op} @${name}`;
    case 'in':
      return `${col} IN UNNEST(@${name})`;
    case 'not_in':
      return `${col} NOT IN UNNEST(@${name})`;
    case 'between':
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        throw new MetricResolutionError(
          `Filtro "between" exige array [start, end] no attribute ${filter.attribute}.`,
          metricId,
        );
      }
      params[`${name}_start`] = filter.value[0];
      params[`${name}_end`] = filter.value[1];
      delete params[name];
      return `${col} BETWEEN @${name}_start AND @${name}_end`;
  }
  return '1=1';
}

/** Monta a cláusula SQL de um AmbientFilter a partir da coluna já resolvida. */
function ambientClauseFromColumn(
  col: string,
  f: AmbientFilter,
  params: Record<string, unknown>,
): string | null {
  if (f.op === 'in') {
    if (f.values.length === 0) return null;
    const name = nextParam(params, f.attribute.replace(/\./g, '_'));
    params[name] = f.values;
    return `${col} IN UNNEST(@${name})`;
  }

  // numeric_buckets
  const parts: string[] = [];
  for (const b of f.buckets) {
    if ('eq' in b) {
      const n = nextParam(params, 'bk');
      params[n] = b.eq;
      parts.push(`${col} = @${n}`);
    } else if (b.min !== undefined && b.max !== undefined) {
      const a = nextParam(params, 'bk');
      const c = nextParam(params, 'bk');
      params[a] = b.min;
      params[c] = b.max;
      parts.push(`${col} BETWEEN @${a} AND @${c}`);
    } else if (b.min !== undefined) {
      const n = nextParam(params, 'bk');
      params[n] = b.min;
      parts.push(`${col} >= @${n}`);
    } else if (b.max !== undefined) {
      const n = nextParam(params, 'bk');
      params[n] = b.max;
      parts.push(`${col} <= @${n}`);
    }
  }
  return parts.length ? `(${parts.join(' OR ')})` : null;
}

/**
 * Constrói a cláusula WHERE de um filtro ambiente, ou `null` para pular
 * (attribute de outra entidade, não bound, ou vazio). Best-effort, fail-safe.
 */
function buildAmbientClause(
  f: AmbientFilter,
  binding: ClientDatasetBinding,
  primaryEntity: string,
  params: Record<string, unknown>,
): string | null {
  const [entity] = f.attribute.split('.');
  if (entity !== primaryEntity) return null;
  const col = tryResolveColumn(binding, f.attribute);
  if (col === null) return null;
  return ambientClauseFromColumn(col, f, params);
}

function aggExpr(agg: string, columnOrStar: string): string {
  switch (agg) {
    case 'count':
      return `COUNT(${columnOrStar})`;
    case 'count_distinct':
      return `COUNT(DISTINCT ${columnOrStar})`;
    case 'sum':
      return `SUM(${columnOrStar})`;
    case 'avg':
      return `AVG(${columnOrStar})`;
    case 'min':
      return `MIN(${columnOrStar})`;
    case 'max':
      return `MAX(${columnOrStar})`;
  }
  throw new Error(`Aggregation desconhecida: ${agg}`);
}

function resolveAggregationRecipe(
  metric: Metric,
  recipe: Extract<MetricRecipe, { kind: 'aggregation' }>,
  binding: ClientDatasetBinding,
  projectId: string | undefined,
  pageFilters: Record<string, PageFilterValue> | undefined,
  ambientFilters: AmbientFilter[] | undefined,
): ResolvedMetric {
  const params: Record<string, unknown> = {};
  const selectParts: string[] = [];
  const groupByExprs: string[] = [];
  const outputColumns: string[] = [];

  // Time series column comes first.
  if (recipe.timeAttribute) {
    const grain = recipe.timeGrain ?? 'month';
    const truncUnit = TIME_GRAIN_TO_BQ[grain];
    const timeCol = resolveColumn(binding, recipe.timeAttribute, metric.id);
    const expr = `DATE_TRUNC(${timeCol}, ${truncUnit})`;
    selectParts.push(`${expr} AS bucket`);
    groupByExprs.push(expr);
    outputColumns.push('bucket');
  }

  // Group-by attributes — each becomes a labelled column.
  for (const ref of recipe.groupByAttributes ?? []) {
    const col = resolveColumn(binding, ref, metric.id);
    const alias = ref.split('.')[1];
    selectParts.push(`${col} AS ${quoteIdentifier(alias, 'alias')}`);
    groupByExprs.push(col);
    outputColumns.push(alias);
  }

  // Aggregation column (always called `value`).
  let aggColumn = '*';
  if (recipe.valueAttribute) {
    aggColumn = resolveColumn(binding, recipe.valueAttribute, metric.id);
  } else if (recipe.aggregation !== 'count' && recipe.aggregation !== 'count_distinct') {
    throw new MetricResolutionError(
      `Aggregation "${recipe.aggregation}" exige valueAttribute.`,
      metric.id,
    );
  }
  selectParts.push(`${aggExpr(recipe.aggregation, aggColumn)} AS value`);
  outputColumns.push('value');

  const from = tableRef(binding, recipe.primaryEntity, projectId);

  const whereParts: string[] = [];
  for (const f of recipe.filters ?? []) {
    whereParts.push(buildFilterClause(f, binding, metric.id, params, pageFilters));
  }
  for (const af of ambientFilters ?? []) {
    const clause = buildAmbientClause(af, binding, recipe.primaryEntity, params);
    if (clause) whereParts.push(clause);
  }

  const orderByClause = recipe.orderBy
    ? `ORDER BY ${resolveColumn(binding, recipe.orderBy.attribute, metric.id)} ${recipe.orderBy.dir === 'desc' ? 'DESC' : 'ASC'}`
    : recipe.timeAttribute
      ? `ORDER BY bucket ASC`
      : '';

  const limitClause = recipe.limit ? `LIMIT ${Math.floor(recipe.limit)}` : '';

  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${from}`,
    whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : '',
    orderByClause,
    limitClause,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params, outputColumns };
}

function resolveSqlRecipe(
  metric: Metric,
  recipe: Extract<MetricRecipe, { kind: 'sql' }>,
  binding: ClientDatasetBinding,
  projectId: string | undefined,
  pageFilters: Record<string, PageFilterValue> | undefined,
  ambientFilters: AmbientFilter[] | undefined,
): ResolvedMetric {
  const params: Record<string, unknown> = {};
  // 1. Substitui {filter.X} ANTES de qualquer outro placeholder, senão a
  //    regex de entity.attribute capturaria `filter.date_range` por engano.
  // Suporta `{filter.X}` (usa pf.attribute default) e
  // `{filter.X:entityId.attributeId}` (override quando a entity do
  // template não é a default do filtro de página).
  let sql = recipe.template.replace(
    /\{filter\.([a-z_][a-z0-9_]*)(?::([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*))?\}/g,
    (_match, key: string, overrideRef: string | undefined) => {
      const pf = pageFilters?.[key];
      if (!pf) return '1=1';
      /*
       * O que este filtro compara, por precedência (ADR-0026):
       *
       * 1. pin no template — quem escreveu `{filter.date_range:transacoes.data}`
       *    mandou explicitamente na coluna;
       * 2. `filterFields[key].expr` — a expressão que ESTA métrica exibe. Vai
       *    verbatim: os `{entidade.atributo}` dentro dela são resolvidos no
       *    passo 2 abaixo, junto com os do resto do template;
       * 3. `pf.attribute` — filtro gravado antes da ADR-0026;
       * 4. nada — no-op. Acontece entre declarar o filtro na página e a métrica
       *    ganhar o campo; derrubar a página inteira por isso seria pior.
       */
      const declared = metric.filterFields?.[key];
      const col = overrideRef
        ? resolveColumn(binding, overrideRef, metric.id)
        : declared?.expr
          ?? (pf.attribute ? resolveColumn(binding, pf.attribute, metric.id) : null);
      if (col === null) return '1=1';
      if (pf.kind === 'date_range') {
        const startName = nextParam(params, `${key}_start`);
        const endName = nextParam(params, `${key}_end`);
        params[startName] = pf.start;
        params[endName] = pf.end;
        return `${col} BETWEEN @${startName} AND @${endName}`;
      }
      if (pf.kind === 'snapshot') {
        const name = nextParam(params, key);
        params[name] = pf.value;
        return `${col} = @${name}`;
      }
      if (pf.kind === 'ate') {
        const name = nextParam(params, key);
        params[name] = pf.value;
        return `${col} <= @${name}`;
      }
      if (pf.kind === 'in') {
        if (pf.values.length === 0) return '1=1';
        const name = nextParam(params, key);
        params[name] = pf.values;
        return `${col} IN UNNEST(@${name})`;
      }
      return '1=1';
    },
  );
  // 1.5. Substitui {ambient:entity} pelas cláusulas dos filtros ambiente daquela
  //      entidade (ANDed), ou TRUE (no-op). Antes de {entity.attribute}/{entity}.
  sql = sql.replace(/\{ambient:([a-z_][a-z0-9_]*)\}/g, (_m, entity: string) => {
    const clauses: string[] = [];
    for (const af of ambientFilters ?? []) {
      if (af.attribute.split('.')[0] !== entity) continue;
      const col = tryResolveColumn(binding, af.attribute);
      if (col === null) continue;
      const clause = ambientClauseFromColumn(col, af, params);
      if (clause) clauses.push(clause);
    }
    return clauses.length ? clauses.join(' AND ') : 'TRUE';
  });
  // 2. Substitui {entity.attribute} → coluna real.
  sql = sql.replace(
    /\{([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\}/g,
    (_, entity, attr) => resolveColumn(binding, `${entity}.${attr}`, metric.id),
  );
  // 3. Substitui {entity} → tabela qualificada.
  sql = sql.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_, entity) =>
    tableRef(binding, entity, projectId),
  );

  return { sql, params, outputColumns: [] };
}

/**
 * Filtro de recipe `derived` — espelha `buildFilterClause`, mas resolve a
 * coluna via `col` (ref 3-part `contractId.entity.attr`, multi-binding).
 */
function buildDerivedFilter(
  filter: { attribute: string; op: string; value?: unknown },
  col: (ref: string) => string,
  params: Record<string, unknown>,
  pageFilters: Record<string, PageFilterValue> | undefined,
): string {
  const c = col(filter.attribute);
  if (filter.op === 'is_null') return `${c} IS NULL`;
  if (filter.op === 'is_not_null') return `${c} IS NOT NULL`;

  if (typeof filter.value === 'string' && filter.value.startsWith('filter.')) {
    const key = filter.value.slice('filter.'.length);
    const pf = pageFilters?.[key];
    if (!pf) return '1=1';
    if (pf.kind === 'date_range') {
      const s = nextParam(params, `${key}_start`);
      const e = nextParam(params, `${key}_end`);
      params[s] = pf.start;
      params[e] = pf.end;
      return `${c} BETWEEN @${s} AND @${e}`;
    }
    if (pf.kind === 'snapshot') {
      const n = nextParam(params, key);
      params[n] = pf.value;
      return `${c} = @${n}`;
    }
    if (pf.kind === 'in') {
      if (pf.values.length === 0) return '1=1';
      const n = nextParam(params, key);
      params[n] = pf.values;
      return `${c} IN UNNEST(@${n})`;
    }
    return '1=1';
  }

  const n = nextParam(params, filter.attribute.replace(/\./g, '_'));
  params[n] = filter.value;
  return `${c} ${filter.op} @${n}`;
}

export interface ResolveDerivedOptions {
  metric: Metric;
  /** Binding do cliente para cada `contractId` exigido pela métrica. */
  bindingsByContract: Record<string, ClientDatasetBinding>;
  /** Todas as relações conhecidas (coleção `relations`). */
  relations: Relation[];
  /** Project GCP por contrato (default: o do datasetId). */
  projectIdByContract?: Record<string, string>;
  pageFilters?: Record<string, PageFilterValue>;
  ambientFilters?: AmbientFilter[];
}

/**
 * Resolve um recipe `derived` (R2): junta entidades de ≥1 Data Contracts via
 * `relations` e combina termos agregados numa `expression` aritmética validada.
 * Multi-binding — cada contrato tem seu próprio `ClientDatasetBinding`.
 *
 * Fail-loud: contrato sem binding, relação ausente ou relação que não conecta
 * as entidades já no escopo → `MetricResolutionError` (nunca SQL contra
 * tabela/coluna errada).
 */
export function resolveDerivedMetric(opts: ResolveDerivedOptions): ResolvedMetric {
  const { metric, bindingsByContract, relations, projectIdByContract, pageFilters, ambientFilters } = opts;
  const recipe = metric.recipe;
  if (!recipe || recipe.kind !== 'derived') {
    throw new MetricResolutionError('Recipe não é derived.', metric.id);
  }

  const bindingFor = (contractId: string): ClientDatasetBinding => {
    const b = bindingsByContract[contractId];
    if (!b) {
      throw new MetricResolutionError(
        `Cliente não cobre o contrato "${contractId}" exigido pela métrica.`,
        metric.id,
      );
    }
    return b;
  };
  // ref 3-part "contractId.entity.attr" → coluna real (via binding do contrato).
  const col = (ref: string): string => {
    const [contractId, entity, attr] = ref.split('.');
    return resolveColumn(bindingFor(contractId), `${entity}.${attr}`, metric.id);
  };
  // "contractId.entity" → tabela qualificada.
  const table = (ceRef: string): string => {
    const [contractId, entity] = ceRef.split('.');
    return tableRef(bindingFor(contractId), entity, projectIdByContract?.[contractId]);
  };

  // FROM + JOINs: monta o escopo de entidades resolvendo relações por id.
  const fromCe = recipe.primaryEntity;
  const inScope = new Set<string>([fromCe]); // "contractId.entity"
  const joinClauses: string[] = [];

  for (const j of recipe.joins) {
    const rel = relations.find((r) => r.id === j.relationId);
    if (!rel) {
      throw new MetricResolutionError(`Relação "${j.relationId}" não encontrada.`, metric.id);
    }
    const leftCe = rel.leftRef.split('.').slice(0, 2).join('.');
    const rightCe = rel.rightRef.split('.').slice(0, 2).join('.');
    const leftIn = inScope.has(leftCe);
    const rightIn = inScope.has(rightCe);
    if (leftIn === rightIn) {
      throw new MetricResolutionError(
        `Relação "${j.relationId}" não conecta as entidades da métrica.`,
        metric.id,
      );
    }
    const newCe = leftIn ? rightCe : leftCe;
    joinClauses.push(`JOIN ${table(newCe)} ON ${col(rel.leftRef)} = ${col(rel.rightRef)}`);
    inScope.add(newCe);
  }

  // Termos → agg(coluna); expressão validada (apenas ids de termos) e renderizada.
  const termSql: Record<string, string> = {};
  for (const t of recipe.terms) {
    const inner = t.valueRef ? col(t.valueRef) : '*';
    termSql[t.id] = aggExpr(t.aggregation, inner);
  }
  validateExpression(recipe.expression, recipe.terms.map((t) => t.id));
  const valueExpr = renderExpression(recipe.expression, termSql);

  const selectParts: string[] = [];
  const groupByExprs: string[] = [];
  const outputColumns: string[] = [];

  if (recipe.timeRef) {
    const grain = TIME_GRAIN_TO_BQ[recipe.timeGrain ?? 'month'];
    const expr = `DATE_TRUNC(${col(recipe.timeRef)}, ${grain})`;
    selectParts.push(`${expr} AS bucket`);
    groupByExprs.push(expr);
    outputColumns.push('bucket');
  }
  for (const ref of recipe.groupByRefs ?? []) {
    const c = col(ref);
    const alias = ref.split('.')[2];
    selectParts.push(`${c} AS ${quoteIdentifier(alias, 'alias')}`);
    groupByExprs.push(c);
    outputColumns.push(alias);
  }
  selectParts.push(`${valueExpr} AS value`);
  outputColumns.push('value');

  const params: Record<string, unknown> = {};
  const whereParts: string[] = [];
  for (const f of recipe.filters ?? []) {
    whereParts.push(buildDerivedFilter(f, col, params, pageFilters));
  }
  for (const af of ambientFilters ?? []) {
    const afEntity = af.attribute.split('.')[0];
    // inScope guarda "contractId.entity"; primaryEntity vem primeiro (ordem de inserção).
    const ce = [...inScope].find((s) => s.split('.')[1] === afEntity);
    if (!ce) continue;
    const contractId = ce.split('.')[0];
    const ambientCol = tryResolveColumn(bindingFor(contractId), af.attribute);
    if (ambientCol === null) continue;
    const clause = ambientClauseFromColumn(ambientCol, af, params);
    if (clause) whereParts.push(clause);
  }

  const orderBy = recipe.orderBy
    ? `ORDER BY ${col(recipe.orderBy.ref)} ${recipe.orderBy.dir === 'desc' ? 'DESC' : 'ASC'}`
    : recipe.timeRef
      ? 'ORDER BY bucket ASC'
      : '';
  const limit = recipe.limit ? `LIMIT ${Math.floor(recipe.limit)}` : '';

  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${table(fromCe)}`,
    ...joinClauses,
    whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : '',
    orderBy,
    limit,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params, outputColumns };
}

export function resolveMetric(opts: ResolveMetricOptions): ResolvedMetric {
  const { metric, binding, projectId, pageFilters, ambientFilters } = opts;
  if (!metric.recipe) {
    throw new MetricResolutionError(
      `Métrica sem recipe — não é executável.`,
      metric.id,
    );
  }
  if (metric.recipe.kind === 'derived') {
    throw new MetricResolutionError(
      `Recipe derived deve ser resolvido via resolveDerivedMetric (multi-binding).`,
      metric.id,
    );
  }
  if (metric.recipe.kind === 'aggregation') {
    return resolveAggregationRecipe(metric, metric.recipe, binding, projectId, pageFilters, ambientFilters);
  }
  return resolveSqlRecipe(metric, metric.recipe, binding, projectId, pageFilters, ambientFilters);
}

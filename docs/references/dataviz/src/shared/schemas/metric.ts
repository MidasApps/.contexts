import { z } from 'zod';
import { Slug } from './identifier';
import type { MetricShape } from '@/features/report-authoring/schema/block-specs';

/**
 * Metric — catálogo global de KPIs/gráficos/tabelas.
 *
 * Substitui o `ProductIndicator` embedded em Product. Cada métrica vive
 * como cidadão top-level em `metrics/{metricId}` e declara suas
 * dependências contra um Data Contract via `requires[]`.
 *
 * Mesma métrica pode ser referenciada por múltiplos Products (ADR-0015).
 */

const SemverString = z.string().regex(/^\d+\.\d+\.\d+$/, {
  message: 'Versão deve seguir semver (x.y.z)',
});

/**
 * ID no formato `domain.slug` (ex: "pdd.total", "carteira.ltv").
 * Substitui o regex `page.slug` do ProductIndicator legado, que misturava
 * eixo de domínio com eixo de UI.
 */
export const MetricId = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, {
  message: 'Metric.id deve seguir o formato "domain.slug" (ex: "pdd.total")',
});

/**
 * Referência para um attribute do contract no formato fully-qualified
 * `contractId.entityId.attributeId`. Em modo single-contract, `contractId`
 * é sempre `canonical`. Multi-contract no futuro só precisa usar IDs
 * diferentes — schema já suporta.
 */
export const AttributeRef = z.string().regex(
  /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/,
  {
    message:
      'AttributeRef deve seguir "contractId.entityId.attributeId" (ex: "canonical.contratos.saldo_devedor")',
  },
);

export const MetricType = z.enum(['kpi', 'chart', 'table']);
export const MetricStatus = z.enum(['active', 'deprecated']);

/**
 * Os valores de `MetricShape` como tupla, para o Zod.
 *
 * O tipo é de `@/features/report-authoring/schema/block-specs` — a régua de
 * layout do canvas, onde cada bloco declara em `aceita:` quais formas sabe
 * renderizar. Aqui só espelhamos os valores, porque Zod precisa deles em
 * runtime e o tipo é apagado na compilação (o import é `type`-only: nenhuma
 * dependência de runtime de `shared/` para `features/`).
 *
 * O `satisfies` trava um sentido (valor daqui que não é `MetricShape`); o
 * sentido inverso — membro novo do tipo que não entrou nesta tupla — é travado
 * pelo `Record<MetricShape, true>` de
 * `scripts/metrics/__tests__/covenants-v2-shapes.test.ts`, que deixa de
 * compilar. (Este comentário citava um `metric-shape.test.ts` que nunca
 * existiu; o guard é real, só mora noutro arquivo.)
 */
export const METRIC_SHAPES = [
  'scalar',
  'timeseries',
  'timeseries_multi',
  'timeseries_pivot',
  'breakdown',
  'rows',
  'targets',
  'points',
  'matrix',
  'funnel',
  'flow',
  'distribution',
] as const satisfies readonly MetricShape[];

export const MetricShapeEnum = z.enum(METRIC_SHAPES);

/** Re-export para quem consome o schema sem conhecer a feature de autoria. */
export type { MetricShape };

/**
 * Referência a um atributo no formato `entityId.attributeId` (contract
 * implícito — single-contract MVP). É uma forma curta de `AttributeRef`
 * usada dentro do `recipe` para legibilidade.
 */
const EntityAttributeRef = z.string().regex(
  /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/,
  {
    message: 'Esperado "entityId.attributeId" (ex: "contratos.saldo_devedor")',
  },
);

const EntityRef = z.string().regex(/^[a-z_][a-z0-9_]*$/);

export const MetricAggregation = z.enum([
  'sum',
  'count',
  'count_distinct',
  'avg',
  'min',
  'max',
]);

export const TimeGrain = z.enum(['day', 'week', 'month', 'quarter', 'year']);

export const FilterOp = z.enum([
  '=',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'not_in',
  'between',
  'is_null',
  'is_not_null',
]);

const Literal = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const FilterValue = z.union([
  Literal,
  z.array(Literal),
  /** Referência a filtro de página: `filter.date_range`, `filter.projetos`, etc. */
  z.string().regex(/^filter\.[a-z_][a-z0-9_]*$/),
]);

export const MetricFilter = z.object({
  attribute: EntityAttributeRef,
  op: FilterOp,
  value: FilterValue.optional(),
});

const AggregationRecipe = z.object({
  kind: z.literal('aggregation'),
  /** Entity principal — `FROM <entity-bound-table>`. */
  primaryEntity: EntityRef,
  aggregation: MetricAggregation,
  /** Omit para `count` (conta linhas) e `count_distinct` quando aplicado à chave da entity. */
  valueAttribute: EntityAttributeRef.optional(),
  /** Se presente, série temporal: GROUP BY DATE_TRUNC(timeAttribute, timeGrain). */
  timeAttribute: EntityAttributeRef.optional(),
  timeGrain: TimeGrain.optional(),
  /** Agrupamento adicional. Cada um vira coluna + entra no GROUP BY. */
  groupByAttributes: z.array(EntityAttributeRef).default([]),
  filters: z.array(MetricFilter).default([]),
  orderBy: z
    .object({
      attribute: EntityAttributeRef,
      dir: z.enum(['asc', 'desc']).default('asc'),
    })
    .optional(),
  limit: z.number().int().positive().max(10000).optional(),
});

const SqlRecipe = z.object({
  kind: z.literal('sql'),
  /**
   * Template SQL com placeholders:
   *   `{entityId.attributeId}` → coluna real (substituída via binding)
   *   `{entityId}`             → tabela qualificada (project.dataset.table)
   *   `{filter.date_range}`    → cláusula AND para filtro global
   */
  template: z.string().min(1).max(10000),
});

/** Chave de filtro de página — o `X` de `{filter.X}`, casado por `resolve-metric`. */
const FilterKey = z.string().regex(/^[a-z_][a-z0-9_]*$/, {
  message: 'Chave de filtro deve ser identifier minúsculo (ex.: "banco")',
});

/**
 * Como uma métrica atende uma chave de filtro de página (ADR-0026).
 *
 * `expr` é SQL cru, com o mesmo nível de confiança do `recipe.template` — mesmo
 * documento, mesmo autor. O dry-run, porém, NÃO a alcança: `validate-draft`
 * resolve a métrica sem seleção de filtro, então `{filter.X}` vira `1=1` e a
 * expressão só chega ao compilador quando alguém escolhe um valor na página.
 * Hoje quem escreve o campo é seed/admin — nenhuma tool o grava.
 *
 * Por isso a guarda aqui é a única antes do SQL. O que a expressão NÃO pode é
 * fechar a cláusula e abrir outra: `;` e os marcadores de comentário do
 * GoogleSQL — `--`, `#` e bloco — ficam de fora. `#` é comentário de linha
 * tanto quanto `--`, e a expressão entra no meio de um `WHERE` que ninguém
 * revisa depois: um comentário ali apaga o `AND` que vier na mesma linha e a
 * consulta continua compilando.
 */
const FilterField = z.object({
  /** Expressão comparada no WHERE. Aceita `{entidade.atributo}`. Ex.: `b.nome_reduzido`. */
  expr: z.string().min(1).max(300).refine(
    (s) => !/;|--|#|\/\*|\*\//.test(s),
    { message: 'expr não pode conter ";" nem marcador de comentário (--, #, bloco)' },
  ),
  /** Coluna do resultado que exibe esse valor — de onde o seletor lê as opções. */
  field: z.string().min(1).max(80).optional(),
  /** Rótulo sugerido para o seletor (ex.: "Banco"). */
  label: z.string().min(1).max(60).optional(),
});

/** Ref "contractId.entityId" (2-part) — entidade qualificada pelo contrato. */
const ContractEntityRef = z.string().regex(
  /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*$/,
  { message: 'Esperado "contractId.entityId" (ex.: "produtos.unidades")' },
);

/** Filtro de recipe derived — `attribute` é 3-part (cross-contract). */
const DerivedFilter = z.object({
  attribute: AttributeRef,
  op: FilterOp,
  value: FilterValue.optional(),
});

/** Termo agregado de uma métrica derived (id local usado na `expression`). */
const DerivedTerm = z.object({
  id: z.string().regex(/^[a-z_][a-z0-9_]*$/, 'id do termo deve ser identifier'),
  aggregation: MetricAggregation,
  valueRef: AttributeRef.optional(),
});

/**
 * Recipe cross-entity/cross-contract (R2). Junta entidades via `relations`
 * (por `relationId`) e combina termos agregados numa `expression` aritmética
 * validada. `requires[]` da métrica pode listar refs de vários contratos.
 */
const DerivedRecipe = z.object({
  kind: z.literal('derived'),
  primaryEntity: ContractEntityRef,
  joins: z.array(z.object({ relationId: Slug })).default([]),
  terms: z.array(DerivedTerm).min(1),
  expression: z.string().min(1).max(500),
  timeRef: AttributeRef.optional(),
  timeGrain: TimeGrain.optional(),
  groupByRefs: z.array(AttributeRef).default([]),
  filters: z.array(DerivedFilter).default([]),
  orderBy: z.object({ ref: AttributeRef, dir: z.enum(['asc', 'desc']).default('asc') }).optional(),
  limit: z.number().int().positive().max(10000).optional(),
});

export const MetricRecipe = z.discriminatedUnion('kind', [
  AggregationRecipe,
  SqlRecipe,
  DerivedRecipe,
]);


export const MetricDoc = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  /**
   * Persistido para back-compat com docs existentes — não exibido na UI.
   * O tipo de visualização é decidido pelo bloco no canvas.
   */
  type: MetricType.default('kpi'),
  /** Persistido para back-compat — sem uso funcional. */
  category: z.string().max(40).optional().nullable(),
  /** Persistido para back-compat — unit canônica vive no Attribute. */
  unit: z.string().max(20).optional().nullable(),
  /** Pelo menos 1 attribute requerido — métrica sem dependência não faz sentido. */
  requires: z.array(AttributeRef).min(1),
  /**
   * Receita de cálculo. Quando presente, a métrica é executável via
   * `resolveMetric()` + `/api/metrics/[id]/data`. Sem recipe, a métrica
   * funciona apenas como rótulo semântico (caminho legado).
   */
  recipe: MetricRecipe.optional(),
  /**
   * Forma do resultado — quantas linhas e que colunas a métrica devolve.
   *
   * Existe porque nada mais no documento diz isso. `type` ('kpi'|'chart'|'table')
   * está marcado como back-compat e não tem **nenhum** leitor em runtime, e
   * `resolveMetric()` devolve `outputColumns: []` para todo recipe
   * `kind: 'sql'` (`resolve-metric.ts:445`) — que é o caso de 100% das métricas
   * `covenants.*` em produção. Sem `shape`, `covenants.contratos_total` (um
   * número) e `covenants.rating_serie` (série pivotada de 8 colunas) chegam à
   * IA como a mesma coisa: daí o gráfico de um ponto só e o KPI exibindo o
   * primeiro mês de uma série como se fosse o valor atual.
   *
   * Os valores são a régua de layout de `block-specs.ts` — cada bloco declara
   * em `aceita:` as formas que sabe renderizar.
   *
   * Opcional por compatibilidade: documento antigo sem o campo continua
   * válido. Quem lê deve tratar `undefined` como "forma desconhecida" e
   * **nunca** presumir `scalar`.
   */
  shape: MetricShapeEnum.optional(),
  /**
   * Nomes das colunas devolvidas pela query, NA ORDEM do SELECT.
   *
   * Complementa `shape`: a forma diz o formato, isto diz os nomes — que são
   * load-bearing no front, porque o shape real é inferido das chaves das linhas
   * (donut usa a 1ª coluna ≠ `value`/`bucket` como rótulo, waterfall lê
   * `bucket` literal, o adapter de série remapeia por `bucket`/`value`).
   * É declarado, não inferido, porque o resolver não introspecta o template
   * `sql` — não confundir com o `outputColumns` de `ResolvedMetric`, que é
   * calculado só para os recipes `aggregation`/`derived`.
   */
  outputColumns: z.array(z.string().min(1).max(80)).max(64).optional(),
  /**
   * Colunas que a query devolve em PONTOS percentuais (82,27), não em fração
   * (0,8227) — ADR-0032/0033.
   *
   * Todo bloco lê isto (`percent-scale.ts`): KPI e tabela, que multiplicam
   * `percent` por 100, recebem fração; os demais recebem pontos. Sem a
   * declaração, um KPI sobre métrica em pontos exibia "8.227,22%" e um gauge
   * sobre métrica em fração, "0,82%". Ausente ⇒ toda coluna é fração.
   */
  percentPointColumns: z.array(z.string().min(1).max(80)).max(64).optional(),
  /**
   * Como ESTA métrica atende cada chave de filtro de página (ADR-0026).
   *
   * A chave é o `X` de `{filter.X}`; o valor diz o que a métrica compara e,
   * quando ela também exibe aquele valor, de que coluna do resultado o seletor
   * pode ler as opções.
   *
   * Existe porque o filtro é sobre o campo do INDICADOR, não sobre a coluna da
   * entidade. `covenants.extrato_table` mostra "BANCO INTER" — texto que nasce
   * de `LEFT JOIN ba_bancos`, e que não é atributo de `transacoes` em contrato
   * nenhum. Sem esta declaração, o seletor só sabia oferecer `77`.
   */
  filterFields: z.record(FilterKey, FilterField).optional(),
  /**
   * Semver do documento.
   *
   * Era enfeite — escrito em três lugares, lido em nenhum. Passou a ser o
   * número da revisão: toda alteração pelo chat incrementa o patch e arquiva o
   * documento anterior em `metrics/{id}/revisions`. Continua sem efeito no
   * runtime (bloco aponta para a métrica por id, nunca por versão — congelar
   * versão por bloco desfaria o compartilhamento, que é o ponto da métrica).
   */
  version: SemverString.default('1.0.0'),
  /**
   * Onde a métrica nasceu. Ausente ⇒ cadastrada fora do chat (admin/seed).
   *
   * Não é decoração: a garantia por trás de cada origem é diferente. `chat`
   * significa SQL escrito por modelo, validado por dry-run contra o binding do
   * cliente; `admin`, SQL que passou por gente. Sem o campo, daqui a alguns
   * meses as duas são indistinguíveis no catálogo.
   */
  origin: z.enum(['admin', 'chat']).optional(),
  /** Métrica de origem, quando esta nasceu como variação de outra. */
  derivedFrom: MetricId.optional(),
  status: MetricStatus.default('active'),
  /**
   * Dono da métrica. `null` ⇒ global/sistema (Liquid): compartilhada com todos
   * os clientes, CRUD só por admin. Slug do clientId ⇒ métrica daquele cliente:
   * CRUD pelo dono ou admin. Promoção a global = setar para `null` (id estável).
   */
  ownerClientId: Slug.nullable().default(null),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const Metric = MetricDoc.extend({
  id: MetricId,
});

export type MetricId = z.infer<typeof MetricId>;
export type AttributeRef = z.infer<typeof AttributeRef>;
export type MetricType = z.infer<typeof MetricType>;
export type MetricStatus = z.infer<typeof MetricStatus>;
export type MetricAggregation = z.infer<typeof MetricAggregation>;
export type TimeGrain = z.infer<typeof TimeGrain>;
export type FilterOp = z.infer<typeof FilterOp>;
export type MetricFilter = z.infer<typeof MetricFilter>;
export type MetricRecipe = z.infer<typeof MetricRecipe>;
export type MetricDoc = z.infer<typeof MetricDoc>;
export type Metric = z.infer<typeof Metric>;

# Filtros ambiente em recipes `derived` e `sql` (G9-C.2a) — Design

> **Status:** aprovado para plano. Segundo sub-projeto do track **G9-C**
> (migrar o dashboard para a camada semântica). Completa a infra de **filtros
> ambiente** iniciada na G9-C.1: aplica-os também a recipes `derived` (ratios) e
> `sql` (tabelas multi-measure), eliminando a regressão de filtros nesses
> formatos. Não toca em catálogo (métricas) nem em UI.

## Contexto

A **G9-C.1** entregou filtros ambiente (`AmbientFilter`: `in` / `numeric_buckets`)
aplicados pelo resolver — porém **só em recipes `aggregation`**
(`resolveAggregationRecipe`). Os recipes `derived` e `sql` ainda os **ignoram**.

Isso bloqueia o "tudo novo e corrigido, sem regressão" do dashboard:
- **Inadimplência** (KPI escalar **e** sparkline) é um **ratio** → recipe
  `derived` (`SUM(valor_atraso) / SUM(saldo_devedor)` via `terms` + `expression`).
  Sem ambient em `derived`, o KPI/série de inadimplência ignoraria os filtros
  avançados (ratings, faixaLtv, …).
- **Faixa table** (5 medidas por faixa) é recipe `sql` (`play.faixa_atraso_table`).
  Sem ambient em `sql`, a tabela ignoraria os filtros avançados.

Decisões desta rodada:
- **Sem regressão de filtros** ⇒ ambient precisa valer para `derived` e `sql`.
- **Decompor**: a infra (esta spec, **C.2a**) vem antes do catálogo (**C.2b**:
  sparklines, inadimplência derived, faixa_table estendida).
- Piloto do dashboard: cliente **Galli / `liquid-play`** (catálogo `play.*`).

Referências: G9-C.1 `docs/superpowers/specs/2026-06-24-filtros-avancados-camada-semantica-design.md`; ADR-0015.

## Escopo

Estender os filtros ambiente (reusando a infra da C.1) a:
1. recipes `derived` — aplicados automaticamente, ancorados no `primaryEntity`;
2. recipes `sql` — via placeholder explícito `{ambient:entity}` no template.

Mais um refactor DRY pequeno para compartilhar a montagem da cláusula.

**Não-objetivos:**
- Definir/alterar métricas (`play.*`) — é **C.2b**.
- Rewire de UI / hooks — é **C.2c** (ex-C.3).
- Capacidade de métrica multi-measure estruturada — desnecessária (`sql` cobre).

## Arquitetura

### Abordagem escolhida: estender a infra da C.1

`tryResolveColumn` e a montagem de cláusula (`in`/`numeric_buckets`) já existem
(C.1). Só muda **onde** são aplicadas. Rejeitadas: recipe multi-measure
estruturado novo (grande); declarar filtros por-métrica (não escala).

### 0. Refactor DRY

Extrair de `buildAmbientClause` a parte que monta a cláusula a partir de uma
**coluna já resolvida**:
```ts
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
  // numeric_buckets → (= OR BETWEEN OR >= OR <=)
  const parts: string[] = [];
  for (const b of f.buckets) {
    if ('eq' in b) { const n = nextParam(params, 'bk'); params[n] = b.eq; parts.push(`${col} = @${n}`); }
    else if (b.min !== undefined && b.max !== undefined) { const a = nextParam(params, 'bk'); const c = nextParam(params, 'bk'); params[a] = b.min; params[c] = b.max; parts.push(`${col} BETWEEN @${a} AND @${c}`); }
    else if (b.min !== undefined) { const n = nextParam(params, 'bk'); params[n] = b.min; parts.push(`${col} >= @${n}`); }
    else if (b.max !== undefined) { const n = nextParam(params, 'bk'); params[n] = b.max; parts.push(`${col} <= @${n}`); }
  }
  return parts.length ? `(${parts.join(' OR ')})` : null;
}
```
`buildAmbientClause` (aggregation, C.1) passa a delegar:
```ts
function buildAmbientClause(f, binding, primaryEntity, params): string | null {
  const [entity] = f.attribute.split('.');
  if (entity !== primaryEntity) return null;
  const col = tryResolveColumn(binding, f.attribute);
  if (col === null) return null;
  return ambientClauseFromColumn(col, f, params);
}
```

### 1. Ambient em `derived`

`ResolveDerivedOptions` ganha `ambientFilters?: AmbientFilter[]`.

Em `resolveDerivedMetric`, o escopo já mantém `inScope: Set<"contractId.entity">`
(FROM + JOINs) e um `bindingFor(contractId)`. Após montar `whereParts` dos
filtros declarados, para cada ambient filter:
```ts
for (const af of ambientFilters ?? []) {
  const [afEntity] = af.attribute.split('.');                   // "entity.attr" → "entity"
  // Acha o "contractId.entity" no escopo cuja entidade bate (primaryEntity primeiro).
  const ce = [recipe.primaryEntity, ...inScope].find(
    (s) => s.split('.')[1] === afEntity,
  );
  if (!ce) continue;                                            // entidade fora do escopo ⇒ pula
  const [contractId] = ce.split('.');
  const colOrNull = tryResolveColumn(bindingFor(contractId), `${afEntity}.${af.attribute.split('.')[1]}`);
  if (colOrNull === null) continue;                             // não bound ⇒ pula
  const clause = ambientClauseFromColumn(colOrNull, af, params);
  if (clause) whereParts.push(clause);
}
```
(`recipe.primaryEntity` e os elementos de `inScope` são `"contractId.entity"`.)

`executeMetric` (ramo `derived`) passa `ambientFilters` a `resolveDerivedMetric`
(hoje não passa).

### 2. Ambient em `sql` via `{ambient:entity}`

Placeholder explícito no template, opt-in. `resolveSqlRecipe` ganha o parâmetro
`ambientFilters` e, **antes** de substituir `{entity.attribute}`/`{entity}`,
substitui cada `{ambient:<entity>}`:
```ts
sql = sql.replace(/\{ambient:([a-z_][a-z0-9_]*)\}/g, (_m, entity: string) => {
  const clauses: string[] = [];
  for (const af of ambientFilters ?? []) {
    if (af.attribute.split('.')[0] !== entity) continue;
    const col = tryResolveColumn(binding, af.attribute);
    if (col === null) continue;
    const clause = ambientClauseFromColumn(col, af, params);
    if (clause) clauses.push(clause);
  }
  return clauses.length ? clauses.join(' AND ') : 'TRUE';        // no-op seguro
});
```
`resolveMetric` passa `ambientFilters` a `resolveSqlRecipe` (hoje ignora no ramo
`sql`). Uso no template (C.2b): `... WHERE {filter.snapshot} AND {ambient:contratos} ...`.

## Data flow

```
/api/metrics/batch { ambientFilters }  (C.1)
  └─ executeMetric
       ├─ ramo single-contract → resolveMetric → resolveAggregationRecipe (C.1)
       │                                        └ resolveSqlRecipe  ← {ambient:entity}  (C.2a)
       └─ ramo derived → resolveDerivedMetric(ambientFilters)  ← whereParts ambient  (C.2a)
```

## Error handling

| Situação | Comportamento |
| --- | --- |
| Ambient cuja entidade não está no escopo do `derived` | pula |
| `{ambient:entity}` no `sql` sem filtros aplicáveis | vira `TRUE` (no-op) |
| Coluna não bound / mapeada `null` | pula (fail-safe) |
| Valores | sempre em params nomeados (sem injeção) |

Mesma postura best-effort da C.1; nenhum novo caminho fail-loud.

## Testes (TDD)

**`resolveDerivedMetric` (ambient):** usando uma métrica derived ratio single-
contract (`primaryEntity` = `<contract>.contratos`, terms sum/sum) e
`bindingsByContract` com `contratos.*` bound:
- `op:in` bound ⇒ cláusula no WHERE, ANDed;
- entidade fora do escopo (ex.: `pagamentos.x`) ⇒ pulada;
- coluna não bound / `null` ⇒ pulada.

**`resolveSqlRecipe` (`{ambient:contratos}`):** template `... WHERE TRUE AND {ambient:contratos}`:
- com filtro `in` bound ⇒ substitui pela cláusula;
- sem filtros ⇒ vira `TRUE`;
- coluna não bound ⇒ pula aquele filtro;
- outros placeholders (`{contratos}`, `{contratos.x}`) seguem resolvidos.

**`buildAmbientClause` (aggregation):** caso de regressão — após o refactor,
os testes da C.1 (`resolve-metric.test.ts`) seguem verdes.

**`execute-metric`:** ramo `derived` repassa `ambientFilters` a
`resolveDerivedMetric` (spy/mocks).

## Consequência

Os três tipos de recipe (`aggregation`, `derived`, `sql`) passam a respeitar os
filtros avançados — destrava a C.2b (catálogo de ratios/tabela sem regressão) e
deixa a camada de filtros completa para todo o track G9-final.

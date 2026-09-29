# Filtros avançados na camada semântica (G9-C.1) — Design

> **Status:** aprovado para plano. Primeiro sub-projeto do track **G9-C**
> (migrar as páginas fixas do `/api/bigquery` legado para a camada semântica).
> Entrega a **infra de filtros avançados** (ratings, elegibilidade, faixaLtv,
> faixaAtraso, tipoProponente, gruposRepasse) no resolver semântico —
> reutilizável por **todas** as páginas do track. Não toca em UI nem migra
> nenhuma página ainda.

## Contexto

As páginas fixas aplicam filtros avançados via `/api/bigquery` →
`queries.ts:buildAdvancedWhere`, que monta WHERE em SQL a partir de
`AdvancedFilterParams` (`DataProvider`). O mapeamento legado (sobre a entidade
`contratos`):

| Filtro (UI) | Coluna canônica | Predicado |
| --- | --- | --- |
| `ratings` | `rating_liquid` | `IN (...)` |
| `elegibilidade` | `elegibilidade` | `IN (...)` (normaliza `Elegível`→`Elegivel`, `Não Elegível`→`Nao Elegivel`) |
| `faixaLtv` | `faixa_ltv` | `IN (...)` (coluna guarda o rótulo do bucket: `'30-50%'`) |
| `faixaAtraso` | `dias_atraso` | buckets numéricos OR'd (`Adimplente`→`=0`, `'1 a 30'`→`BETWEEN 1 AND 30`, …, `'> 180'`→`> 180`) |
| `tipoProponente` | `proponent_type` | `IN (...)` |
| `gruposRepasse` | `grupos_repasse` | `IN (...)` |

Característica-chave do legado: **fail-safe** — cada filtro é pulado quando a
coluna não está bound para o cliente (`if (col)`), sem erro.

O caminho semântico novo (`resolve-metric.ts`) já suporta `pageFilters` do tipo
`in`, **mas só quando o recipe declara o filtro** (`value: 'filter.X'`). Para os
filtros avançados valerem sem declarar cada um em cada recipe, falta um
mecanismo de **filtro ambiente**: aplicado automaticamente a uma métrica quando
o attribute pertence ao `primaryEntity` da métrica e está bound.

Decisões desta rodada:
- **Migrar o dashboard inteiro com paridade de filtros** (sem regressão) — daí a
  necessidade desta infra antes do rewire.
- **Decompor o G9-C** em 3 sub-projetos; esta spec é o **G9-C.1** (fundação).

Referências: ADR-0015 (camada semântica), auditoria G9, spec do endpoint bulk
`docs/superpowers/specs/2026-06-23-metricas-bulk-endpoint-design.md`.

## Escopo

Entregar a capacidade de **filtro ambiente** no resolver semântico e a
fiação até o endpoint:

1. Tipo + schema Zod `AmbientFilter`.
2. `resolve-metric.ts`: aplicar filtros ambiente em recipes **aggregation**,
   resolvendo a coluna de forma **não-fail-loud** (pula quando não-bound).
3. `execute-metric.ts` + rotas `/api/metrics/batch` e `/api/metrics/[id]/data`:
   aceitar e repassar `ambientFilters`.

**Não-objetivos** (outros sub-projetos / tracks):
- tradução `AdvancedFilterParams` (UI) → `AmbientFilter[]` e normalização de
  valores/rótulos — vive no hook consumidor (**G9-C.3**);
- métricas time-series e tabela faixa multi-measure (**G9-C.2**);
- suporte a filtro ambiente em recipes `sql` (template cru — não dá para
  injetar com segurança) e `derived` (cross-contract) — futuro;
- qualquer mudança de UI.

## Arquitetura

### Abordagem escolhida: filtro ambiente no resolver

`ambientFilters` é threaded `endpoint → executeMetric → resolveMetric`. O
resolver aplica cada filtro à cláusula WHERE da métrica **se** o attribute
pertence ao `primaryEntity` da métrica e está bound no binding do cliente. Se
não estiver bound (ausente, mapeado para `null`, ou de outra entidade) → **pula**
(best-effort, espelha o legado). Nenhuma mudança por-recipe; toda métrica
aggregation — atual e futura — ganha paridade de filtros automaticamente.

Rejeitadas:
- **Filtros declarados no recipe** (`filter.ratings` em cada métrica): exige
  declarar os 6 filtros em todas as métricas (incha o catálogo, não escala).
- **Envelopar o SQL da métrica num CTE de filtragem**: invasivo e frágil contra
  recipes heterogêneos.

### 1. Tipo `AmbientFilter`

Novo módulo `src/shared/lib/metrics/ambient-filter.ts`:
```ts
import { z } from 'zod';

/** Bucket numérico: igualdade exata OU intervalo (min/max inclusivos, abertos se ausentes). */
export const NumericBucket = z.union([
  z.object({ eq: z.number() }),
  z.object({ min: z.number().optional(), max: z.number().optional() }),
]);

/**
 * Filtro "ambiente": aplicado a uma métrica quando seu `attribute`
 * (`entity.attr`) pertence ao primaryEntity da métrica e está bound.
 * `in`: coluna IN (valores). `numeric_buckets`: OR de buckets sobre a coluna.
 */
export const AmbientFilter = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('in'),
    attribute: z.string(),                       // "entity.attr"
    values: z.array(z.union([z.string(), z.number()])),
  }),
  z.object({
    op: z.literal('numeric_buckets'),
    attribute: z.string(),
    buckets: z.array(NumericBucket),
  }),
]);

export type NumericBucket = z.infer<typeof NumericBucket>;
export type AmbientFilter = z.infer<typeof AmbientFilter>;
```
Os 5 filtros `IN` viram `op:'in'`; `faixaAtraso` vira `op:'numeric_buckets'`
sobre `contratos.dias_atraso`. `values`/`buckets` vazios ⇒ no-op (não emite
cláusula). A construção desses objetos a partir da UI é da **G9-C.3**.

### 2. Aplicação no resolver (`resolve-metric.ts`)

Helper novo, **não-fail-loud** (irmão do `resolveColumn` que lança):
```ts
/** Como resolveColumn, mas retorna null em vez de lançar quando indisponível. */
function tryResolveColumn(binding: ClientDatasetBinding, ref: string): string | null {
  const bound = binding.schemaBindings?.[ref];
  if (bound === null) return null;                       // explicitamente indisponível
  if (typeof bound === 'string') return quoteIdentifier(bound, 'column');
  const migrated = !!binding.schemaBindings && Object.keys(binding.schemaBindings).length > 0;
  if (migrated) return null;                              // migrado sem mapping ⇒ pula
  const attr = ref.split('.')[1];
  return attr ? quoteIdentifier(attr, 'column') : null;  // legado: nome canônico
}
```

Builder de cláusula ambiente:
```ts
function buildAmbientClause(
  f: AmbientFilter,
  binding: ClientDatasetBinding,
  primaryEntity: string,
  params: Record<string, unknown>,
): string | null {
  const [entity] = f.attribute.split('.');
  if (entity !== primaryEntity) return null;             // não é desta tabela ⇒ pula
  const col = tryResolveColumn(binding, f.attribute);
  if (col === null) return null;                         // não bound ⇒ pula (fail-safe)

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
      const n = nextParam(params, 'bk'); params[n] = b.eq; parts.push(`${col} = @${n}`);
    } else if (b.min !== undefined && b.max !== undefined) {
      const a = nextParam(params, 'bk'); const c = nextParam(params, 'bk');
      params[a] = b.min; params[c] = b.max; parts.push(`${col} BETWEEN @${a} AND @${c}`);
    } else if (b.min !== undefined) {
      const n = nextParam(params, 'bk'); params[n] = b.min; parts.push(`${col} >= @${n}`);
    } else if (b.max !== undefined) {
      const n = nextParam(params, 'bk'); params[n] = b.max; parts.push(`${col} <= @${n}`);
    }
  }
  return parts.length ? `(${parts.join(' OR ')})` : null;
}
```

Em `resolveAggregationRecipe`, após montar `whereParts` dos filtros declarados,
acrescenta os ambiente:
```ts
for (const af of ambientFilters ?? []) {
  const clause = buildAmbientClause(af, binding, recipe.primaryEntity, params);
  if (clause) whereParts.push(clause);                   // ANDed com os demais
}
```
`ambientFilters` entra em `ResolveMetricOptions`. Recipes `sql` e `derived`
**ignoram** `ambientFilters` nesta fase (documentado).

### 3. Fiação endpoint → resolver

- `execute-metric.ts`: `executeMetric` ganha `ambientFilters?: AmbientFilter[]`
  e repassa a `resolveMetric({ ..., ambientFilters })`.
- `/api/metrics/batch` e `/api/metrics/[id]/data`: `RequestSchema` ganha
  `ambientFilters: z.array(AmbientFilter).optional()`, repassado a
  `executeMetric`. Aplica-se a todas as métricas do batch (nível de página,
  como `pageFilters`).

## Data flow

```
hook (G9-C.3) traduz AdvancedFilterParams → AmbientFilter[]
  └─ POST /api/metrics/batch { ..., ambientFilters }
       └─ executeMetric({ ..., ambientFilters })
            └─ resolveMetric({ ..., ambientFilters })
                 └─ resolveAggregationRecipe: WHERE recipe-filters AND ambient-clauses
                    (pula filtro cujo attribute não é do primaryEntity ou não está bound)
```

## Error handling

| Situação | Comportamento |
| --- | --- |
| attribute de outra entidade que não `primaryEntity` | pula o filtro (no-op) |
| attribute não bound / mapeado `null` / migrado sem mapping | pula o filtro (fail-safe; **não** lança) |
| `values`/`buckets` vazios | no-op |
| recipe `sql`/`derived` | `ambientFilters` ignorado nesta fase |
| valores | sempre via params nomeados (sem injeção) |

Diferença deliberada vs filtros **declarados** no recipe (que seguem
fail-loud via `resolveColumn`): filtros ambiente são best-effort, igual ao
legado — um filtro indisponível não quebra a métrica, só não filtra.

## Testes (TDD)

**`ambient-filter` (schema)**: parse válido de `in` e `numeric_buckets`; rejeita
`op` desconhecido.

**`resolve-metric` (resolver)** — usando uma métrica aggregation com
`primaryEntity: 'contratos'` e binding bound:
- `op:'in'` com attribute bound ⇒ SQL contém `IN UNNEST(@…)` e o WHERE ANDa com
  os filtros declarados;
- `op:'numeric_buckets'` (ex.: `[{eq:0},{min:1,max:30},{min:181}]`) ⇒
  `(col = @… OR col BETWEEN @… AND @… OR col >= @…)`;
- attribute **não bound** (schemaBindings sem a key, cliente migrado) ⇒ filtro
  **pulado** (SQL não muda), métrica resolve normalmente;
- attribute mapeado para `null` ⇒ pulado;
- attribute de **outra entidade** (`pagamentos.x` numa métrica de `contratos`)
  ⇒ pulado;
- `values`/`buckets` vazios ⇒ pulado;
- recipe `sql` ⇒ `ambientFilters` ignorado (SQL inalterado).

**`execute-metric`**: `ambientFilters` é repassado a `resolveMetric` (spy/mocks).

**`/api/metrics/batch` (rota)**: body com `ambientFilters` chega a `executeMetric`
(mock) com o mesmo array; body sem `ambientFilters` ⇒ `undefined` (sem quebra).

## Consequência

- Toda métrica **aggregation** passa a respeitar filtros avançados sem mudança
  de catálogo — a G9-C.3 (rewire do dashboard) e as próximas páginas herdam
  paridade de filtros de graça.
- Mantém o contrato fail-loud para o que importa (cobertura/atributo de
  **dados** declarado no recipe) e fail-safe para filtros de página opcionais.

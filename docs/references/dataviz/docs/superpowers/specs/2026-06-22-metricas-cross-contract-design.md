# Spec — Métricas cross-contract (R2): relações no Data Contract + recipe `derived`

- **Data:** 2026-06-22
- **Status:** Proposed (aguardando review do owner)
- **Relacionado:** ADR-0015 (camada semântica), auditoria `docs/auditoria-arquitetura-camada-semantica.md` (gaps G3, G8, G10)
- **Regra de produto atendida:** R2 — "uma métrica pode cruzar dados de um ou mais contratos de dados" (ex.: preço/m² = valor ÷ área; ticket médio por segmento de cliente).

---

## 1. Contexto e problema

Hoje uma métrica **não** cruza entidades nem contratos:

- O recipe `aggregation` tem `primaryEntity` única, sem JOIN (`resolve-metric.ts`).
- O recipe `sql` aceita refs 2-part (`entity.attribute`, contrato implícito) — não nomeia um segundo contrato.
- A rota `/api/metrics/[id]/data` carrega **1** dataset por `requires[0]` (`route.ts:116`).
- Entities não declaram **chaves de junção** (G10) — não há como saber como ligar duas tabelas.
- Não há validação de **cobertura** `requires[]` × `schemaBindings` (G8) — falha tarde, atributo a atributo.

O owner precisa, p.ex., de um contrato `clientes` e um `produtos` e métricas que **juntam os dois**.

## 2. Objetivos / Não-objetivos

**Objetivos**
- Métricas que referenciam atributos de **≥1 contratos** e os cruzam via JOIN, de forma **estruturada** (sem SQL cru), resolvendo a um **único SQL** no BigQuery.
- Modelo canônico de **relações** (chaves de JOIN) entre entidades, inclusive cross-contract — reutilizável por qualquer métrica.
- **Fail-loud** explícito quando o cliente não cobre um contrato/atributo exigido (resolve G8).
- Formato **preenchível pela IA** (habilita "montar indicador no chat") e por um builder no admin.

**Não-objetivos (desta spec)**
- JOIN entre **projetos BigQuery diferentes** (datasets em projetos distintos) — fora de escopo; validado e rejeitado com erro claro.
- Integração com o **chat** (geração via IA) — trilha separada (gaps G4/G5); esta spec só garante que o recipe é estruturado e gerável.
- Migrar métricas single-contract existentes (`aggregation`/`sql` seguem funcionando inalteradas — mudança aditiva).
- Auto-descoberta de caminho de JOIN por grafo (a métrica referencia relações **explicitamente** por id — evita ambiguidade de caminho).

## 3. Modelo de dados

### 3.1 Relações (`relations/{relationId}`) — NOVO, top-level

Top-level porque uma relação pode cruzar **dois contratos** (não pertence a um só).

```ts
// src/shared/schemas/relation.ts
Relation = {
  id: Slug,
  label: string,                 // "Contrato → Cliente"
  leftRef:  AttributeRef,        // "contractId.entityId.attributeId" (FK)
  rightRef: AttributeRef,        // "contractId.entityId.attributeId" (PK alvo)
  cardinality: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many',
  description?: string | null,
  createdAt, updatedAt,
}
```

- `leftRef`/`rightRef` usam `AttributeRef` 3-part já existente em `metric.ts`.
- O JOIN é `left.entity JOIN right.entity ON left.col = right.col` (colunas reais resolvidas por cliente).
- Coleção plana; CRUD admin via `/api/relations`.

### 3.2 Recipe `derived` — NOVO kind em `MetricRecipe`

`MetricRecipe` (discriminated union em `metric.ts`) ganha um terceiro membro, **estruturado**:

```ts
DerivedRecipe = {
  kind: 'derived',
  primaryEntity: ContractEntityRef,             // "contractId.entityId" — o FROM
  joins: Array<{ relationId: Slug }>,           // relações a juntar, em ordem
  terms: Array<{
    id: string,                                 // identificador local do termo (ex.: "valor", "area")
    aggregation: MetricAggregation,             // sum | count | avg | ...
    valueRef?: AttributeRef,                    // "contractId.entity.attr"; omitir para count(*)
  }>,
  expression: string,                           // aritmética sobre ids de termos: "valor / area"
  timeRef?: AttributeRef, timeGrain?: TimeGrain,
  groupByRefs?: AttributeRef[],                 // 3-part; viram colunas + GROUP BY
  filters?: MetricFilter3[],                    // como MetricFilter, mas attribute 3-part
  orderBy?: { ref: AttributeRef, dir: 'asc'|'desc' },
  limit?: number,
}
```

- `requires[]` da métrica passa a poder listar refs de **vários contratos** (já é `AttributeRef[]`, sem mudança de schema — só de uso).
- `expression`: gramática **restrita** (apenas ids de termos, números, `+ - * / ( )`). Validada por parser próprio — **nunca** referencia coluna/SQL cru (anti-injeção). Cada termo vira `agg(coluna_real)`.
- `aggregation`/`sql` permanecem; `derived` é aditivo.

**Exemplos**
- Preço/m² (1 contrato, 2 entidades ou 1): `primaryEntity: "produtos.unidades"`, `terms: [{id:'valor',sum,produtos.unidades.valor},{id:'area',sum,produtos.unidades.area}]`, `expression: "valor / area"`.
- Ticket por segmento (2 contratos): `primaryEntity:"contratos.contratos"`, `joins:[{relationId:'contrato-cliente'}]`, `groupByRefs:["clientes.proponentes.segmento"]`, `terms:[{id:'tot',sum,contratos.contratos.valor},{id:'n',count}]`, `expression:"tot / n"`.

## 4. Resolução (resolve-metric + rota)

### 4.1 Rota `/api/metrics/[id]/data`
1. Carrega a métrica. Se `recipe.kind === 'derived'`:
2. **Coleta todos os `contractId`** referenciados (primaryEntity + relações dos joins + valueRefs + groupBy + filters).
3. Para cada contractId: acha o `ClientDatasetBinding` do cliente cujo `contractRef === contractId`. **Faltou algum → 422** `Cliente não cobre o contrato "X" exigido pela métrica` (G8).
4. Valida que todos os bindings apontam para o **mesmo projeto BigQuery** (cross-dataset, mesmo projeto). Senão → 422 `Métrica cross-contract exige datasets no mesmo projeto`.
5. Chama `resolveDerivedMetric(metric, bindingsByContract, relations, pageFilters)`.

`aggregation`/`sql` (single-contract) seguem pelo caminho atual (1 binding por `requires[0]`).

### 4.2 `resolveDerivedMetric` (novo em `resolve-metric.ts`)
- `FROM` = tabela da `primaryEntity` (via binding do seu contrato → `projeto.dataset.tabela`).
- Para cada `join.relationId`: carrega a relação; resolve as colunas reais de `leftRef`/`rightRef` (via binding do contrato de cada lado); adiciona `JOIN <tabela do lado novo> ON <colLeft> = <colRight>`. Erro se a relação liga entidades fora do conjunto já no FROM/joins (fail-loud).
- `terms`: cada um vira `agg(coluna_real)`; `expression` é parseada e os ids substituídos pelas aggs → `SELECT (<expr>) AS value`.
- `groupByRefs` → colunas (alias = attributeId) + `GROUP BY`. `timeRef` → `DATE_TRUNC(col, grain) AS bucket`.
- `filters`/page filters → `WHERE` (mesmos helpers de `buildFilterClause`, refs 3-part).
- Identificadores **sempre** sanitizados (`safe*`); valores **sempre** em params nomeados (como hoje).
- Reusa `resolveColumn` (fail-loud por atributo não mapeado).

## 5. Admin UI

- **Relations editor** (nova seção na aba Data Contracts): lista/CRUD de relações; pickers de `leftRef`/`rightRef` (contrato → entity → attribute) + cardinalidade.
- **MetricForm** (recipe `derived`): seletor de `primaryEntity`; adicionar joins (escolher relações disponíveis); adicionar termos (agg + picker de attribute 3-part); campo `expression` (validação client com a mesma gramática restrita); groupBy/time/filtros.
- Reusa `useEntityContractCatalog`/pickers existentes.

## 6. Tratamento de erros (fail-loud)

| Situação | Resultado |
|---|---|
| Contrato exigido sem binding no cliente | 422 com nome do contrato (G8) |
| Relação referenciada inexistente | 422 `Relação "X" não encontrada` |
| JOIN liga entidade fora do conjunto atual | 422 `Relação "X" não conecta as entidades da métrica` |
| Atributo sem mapping no `schemaBindings` | 422 (via `resolveColumn`, já existe) |
| `expression` inválida (token fora da gramática) | erro de validação na criação da métrica |
| Datasets em projetos BigQuery diferentes | 422 cross-project não suportado |

## 7. Estratégia de testes (TDD)

Unidades puras (sem rede), com teste-primeiro:
- **Parser/validador de `expression`** — aceita aritmética sobre ids; rejeita coluna/SQL cru, tokens desconhecidos, parênteses desbalanceados.
- **`resolveDerivedMetric`** — gera SQL correto para: (a) cross-entity num contrato (preço/m²); (b) cross-contract com 2 bindings (tabelas qualificadas em datasets diferentes); (c) groupBy + time; (d) fail-loud: contrato sem binding, relação ausente, relação que não conecta, cross-project.
- **Schema `Relation`** — validação de refs 3-part e cardinalidade.
- **Rota** — coleta de contratos + seleção de múltiplos bindings (mock Firestore/BQ no padrão de `route.test.ts`).

## 8. Faseamento (vira o plano de implementação)

1. **Relações**: schema `Relation` + `/api/relations` CRUD + testes.
2. **Recipe `derived`**: schema + parser de `expression` + `resolveDerivedMetric` + ajuste da rota (multi-binding) + testes. *(núcleo do R2)*
3. **Admin UI**: Relations editor + builder `derived` no MetricForm.
4. *(Separado — trilha de chat semântico, G4/G5)*: tool de IA que gera métricas `derived`.

## 9. Decisões em aberto (para o review)

- **`relations` top-level vs subcoleção do contrato:** proposto top-level (cross-contract). OK?
- **`expression` estruturada vs só `ratio` (num/den):** proposto expression aritmética restrita (mais geral, ainda segura). Aceitável ou prefere começar só com `ratio`?
- **Cardinalidade:** usada só como metadado/validação por ora (não muda o SQL). OK?

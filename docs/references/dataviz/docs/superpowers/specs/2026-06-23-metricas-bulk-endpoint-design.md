# Endpoint semântico bulk de métricas (G9-B) — Design

> **Status:** aprovado para plano. Cria `POST /api/metrics/batch` — resolve N
> métricas de uma página numa única chamada — e liga o `useReportData` nele
> (N→1). É a peça que destrava a migração das páginas fixas para fora do
> `/api/bigquery` legado (track **G9-final**).

## Contexto

Hoje a execução de métrica da camada semântica (ADR-0015) é **1-a-1**:
`POST /api/metrics/[id]/data` resolve **uma** `Metric.recipe` contra o binding do
cliente → DataSource → BigQuery. O consumidor atual, `useReportData`
(`src/shared/hooks/useReportData.ts`), já agrega os `metricId` dos blocks de um
report e dispara **N chamadas HTTP em paralelo** (`Promise.all` sobre
`allMetricIds`, deduplicando via `Set`). Cada chamada repete todo o trabalho
compartilhável: lê o doc do cliente, lê `relations`, busca DataSource, checa
acesso ao dataset e roda a query — **N vezes**.

O gap **G9-B** da auditoria: falta um endpoint que resolva **N métricas numa
chamada**, fazendo o trabalho compartilhável **uma vez**. Sem ele:
- as reports de canvas pagam N round-trips + N leituras Firestore redundantes;
- as páginas fixas não têm um caminho semântico em lote para onde migrar — o
  track de aposentar o `/api/bigquery` (G9-final) fica bloqueado.

Decisões desta rodada (perguntas respondidas):
- **Falha parcial → resultados por métrica @ HTTP 200.** Quando autenticado, o
  endpoint sempre responde 200; o corpo traz um `results[metricId]` que é
  sucesso **ou** erro por métrica. A página renderiza o que conseguiu e marca
  por-widget o que falhou. Espelha o comportamento atual do `useReportData`
  (que já engole erro por-métrica). Só **falta de token** é 401 no topo.
- **Escopo: endpoint + ligar o `useReportData`.** Prova o endpoint ponta-a-ponta
  com um consumidor já-semântico, entrega ganho imediato (N→1) e trava o
  contrato antes das páginas fixas (G9-C) consumirem.

Referência: auditoria `docs/auditoria-arquitetura-camada-semantica.md` (G9).

## Escopo

1. Extrair o núcleo de execução por-métrica para um módulo `server-only`
   reutilizável (`executeMetric`).
2. Criar `POST /api/metrics/batch` (bulk) que carrega os recursos
   compartilhados **uma vez** e fan-out `executeMetric` sobre a lista de
   métricas, com queries BQ em paralelo.
3. Refatorar `POST /api/metrics/[id]/data` para delegar ao mesmo núcleo
   (vira wrapper fino; contrato e testes preservados).
4. Trocar o `useReportData` para fazer **1** chamada bulk em vez de N.

**Não-objetivos** (track G9-final, cada um spec/plano próprio):
- migrar as páginas fixas (contratos, PDD, etc.) para o bulk (G9-C…N);
- remover `/api/bigquery`, `queries.ts`, `schema-resolver.ts`,
  `ClientSchema`/`client.schema`.

## Arquitetura

### Abordagem escolhida: núcleo por-métrica compartilhado

O `/api/metrics/[id]/data` atual inlina ~250 linhas de orquestração por
métrica. Em vez de duplicá-las no endpoint bulk, extrai-se o núcleo para
`src/shared/lib/metrics/execute-metric.ts` (`server-only`). Ambas as rotas
delegam a ele. O bulk carrega os recursos compartilhados uma vez e itera.

Rejeitadas:
- **Duplicar a orquestração no bulk** (deixa o 1-a-1 intacto): ~250 linhas
  duplicadas, dois caminhos que divergem. Viola DRY.
- **Coalescer N métricas em menos jobs BQ (UNION/multi-statement)**: shapes
  heterogêneos (série temporal vs escalar vs agrupado) tornam a coalescência
  frágil, e um job combinado perde o isolamento de erro por-métrica —
  contradiz a decisão de "resultados por métrica".

### Componentes

#### 1. Núcleo `execute-metric.ts` (`server-only`)

```ts
export type MetricExecResult =
  | { ok: true; metricId: string; data: unknown[]; sql: string; outputColumns: string[] }
  | { ok: false; metricId: string; status: number; error: string; missing?: CoverageGap[] };

/** Recursos compartilhados entre métricas de um mesmo request (dedupe de I/O). */
export interface MetricExecCaches {
  dataSources: Map<string, DataSource | null>; // por dataSourceId
  accessChecked: Map<string, { allowed: boolean; status?: number; error?: string }>; // por datasetId
}

export function newMetricExecCaches(): MetricExecCaches;

/** Carrega e parseia os productBindings do cliente (uma vez por request). */
export async function loadClientBindings(clientId: string): Promise<{
  ok: true; bindings: ClientProductBinding[];
} | { ok: false; status: number; error: string }>;

/**
 * Resolve + executa UMA métrica contra os bindings do cliente, com recursos
 * pré-carregados. Nunca lança por erro de negócio: mapeia para ok:false.
 * Erros inesperados (BQ/Firestore) viram { ok:false, status:500 } com mensagem
 * segura (sem vazar SQL/topologia).
 */
export async function executeMetric(args: {
  metric: Metric;
  parsedBindings: ClientProductBinding[];
  clientId: string;
  productId?: string;
  email: string;
  relations: Relation[];          // [] quando nenhuma métrica é derived
  pageFilters?: Record<string, PageFilterValue>;
  caches: MetricExecCaches;
}): Promise<MetricExecResult>;
```

`executeMetric` contém a lógica hoje inline no 1-a-1:
- **Escopo da métrica** (`ownerClientId`): global (`null`) visível a todos;
  métrica de outro cliente → `{ ok:false, status:403 }`.
- **Recipe sem `recipe`** → `{ ok:false, status:422 }`.
- **Seleção de binding/dataset** pelo `contractId` de `metric.requires[0]`
  (templates mistos resolvem cada métrica contra o dataset correto);
  fail-loud quando nenhum dataset cobre o contrato → `422`.
- **Caminho `derived`** (cross-contract): coleta `contractId`s, resolve um
  `ClientDatasetBinding` por contrato, exige mesmo projeto BQ, JOIN via
  `relations`, `resolveDerivedMetric`.
- **Multi-tenant** (ADR-0006): `verifyDatasetAccess` por `datasetId`,
  **deduplicado** via `caches.accessChecked`; negação → `{ ok:false, 403 }`.
- **Coexistência ADR-0015**: deriva `schemaBindings` do `schema` legado via
  `flattenLegacyBinding` quando o flat está vazio.
- **G8 — pré-checagem de cobertura** (`collectBindingGaps`) para recipes
  `aggregation`/`derived`; lacunas → `{ ok:false, 422, missing }`.
- **DataSource** via `getDataSource`, **deduplicado** via `caches.dataSources`.
- **Resolução**: `resolveMetric` / `resolveDerivedMetric`;
  `MetricResolutionError` → `{ ok:false, 422 }`.
- **Execução BQ**: `getBigQueryClientFor(...).query(...)` → linhas.

#### 2. Rota bulk `app/api/metrics/batch/route.ts`

```
POST /api/metrics/batch
body: { clientId: string; productId?: string; metricIds: string[]; pageFilters?: ... }
→ 200 { results: Record<metricId, MetricExecResult> }
```

Fluxo:
1. `verifyAuthToken` — sem token → **401** (único erro de topo).
2. Valida o body (Zod). `metricIds` vazio → **400**; acima do cap (**50**)
   → **400** (guarda contra request patológico que dispararia centenas de jobs).
3. **Dedup** dos `metricIds` (`Set`).
4. `loadClientBindings(clientId)` **uma vez**; `ok:false` (cliente ausente /
   sem `productBindings`) → propaga como erro de topo no status retornado
   (ex.: 404/422), pois afeta o batch inteiro.
5. `getAll()` dos docs `metrics/{id}` numa **única** leitura batch Firestore;
   id inexistente → aquele `results[id] = { ok:false, status:404 }`.
6. Carrega `relations` **uma vez** sse alguma métrica é `derived` (lazy); senão `[]`.
7. `newMetricExecCaches()`; `Promise.all` sobre as métricas únicas chamando
   `executeMetric` (os caches deduplicam DataSource e access-check; as queries
   BQ rodam em paralelo — mesma concorrência que o `useReportData` faz hoje).
8. Monta `results` keyed por `metricId`. Responde **200**.

#### 3. Refator do 1-a-1 `app/api/metrics/[id]/data/route.ts`

Vira wrapper fino: auth → `loadClientBindings` → `getAll`/`get` da métrica →
`relations` (se derived) → `executeMetric` → mapeia o `MetricExecResult` de
volta para as respostas single-status atuais (`ok:true` → 200 com
`{ data, sql, outputColumns }`; `ok:false` → `NextResponse.json({ error, missing? }, { status })`).
Contrato externo e testes existentes preservados.

#### 4. `useReportData` consome o bulk

Substitui o `Promise.all` de N `fetchMetricData` por **1** `POST
/api/metrics/batch` com o `Set` de metricIds (já calculado). Mapeia
`results[metricId]`:
- `ok:true` → usa `data` (preenche o block).
- `ok:false` / ausente → `[]` (rows vazias) + `console.error` com o
  `error` — **preserva** o comportamento atual (falha por-métrica não derruba a
  página). Sem erro de página inteira por uma métrica.

Race-guard (`fetchedRef`/`isCurrent`), `cacheKey`, composição de `pageFilters`,
sparkline e `applyMetricRowsToBlock` permanecem inalterados.

## Data flow (bulk, resumo)

```
client (useReportData)
  └─ POST /api/metrics/batch { clientId, productId?, metricIds[], pageFilters }
       ├─ verifyAuthToken            (401 se faltar token)
       ├─ loadClientBindings         (1× Firestore: clients/{clientId})
       ├─ metrics getAll             (1× Firestore batch: metrics/{...})
       ├─ relations get              (1× Firestore, lazy: só se houver derived)
       └─ Promise.all(metricIds → executeMetric)   (BQ em paralelo; caches dedupe)
            → results[metricId] = ok:true{data,sql,outputColumns} | ok:false{status,error,missing?}
  ← 200 { results }
```

## Error handling

| Situação | Resultado |
| --- | --- |
| Sem token | **401** topo (request inteiro) |
| `metricIds` vazio / acima do cap (50) | **400** topo |
| Cliente inexistente / sem `productBindings` | erro de topo (status do `loadClientBindings`: 404/422) — afeta todo o batch |
| metricId inexistente | `results[id] = { ok:false, 404 }` |
| Métrica de outro cliente (`ownerClientId`) | `results[id] = { ok:false, 403 }` |
| Nenhum dataset cobre o contrato / lacuna de cobertura (G8) | `results[id] = { ok:false, 422, missing? }` |
| Atributo indisponível / `MetricResolutionError` | `results[id] = { ok:false, 422 }` |
| Sem acesso ao dataset (tenant) | `results[id] = { ok:false, 403 }` |
| Erro BQ/Firestore inesperado | `results[id] = { ok:false, 500 }` com mensagem genérica segura (sem vazar SQL/topologia) |

Mensagens de erro por-métrica não vazam SQL gerado nem topologia
(project/dataset/tabela/coluna) — mesma postura do `/api/bigquery` (G9).

## Testes (TDD)

**Núcleo `execute-metric.test.ts`** (mock de Firestore/DataSource/BQ):
- sucesso (`aggregation`) → `ok:true` com `data`/`sql`/`outputColumns`;
- métrica de outro cliente → `ok:false, 403`;
- nenhum dataset cobre o contrato → `ok:false, 422`;
- lacuna de cobertura G8 → `ok:false, 422` com `missing`;
- atributo indisponível (`MetricResolutionError`) → `ok:false, 422`;
- tenant negado → `ok:false, 403`;
- caches deduplicam: 2 métricas mesmo `dataSourceId`/`datasetId` →
  `getDataSource`/`verifyDatasetAccess` chamados **1×**.

**Rota bulk `app/api/metrics/batch/__tests__/route.test.ts`**:
- mix ok + fail numa chamada → **200** com `results` misto;
- dedup de metricIds repetidos → 1 entrada por id;
- sem token → **401**; `metricIds` vazio → **400**; acima do cap → **400**;
- cliente sem `productBindings` → erro de topo (não-200).

**1-a-1 `app/api/metrics/[id]/data/route.test.ts`**: permanece verde após o
refator (prova que o wrapper preserva o contrato).

**`useReportData.test.ts`**: passa a mockar `/api/metrics/batch`; assere
**1** fetch (N→1) e que `ok:false`/ausente vira rows vazias sem erro de página.

## Consequência

- Reports de canvas: N round-trips + N leituras Firestore → **1** chamada +
  leituras compartilhadas. Mesma concorrência de jobs BQ que hoje.
- Páginas fixas (G9-C…N) ganham um alvo de migração em lote já provado.
- O 1-a-1 continua existindo (consumidores externos / chamada avulsa), agora
  sobre o mesmo núcleo.

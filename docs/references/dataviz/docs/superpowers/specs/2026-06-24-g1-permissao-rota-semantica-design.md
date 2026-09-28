# G1 — Permissão de rota no path semântico (server-side) — Design

> **Status:** aprovado para plano. Fecha a recomendação **#1 da auditoria**
> (`docs/auditoria-arquitetura-camada-semantica.md`): aplicar permissão de
> rota no servidor para o path semântico (`/api/metrics/[id]/data` e
> `/api/metrics/batch`), eliminando o bypass de permissão fina. Espelha o
> padrão **já aceito** na rota legada (`/api/bigquery` →
> `routeForBigQueryAction` → `verifyRouteAccess`).

## Contexto

O modelo de permissão (ADR-0006): `users/{id}` → `groups[]` (cada grupo declara
`routes[]` e `indicators[]`; `indicators == null` = tudo liberado) +
`clientAccess[]` com `routeOverrides`/`indicatorOverrides` por cliente. A lógica
pura vive em `authorize.ts` (`canAccessRoute`/`canAccessIndicator`). A unidade
de permissão de página é a **rota** (`/dashboard`, `/pdd`, …) — a mesma lista de
`routes` configurada no produto e usada pela sidebar/`IndicatorGuard`.

**A lacuna (G1).** O path semântico (`executeMetric`, compartilhado por
`/api/metrics/[id]/data` e `/api/metrics/batch`) faz apenas:
1. **ownership-scope** (`metric.ownerClientId` null/igual ao cliente);
2. **tenant-check** (`verifyDatasetAccess` — o `clientAccess` do usuário cobre o
   cliente e o dataset pertence a ele).

Não aplica `canAccessRoute`. Logo, um usuário não-admin com acesso ao **tenant**
mas **sem** permissão de uma página (ex.: `/pdd`) pode buscar os dados daquela
página chamando a API direto (fora da UI) — a permissão fina é só cosmética
(roda só no React via `IndicatorGuard`). Evidência: `metrics/[id]/data/route.ts`,
`execute-metric.ts`, auditoria G1.

A rota **legada** `/api/bigquery` **já fecha** isso: mapeia a *action* da página
→ rota (`bigquery-action-routes.ts`) e chama `verifyRouteAccess`; actions
agregadas/compartilhadas (`contratos_aggregated`, `kpi_history`,
`dashboard_faixa_atraso`, `filter_options`, …) mapeiam para `null` e ficam só
com o tenant-check. Este design leva **o mesmo padrão** ao path semântico.

## Decisão

Nível-**rota**, paridade exata com o legado:

1. **Mapa estático `routeForMetric(metricId): string | null`** em
   `src/shared/lib/permissions/metric-route-map.ts` (irmão de
   `bigquery-action-routes.ts`). Métricas de **página única** mapeiam para a sua
   rota; métricas **compartilhadas/genéricas** (carteira básica usada em mais de
   uma página) → `null` → só tenant-check.
2. **Enforcement dentro do `executeMetric`** (não nas rotas): assim
   `/[id]/data` e `/batch` ganham a checagem de uma vez, server-authoritative,
   sem confiar em nada vindo do cliente.

**Não-objetivos** (follow-ups):
- Enforcement **nível-indicador** no servidor (`canAccessIndicator`) — nunca
  existiu server-side em lugar nenhum (nem no legado); fica para depois.
- Mapeamento **derivado do schema de Produto** (per-route `metricRefs`) — exigiria
  schema change + re-seed + resolver o mismatch `play.*` vs `dashboard.*` dos
  `metricRefs`; o mapa estático já dá paridade com escopo mínimo.
- Mapear `covenants.*` — mesmo padrão, enumerado quando as páginas de covenants
  migrarem ao path semântico (hoje servidas pelo legado ou ainda não migradas).

## Arquitetura

### `metric-route-map.ts` (novo)

```ts
const METRIC_ROUTE: Record<string, string> = {
  // página única → rota (espelha o agrupamento do seed-galli-metrics.mjs)
  'play.lista_contratos': '/contratos',
  'play.valor_pago_periodo': '/pagamentos',
  'play.pagamentos_por_tipo': '/pagamentos',
  'play.fluxo_contratado': '/fluxo-de-caixa',
  'play.fluxo_esperado': '/fluxo-de-caixa',
  'play.pdd_bacen': '/pdd',
  'play.pdd_liquid': '/pdd',
  'play.delta_pdd': '/pdd',
  'play.pricing_medio': '/pricing',
  'play.desagio_medio': '/pricing',
  'play.ltv_distribuicao': '/simulacao',
  'play.elegibilidade_distribuicao': '/elegibilidade',
  'play.grupos_repasse_distribuicao': '/repasse',
  'play.detalhamento_completo': '/detalhamento',
};
export function routeForMetric(metricId: string): string | null {
  return METRIC_ROUTE[metricId] ?? null;
}
```

As métricas do **dashboard** (`play.total_contratos`, `saldo_*`, `valor_atraso`,
`over_90`, `faixa_atraso_chart`, `faixa_atraso_table`, `serie_*`,
`evolucao_saldo`, `inadimplencia`, `inadimplencia_serie`) são a **carteira
básica compartilhada** entre `/dashboard` e `/elegibilidade` → ficam **sem rota**
(`null` → só tenant-check), exatamente como o legado tratou `contratos_aggregated`/
`kpi_history`/`dashboard_faixa_atraso`. As páginas especializadas (PDD, Pricing,
Repasse, …) é que recebem enforcement de rota.

### Enforcement em `execute-metric.ts`

Logo após o ownership-scope (e antes de resolver o recipe), adiciona:

```ts
const route = routeForMetric(metric.id);
if (route) {
  const ra = await cachedRouteAccess(caches, email, clientId, route);
  if (!ra.allowed) return fail(ra.status ?? 403, ra.error ?? 'Sem permissão para esta página');
}
```

- `cachedRouteAccess` espelha `cachedAccess`: novo `Map<route, AccessResult>`
  em `MetricExecCaches` (chave = rota), para que um batch de uma mesma página
  (todas as métricas → mesma rota) faça **uma** verificação.
- `verifyRouteAccess(email, clientId, route)` já existe (`api-auth.ts`): admin
  bypass; lê `users`/`groups`; aplica `canAccessRoute` (routeOverrides por
  cliente > rotas dos grupos). Reuso direto — zero divergência com a UI.

`MetricExecCaches` passa a ter `routeAccessChecked: Map<string, AccessResult>`;
`newMetricExecCaches()` inicializa o novo mapa. Nenhuma mudança nas assinaturas
das rotas (ambas já chamam `executeMetric` com `email`/`clientId`).

## Data flow

```
/api/metrics/batch  (ou /[id]/data)
  └─ executeMetric(metric, clientId, email, caches)
       ├─ ownership-scope (metric.ownerClientId)
       ├─ routeForMetric(metric.id) → rota | null
       │     └─ se rota: cachedRouteAccess → verifyRouteAccess(canAccessRoute)
       │            deny → fail(403, 'Sem permissão para esta página')
       ├─ tenant-check (cachedAccess → verifyDatasetAccess)   [já existe]
       └─ resolve recipe → BigQuery
```

No `/batch`, a falha de rota vira o resultado `{ok:false, status:403}` **daquela
métrica** (falha parcial @ HTTP 200) — as demais métricas permitidas seguem. No
`/[id]/data`, vira a resposta 403.

## Error handling / consistência

- **Admin**: `verifyRouteAccess` retorna `allowed` para `isAdminEmail` → bypass.
- **Rota `null`** (compartilhada/genérica): pula a checagem → só tenant-check
  (paridade com o legado; limitação documentada).
- **Dev bypass** (`isDevAuthBypassEnabled`): `verifyAuthToken` devolve o email de
  dev; `verifyRouteAccess` trata admin/normal normalmente — comportamento
  inalterado em dev.
- **Mensagem**: `'Sem permissão para esta página'` (status 403), idêntica ao
  legado — sem vazar topologia.
- **Ordem**: a checagem de rota vem **antes** do tenant/cobertura, mas ambas
  retornam 403; a ordem não muda o efeito de segurança (nega em qualquer um).

## Impacto além das páginas fixas

`executeMetric` é o caminho comum de **todos** os consumidores semânticos:
páginas fixas migradas (dashboard), **relatórios/canvas** (`useReportData`) e
**chat**. Logo, uma métrica de página única (ex.: `play.pdd_bacen`) só será
servida — em qualquer contexto, inclusive dentro de um relatório custom — a
quem tem acesso à rota `/pdd`. Isso é **intencional** (fecha o bypass de forma
consistente) e espelha o legado, que enforçava por action independente do
chamador. Métricas compartilhadas (carteira básica) seguem acessíveis a qualquer
um com o tenant.

## Testes (TDD)

Unit puro — `src/shared/lib/permissions/__tests__/metric-route-map.test.ts`:
- métrica de página única → rota correta (ex.: `play.pdd_bacen` → `/pdd`);
- métrica compartilhada/dashboard → `null` (ex.: `play.total_contratos`);
- id desconhecido → `null`.

Enforcement — estende os testes de `execute-metric`/rota (há
`app/api/metrics/[id]/data/route.test.ts` e
`app/api/metrics/batch/__tests__/route.test.ts`; padrão de mock de Firestore +
`verifyAuthToken`/`verifyRouteAccess` já existe nos testes do legado e das
rotas):
- não-admin **sem** a rota → métrica de página única retorna **403**
  (`/[id]/data`) ou `{ok:false, status:403}` no `/batch`;
- não-admin **com** a rota (via grupo ou `routeOverrides`) → segue para o
  tenant-check normalmente;
- métrica compartilhada (rota `null`) → **não** é bloqueada por rota (só tenant);
- **admin** → bypass (acessa página única sem rota no grupo);
- batch misto (uma métrica de página restrita + uma compartilhada) → a restrita
  vem `403`, a compartilhada vem `ok` (falha parcial).

Verificação: `pnpm exec vitest run src/shared/lib/permissions src/shared/lib/metrics app/api/metrics` + `pnpm exec tsc --noEmit`.

## Consequência

O path semântico passa a aplicar permissão de rota no servidor, com paridade ao
legado — fecha o G1 (bypass de permissão fina) para `/[id]/data`, `/batch`,
relatórios e chat. Cada página fixa que migrar para `/batch` daqui em diante já
nasce protegida (basta a entrada no mapa). Destrava a migração segura das demais
páginas fixas e aproxima o G9-final (aposentar a `/api/bigquery`).

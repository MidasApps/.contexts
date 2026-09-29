# Revisão de aderência — Backend, API e Segurança

**Branch:** `chore/limpeza-vila-rosa` · **Data:** 2026-08-04 · **Escopo:** `app/api/**`,
`src/shared/lib/api-auth.ts`, `src/shared/lib/permissions/*`, `src/shared/lib/auth/*`,
`src/features/auth/*`, `src/shared/lib/runtime-config.ts`, `firestore.rules`, middleware.

**Convenções lidas:** `.contexts/engineering/rules/{security,api-design,validation,error-handling,observability,caching,governance}.md`
e `.contexts/engineering/contracts/{api,schemas,secrets}.md`.

**Números:** 39 arquivos `route.ts` → **84 handlers HTTP**. Não existe `middleware.ts` no
projeto (verificado: `find -maxdepth 2 -name middleware.ts` → vazio) — todo gate é in-handler.

---

## Parte 1 — Inventário

### 1.1 Rotas de API

Legenda de gate: **auth** = `verifyAuthToken`/token Bearer; **admin** = `requireAdmin` ou
`isAdminEmail`; **tenant** = `verifyClientAccess`/`verifyDatasetAccess`; **rota** =
`verifyRouteAccess` (permissão de página); **provision** = `getProvisionScope`/`verifyCanProvision`.

| Rota | Métodos | O que faz | Consumidor | Gate |
|---|---|---|---|---|
| `/api/admin/eval-runs` | GET | Agrega scores de eval runs por (scorer, persona, cliente) | `src/pages/admin-agent-quality/ui/ScorerHeatmap.tsx` | admin (`requireAdmin`) |
| `/api/admin/judge-drift` | GET | Série de drift do LLM-judge | `src/pages/admin-agent-quality/ui/JudgeDriftAlert.tsx` | admin (`requireAdmin`) |
| `/api/admin/orchestrator-metrics` | GET | Métricas de fase/sub-agente (stub, retorna vazio) | `src/pages/admin-orchestrator-analytics/ui/*` | auth + `isAdminEmail` |
| `/api/admin/sql-catalog` | GET, POST | Lista catálogo SQL por cliente (paginado); cria entrada com dry-run | `src/features/*` admin SQL | admin (`requireAdmin`) + `clientId` obrigatório |
| `/api/admin/sql-catalog/[id]` | GET, PATCH, DELETE | Lê/edita/remove entrada do catálogo | admin UI | admin (`requireAdmin`) |
| `/api/admin/sql-catalog/[id]/approve` | POST | Aprova entrada do catálogo | admin UI | admin (`requireAdmin`) |
| `/api/admin/sql-catalog/[id]/reject` | POST | Rejeita entrada | admin UI | admin (`requireAdmin`) |
| `/api/admin/sql-catalog/[id]/revalidate` | POST | Re-roda dry-run da SQL | admin UI | admin (`requireAdmin`) |
| `/api/admin/sql-catalog/dry-run` | POST | Valida SQL contra BigQuery sem persistir | admin UI | admin (`requireAdmin`) |
| `/api/ai-studio/agents` | GET, POST, PATCH, DELETE | CRUD de agentes (via `makeAiStudioRoutes('agent')`) | `src/features/ai-studio/admin/model/api.ts` | admin (factory `route-factory.ts:24,40,64,78`) |
| `/api/ai-studio/kb` | GET, POST, PATCH, DELETE | CRUD de knowledge bases | idem | admin (factory) |
| `/api/ai-studio/kb/[id]/docs` | GET, POST, DELETE | Lista/ingere/remove docs de uma KB (upload ≤10 MB) | idem | admin (`requireAdmin`) |
| `/api/ai-studio/skills` | GET, POST, PATCH, DELETE | CRUD de skills | idem | admin (factory) |
| `/api/ai-studio/tools` | GET | Lista tools registradas | idem | admin (`requireAdmin`) |
| `/api/ai-studio/workflows` | GET, POST, PATCH, DELETE | CRUD de workflows | idem | admin (factory) |
| `/api/canvas-chat` | POST | Orquestrador de canvas (LLM, stream, `maxDuration=600`) | `src/pages/explore/ui/*` | auth + tenant (`verifyDatasetAccess`) |
| `/api/chat` | POST | Chat Mastra com sub-agentes (stream, `maxDuration=300`) | `src/widgets/ai-sidebar/ui/AISidebar.tsx` | auth + tenant (`verifyDatasetAccess`) |
| `/api/clients` | GET, POST, DELETE | Lista clientes filtrados por `clientAccess`; cria/remove (admin) | `src/shared/hooks/useClients.ts`, `src/features/admin/model/useAdminClients.ts` | GET auth+filtro; POST/DELETE admin |
| `/api/dashboard-templates` | GET, POST, PATCH, DELETE | CRUD de templates de dashboard | `src/shared/lib/firestore/dashboard-templates.ts` | GET auth; escrita admin |
| `/api/data-contracts` | GET, POST, DELETE | CRUD de data contracts (camada semântica) | `src/features/admin/model/useAdminContracts.ts` | GET auth; escrita `isAdminEmail` |
| `/api/data-contracts/[id]/entities` | GET, POST | CRUD de entidades do contrato | `useAdminEntities.ts` | GET auth; POST `isAdminEmail` |
| `/api/data-contracts/[id]/entities/[entityId]` | DELETE | Remove entidade | `useAdminEntities.ts` | `isAdminEmail` |
| `/api/data-contracts/[id]/entities/[entityId]/attributes` | GET, POST, DELETE | CRUD de atributos | `useAdminAttributes.ts` | GET auth; escrita `isAdminEmail` |
| `/api/data-sources` | GET, POST, DELETE | CRUD de data sources (projetos GCP) | `useAdminDataSources.ts` | GET auth; escrita `isAdminEmail` |
| `/api/download/[filename]` | GET | Serve PDF/CSV efêmero de `/tmp` | Browser (URL devolvida por `/api/export-pdf`) | **nenhum** |
| `/api/export-pdf` | POST | Renderiza HTML do cliente em Chrome headless → PDF | `src/shared/hooks/usePdfExport.ts` | auth (sem tenant) |
| `/api/filter-options` | POST | Valores distintos de filtro (data-base/projeto) do BigQuery | `src/shared/hooks/useQuery.ts` | auth + tenant (checagem local `canAccessDataset`) |
| `/api/groups` | GET, POST, DELETE | CRUD de grupos de permissão | `src/features/admin/model/useAdminGroups.ts` | admin (`isAdminEmail`) em todos |
| `/api/metrics` | GET, POST, DELETE | Lista/salva/remove métricas (escopo por `ownerClientId`) | `src/features/admin/model/useAdminMetrics.ts` | auth + `authorizeMetricWrite` (admin p/ global, tenant p/ cliente) |
| `/api/metrics/[id]/data` | POST | Executa uma métrica contra o binding do cliente → BigQuery | `src/shared/hooks/useReportData.ts` | auth + tenant + **rota** (via `executeMetric`) |
| `/api/metrics/batch` | POST | Executa até 50 métricas numa chamada | `src/shared/hooks/useReportData.ts` | auth + tenant + **rota** (via `executeMetric`) |
| `/api/metrics/filter-values` | POST | Valores distintos de um `entity.attribute` p/ dropdown | `src/widgets/page-filter-bar/ui/PageFilterBar.tsx` | auth + tenant (`verifyClientAccess`) |
| `/api/metrics/rename` | POST | Rename atômico de métrica + repoint de refs | `useAdminMetrics.ts` | auth + `isAdminEmail` |
| `/api/products` | GET, POST, DELETE | CRUD de produtos | `src/shared/hooks/useProducts.ts`, `useAdminProducts.ts` | GET auth; escrita `isAdminEmail` |
| `/api/relations` | GET, POST, DELETE | CRUD de relations (JOIN cross-contract) | **nenhum consumidor no app** (só testes; runtime lê via Admin SDK) | GET auth; escrita `isAdminEmail` |
| `/api/report-groups` | GET, POST, PATCH, DELETE | CRUD de grupos de report por cliente | `src/shared/lib/firestore/groups.ts` | auth + tenant (`verifyClientAccess`) |
| `/api/reports` | GET, POST, PATCH, DELETE | CRUD de reports (+ `duplicate`/`move`) | `src/shared/lib/firestore/reports.ts` | auth + tenant (`verifyClientAccess`) |
| `/api/schema-detect/v2` | POST | Mapeia colunas BQ → `entity.attribute` via Gemini | `src/features/admin/ui/ClientForm.tsx` | admin (`verifyAdmin` local) |
| `/api/users` | GET, POST, DELETE | Provisionamento de usuários (Auth + claim + doc) | `src/features/admin/model/useAdminUsers.ts` | auth + **provision** (`getProvisionScope`/`verifyCanProvision`) |

### 1.2 Módulos de auth / permissão

| Módulo | Exporta | O que faz | Quem consome | Observação de gate |
|---|---|---|---|---|
| `src/shared/lib/api-auth.ts:45` | `verifyAuthToken` | Extrai Bearer, `verifyIdToken`, cache de 60 s, retorna e-mail | 20+ rotas | Fail-**open** para `DEV_BYPASS_EMAIL` em 3 pontos (`:48,:54,:67`) quando `isDevAuthBypassEnabled()` |
| `src/shared/lib/api-auth.ts:88` | `verifyDatasetAccess` | Autoriza dataset por `clientId` (novo) ou campo legado `dataset` | `/api/chat`, `/api/canvas-chat`, `execute-metric.ts:87` | Bypass admin em `:97`. Fail-closed para dataset órfão (`:157-159`) |
| `src/shared/lib/api-auth.ts:182` | `verifyClientAccess` | Cruza `clientId` do request com `users/{}.clientAccess` | `/api/reports`, `/api/report-groups`, `/api/metrics*` | Bypass admin em `:190` |
| `src/shared/lib/api-auth.ts:218` | `verifyRouteAccess` | Aplica `canAccessRoute` no servidor (paridade com a UI) | **só** `execute-metric.ts:100` | Bypass admin em `:223` |
| `src/shared/lib/api-auth.ts:272` | `getProvisionScope` | Escopo de provisionamento: global vs `adminClientIds` | `/api/users` GET/DELETE | Fail-closed sem doc ou lista vazia |
| `src/shared/lib/api-auth.ts:300` | `verifyCanProvision` | Autoriza provisionar alvo (subset de tenants, anti-escalada) | `/api/users` POST | Bloqueia promover alvo a admin global (`:309`) |
| `src/shared/lib/auth/require-admin.ts:37` | `requireAdmin`, `isAdminAuthOk` | Exige claim `role==='admin'`, **com fallback de domínio** | rotas `/api/admin/*` e `/api/ai-studio/*` | Fail-open dev em `:40,:45,:53` |
| `src/shared/lib/runtime-config.ts:32` | `isAdminEmail` | `email.endsWith('@' + ADMIN_EMAIL_DOMAIN)` | todos os gates acima | Sem componente de role/claim; domínio default hardcoded (`:1`) |
| `src/shared/lib/runtime-config.ts:37` | `isDevAuthBypassEnabled` | Liga bypass se `NODE_ENV=development` **e** (emulador ou `FIREBASE_ADMIN_PRIVATE_KEY` ausente) | `api-auth.ts`, `require-admin.ts`, 7 helpers locais | Contido em prod pelo `Dockerfile` (`NODE_ENV=production`) |
| `src/shared/lib/permissions/authorize.ts:35` | `canAccessRoute` | Lógica pura: `routeOverrides` do cliente > união das `routes` dos grupos | UI (`useUserPermissions`) e servidor (`verifyRouteAccess`) | Fonte única cliente/servidor — correto |
| `src/shared/lib/permissions/authorize.ts:52,63,75` | `isSubset`, `mergeClientAccessByScope`, `mergeAdminClientIdsByScope` | Merge por tenant preservando o que está fora do escopo | `/api/users` | — |
| `src/shared/lib/permissions/metric-route-map.ts:98` | `routeForMetric` | Mapeia `metricId` → rota; 64 ids `covenants.*` → `/g` | `execute-metric.ts:150` | Métrica ausente do mapa → `null` → **só tenant-check** |
| `src/shared/lib/permissions/normalize-route.ts:7` | `normalizeRoute` | Reduz `/g/{groupId}/r/{reportId}` → `/g` | `ProtectedRoute.tsx:26` | Alinha string do cliente com a do servidor |
| `src/features/auth/lib/embed-origin.ts:6` | `getAllowedEmbedOrigins`, `isAllowedEmbedOrigin` | Allowlist de origens para modo iframe | `AuthProvider.tsx` | Fail-closed: env vazia ⇒ nenhuma origem |
| `src/shared/lib/auth/client-token.ts:12` | `getClientAuthToken`, `authJsonHeaders` | Token para chamadas do browser (externo → Firebase) | hooks/`firestore/*.ts` | — |
| `firestore.rules` | — | Defesa em profundidade para o client SDK | Firebase | Coleções server-managed com `allow write: if false` (`:103,:114,:118,:122,:130,:134,:142,:146`) |

---

## Parte 2 — Tabela de aderência

| Módulo | Convenção | Aderente? | Evidência | Observação |
|---|---|---|---|---|
| `runtime-config.ts` (`isAdminEmail`) | security §3 — menor privilégio; ator sempre derivado do token validado | ❌ | `src/shared/lib/runtime-config.ts:32-35` | Sufixo de domínio é a **única** condição de super-admin. Curto-circuita os 4 gates (`api-auth.ts:97,190,223,273`): acesso cross-tenant total + provisionamento + bypass de permissão de rota. Não existe "funcionário sem privilégio". Tentei refutar: ADR-0018 §Contexto documenta isso como intencional, e `scripts/grant-claims.ts:12` confirma — mas a convenção exige privilégio mínimo, e o design não oferece degrau intermediário. |
| `runtime-config.ts` | security §3 / secrets §3.3 — config sensível não tem default silencioso | ❌ | `src/shared/lib/runtime-config.ts:1,11-13` | `ADMIN_EMAIL_DOMAIN` cai para `'askliquid.com'` hardcoded quando a env não está setada. Deploy com env faltando concede admin global silenciosamente — sem falha de boot. |
| `require-admin.ts` | security §3 — autorização por claim, não por atributo inferido | ⚠️ | `src/shared/lib/auth/require-admin.ts:57-64` | O gate primário (`role === 'admin'`) é correto, mas o fallback `isAdminEmail(email)` o torna inócuo: nenhum deploy precisa provisionar claim. Documentado como transição (`:10-14`) sem data de corte. |
| `api-auth.ts` (`verifyAuthToken`) | security §2 — token expirado ⇒ 401; validar sempre no servidor | ❌ | `src/shared/lib/api-auth.ts:48,54,67` | Em dev, header ausente / token vazio / **token inválido** (`catch`) retornam `DEV_BYPASS_EMAIL`, que é admin. Contido em prod por `Dockerfile` (`NODE_ENV=production`), mas é fail-open explícito no caminho de auth. |
| `api-auth.ts` (token cache) | caching §Dados sensíveis — "nunca cacheie tokens/JWTs em qualquer camada" | ❌ | `src/shared/lib/api-auth.ts:17,36` | `Map<token, {email, expiresAt}>` guarda o JWT bruto como chave em memória do processo. |
| `api-auth.ts` (token cache) | caching §SWR — "nunca sirva stale para dados de autorização" | ⚠️ | `src/shared/lib/api-auth.ts:16,58-59` | TTL fixo de 60 s ignora o `exp` do próprio token: usuário revogado/desabilitado segue autenticado por até 60 s. Janela pequena, mas é estado de autenticação servido stale. |
| `api-auth.ts` (`verifyDatasetAccess`) | security §3 — nunca confiar em ID vindo do cliente | ✅ | `src/shared/lib/api-auth.ts:104-139` | Com `clientId`, confirma que o dataset pertence ao cliente **e** cruza com `clientAccess`. Cobre `productBindings` e legado. |
| `api-auth.ts` (`verifyDatasetAccess`) | security §3 — fail-closed | ✅ | `src/shared/lib/api-auth.ts:157-159` | Dataset órfão (nenhum cliente reivindica) → 403. Regressão de vazamento cross-tenant já fechada. |
| `api-auth.ts` (`verifyCanProvision`) | security §3 — prevenção de escalada de privilégio | ✅ | `src/shared/lib/api-auth.ts:305-314` | Três checks fail-closed: tenants ⊆ escopo, alvo não vira admin global, sub-delegação ⊆ escopo. |
| `/api/users` POST | security §3 — validar ownership antes de mutar | ✅ | `app/api/users/route.ts:150-152,188-190,204-210,248` | E-mail imutável, `id === slug(email)`, overlap de footprint, gate de bootstrap de credencial. Cobertura adversarial em `__tests__/route-adversarial.test.ts`. |
| `/api/users` POST | validation §4 — `request.body` validado com Zod no boundary | ❌ | `app/api/users/route.ts:67-76` | Body inteiro entra por `as { ... }` (cast). Só `body.id` passa por schema (`:86`). `clientAccess[].routeOverrides` — que define permissão — chega sem validação de shape. |
| `/api/users` GET | api-design §5 — sempre paginar listagens | ❌ | `app/api/users/route.ts:29` | `collection('users').get()` sem limite/cursor. |
| `permissions/authorize.ts` | security §3 — autorização server-side, não cosmética | ✅ | `src/shared/lib/permissions/authorize.ts:35-49` + `src/shared/lib/api-auth.ts:251` | Mesma função pura usada pela UI e pelo servidor — não podem divergir. |
| `permissions/normalize-route.ts` | api-design §18 — consistência transversal | ✅ | `src/shared/lib/permissions/normalize-route.ts:7-10` + `src/features/auth/ui/ProtectedRoute.tsx:26` | Cliente e servidor comparam a mesma string `/g`. |
| `permissions/metric-route-map.ts` | security §3 — autorização em toda rota que toca dado de tenant | ⚠️ | `src/shared/lib/permissions/metric-route-map.ts:14-96,98-100` + `src/shared/lib/metrics/execute-metric.ts:150-154` | Allowlist **manual** de 64 ids. Métrica nova ou fora do mapa ⇒ `null` ⇒ some o gate de rota, restando só o tenant-check. É fail-**open** por omissão: o default deveria negar ou exigir mapeamento explícito. Comportamento documentado em `:5-8`, mas nada impede o esquecimento. |
| `execute-metric.ts` | caching §Escopo — chave inclui o principal | ⚠️ | `src/shared/lib/metrics/execute-metric.ts:85,98` | Caches de access-check são keyed só por `datasetId`/`route`. Correto hoje porque `newMetricExecCaches()` é criado por request (`app/api/metrics/batch/route.ts:91`), mas a chave não carrega `email`/`clientId` — se o cache virar cross-request, vaza autorização. |
| `/api/download/[filename]` | security §3 — autorização em **toda** rota que toca dado de tenant | ❌ | `app/api/download/[filename]/route.ts:13-15,17` | Rota **sem autenticação**. Serve qualquer `/tmp/[\w-]+\.(pdf|csv)`. Os comentários assumem segurança-por-obscuridade do UUID; a convenção não admite essa troca. Relatórios de tenant saem por aqui. |
| `/api/download/[filename]` | security §16 — nome de arquivo gerado no servidor, sem path do cliente | ✅ | `app/api/download/[filename]/route.ts:6,24-29` + `app/api/export-pdf/route.ts:151` | `SAFE_FILENAME_RE` bloqueia traversal; nome vem de `randomUUID()`. |
| `/api/download/[filename]` | caching §Headers — `no-store` em dado sensível | ✅ | `app/api/download/[filename]/route.ts:59` | — |
| `/api/export-pdf` | security §3 — autorização, não só autenticação | ⚠️ | `app/api/export-pdf/route.ts:25-28` | Só `verifyAuthToken`. Sem tenant-check — mas o HTML vem do próprio cliente, então não há leitura de dado alheio no servidor. Risco real é de recurso, não de dado. |
| `/api/export-pdf` | security §5/§17 — conteúdo não confiável renderizado | ⚠️ | `app/api/export-pdf/route.ts:53,64-72,95` | HTML controlado pelo cliente vai para `page.setContent()` num Chrome com `--no-sandbox`. Mitigado por interceptação que só permite `data:`/`blob:`/`about:` (anti-SSRF correto), mas a superfície continua sendo um browser sem sandbox. |
| `/api/export-pdf` | error-handling §7 — nunca expor `error.message` na resposta | ❌ | `app/api/export-pdf/route.ts:166` | `err.message` devolvido ao cliente (pode conter caminho do Chrome, erro de FS). |
| `/api/chat`, `/api/canvas-chat` | security §3 — isolamento multi-tenant antes de qualquer efeito | ✅ | `app/api/chat/route.ts:100-103`; `app/api/canvas-chat/route.ts:61-64` | `verifyDatasetAccess` roda **antes** de `getClientSemanticContext` e do agente — impede injeção de `clientId`/`dataset` de outro tenant no prompt/recall. |
| `/api/chat`, `/api/canvas-chat` | security §8 — rate limit e budget de tokens em rotas de LLM | ❌ | `app/api/chat/route.ts:42-43`; `app/api/canvas-chat/route.ts:11-12` | Nenhum rate limit, nenhum cap de tokens por usuário/tenant, em rotas com `maxDuration` 300 s/600 s. Busca global por `rate.?limit\|429\|Retry-After` só encontra `src/features/ai-agents/lib/with-retry.ts` (retry de saída). |
| `/api/chat`, `/api/canvas-chat` | validation §4 — body validado com Zod no boundary | ❌ | `app/api/chat/route.ts:45-59,74-92`; `app/api/canvas-chat/route.ts:19-52` | Body tipado por `interface` + cast; validação manual ad-hoc (`!body.dataset`, regex de data). `messages`, `dashboardState`, `personaId` entram sem schema e alimentam o prompt. |
| `/api/chat` | api-design §11 — stream com evento de término/erro explícito | ⚠️ | `app/api/chat/route.ts:155-171` | Usa `createUIMessageStream`; não há `event: error` estruturado próprio para falha mid-stream. Relacionado ao bug conhecido de framing de sub-agente. |
| `/api/metrics/[id]/data`, `/api/metrics/batch` | validation §4 / §18 — Zod no boundary, `discriminatedUnion` | ✅ | `app/api/metrics/[id]/data/route.ts:29-53,66`; `app/api/metrics/batch/route.ts:27-39,47` | Schemas no topo do módulo, `discriminatedUnion('kind')`, cap `.max(50)` no batch. |
| `/api/metrics/batch` | api-design §3 — status code é o sinal primário | ⚠️ | `app/api/metrics/batch/route.ts:20,108` | Falha parcial → HTTP 200 com erros por métrica. Semântica de batch é defensável, mas o contrato não está formalizado em `@contracts/api` e diverge do resto das rotas. |
| `/api/metrics` POST/DELETE | security §3 — ownership antes de mutar | ✅ | `app/api/metrics/route.ts:306-314,386-392` | Anti-sequestro: em update, preserva o `ownerClientId` do doc existente e ignora o do body. |
| `/api/metrics/filter-values` | security §4 — input do cliente não vai cru para query | ✅ | `app/api/metrics/filter-values/route.ts:30,38` + `src/shared/lib/bigquery/identifier.ts` (`quoteIdentifier`) | Zod + resolução via `schemaBindings` (fail-loud) + quoting de identificador. |
| `/api/reports`, `/api/report-groups` | security §3 — autorização por tenant em rota tenant-scoped | ✅ | `app/api/reports/route.ts:26,111,250,290`; `app/api/report-groups/route.ts:19,57,95,129` | Todos os 8 handlers cruzam `clientId` com `clientAccess`. Fecha o IDOR cross-tenant. |
| `/api/reports`, `/api/report-groups` | security §3 — permissão fina não pode ser só cosmética | ⚠️ | `app/api/reports/route.ts:250-262` vs `src/shared/lib/api-auth.ts:218` | Nenhum handler chama `verifyRouteAccess`. Um usuário com `routeOverrides` restrito ao tenant ainda lê, edita, move e **apaga** qualquer report do cliente pela API. Os *dados* das métricas são gated por rota; a *configuração* dos reports não. |
| `/api/reports` | validation §4 — body com Zod | ❌ | `app/api/reports/route.ts:90-105,232-241` | POST e PATCH recebem `blockMap`, `layout`, `queries`, `filters` como `unknown`/`Record<string, unknown>` via cast e gravam direto no Firestore (`:216,:262`). Contraria também validation §12 ("nunca escreva no Firestore objeto que não passou por schema de escrita"). |
| `/api/reports`, `/api/report-groups` | api-design §5 — paginar listagens | ⚠️ | `app/api/reports/route.ts:58`; `app/api/report-groups/route.ts:25-30` | `orderBy('order').get()` sem limite. Coleções pequenas hoje; a convenção pede projetar para crescimento. |
| `/api/clients` GET | security §3 — filtro por permissão | ✅ | `app/api/clients/route.ts:30-37` | Filtra por `clientAccess`; admin vê tudo. |
| `/api/clients` GET | api-design §5 — paginar | ❌ | `app/api/clients/route.ts:29` | `collection('clients').get()` completo antes de filtrar. |
| `/api/clients`, `/api/groups` escrita | security §3 — gate admin | ✅ | `app/api/clients/route.ts:51,142`; `app/api/groups/route.ts:12,39,92` | — |
| `/api/clients` POST | validation §2 — parse, não validate | ✅ | `app/api/clients/route.ts:64,77` | `ClientDoc.safeParse` + `Slug.safeParse` no id (evita path injection). |
| `/api/groups` POST | validation §4 — Zod no body | ❌ | `app/api/groups/route.ts:44-49` | `routes[]` — o array que **define permissão de página** — chega por cast, sem schema nem allowlist de rotas válidas. |
| `/api/dashboard-templates` | security §3 — escrita admin-only | ✅ | `app/api/dashboard-templates/route.ts:53,133,152` | Coberto por `__tests__/admin-guard.test.ts`. |
| `/api/dashboard-templates` PATCH | validation §4 — Zod no body | ❌ | `app/api/dashboard-templates/route.ts:137-141` | POST valida com `DashboardTemplateDoc.safeParse` (`:87`), mas PATCH copia um allowlist de chaves do body cru para `update()` sem schema. Inconsistência dentro do mesmo arquivo. |
| `/api/data-contracts`, `/api/data-sources`, `/api/products`, `/api/relations`, `/api/metrics` | security §2 — uma única fonte de verdade de autenticação por superfície | ❌ | `app/api/data-contracts/route.ts:24`; `data-sources/route.ts:25`; `metrics/route.ts:28`; `products/route.ts:67`; `metrics/rename/route.ts:35`; `data-contracts/[id]/entities/route.ts:24`; `data-contracts/[id]/entities/[entityId]/route.ts:27` | **7 cópias** de `verifyAuth` local, mais uma oitava variante `verifyAdmin` em `app/api/schema-detect/v2/route.ts:35`. Divergem de `verifyAuthToken`: não fazem `.trim()` no token e não usam o cache. Cada cópia replica o fail-open de dev independentemente. |
| `/api/data-contracts`, `/api/data-sources`, `/api/products`, `/api/relations` GET | security §3 — autorização, não só autenticação | ⚠️ | `app/api/products/route.ts:82-88`; `data-sources/route.ts:40-48`; `data-contracts/route.ts:39-48`; `relations/route.ts:13-18` | Qualquer usuário autenticado (inclusive de outro tenant) lê o catálogo completo de contratos, data sources e produtos. É metadado de configuração, não dado de carteira — mas `dataSources` expõe projeto/dataset GCP de todos os clientes. |
| `/api/relations` | governance §Decisões — código sem consumidor | ⚠️ | `app/api/relations/route.ts:13,21,54` | Nenhum consumidor no app (busca em `src/` só acha o teste); o runtime lê `relations` direto via Admin SDK em `execute-metric.ts:91`. Superfície de escrita exposta sem uso. |
| `/api/schema-detect/v2` | validation §4 / §2 — Zod no boundary | ✅ | `app/api/schema-detect/v2/route.ts:28-33,57` | `RequestBody.safeParse` com `Slug`/`SqlIdentifier` branded. |
| `/api/schema-detect/v2` | security §4 — input do cliente não vai cru para query | ✅ | `app/api/schema-detect/v2/route.ts:76-79` | `safeIdentifier` + `safeDatasetRef` antes de montar o SQL. |
| `/api/schema-detect/v2` | error-handling §7 — não expor `error.message` | ❌ | `app/api/schema-detect/v2/route.ts:87-89` | `console.error` do erro cru + `err.message` na resposta 500. |
| `/api/ai-studio/*` | security §3 — gate admin uniforme | ✅ | `app/api/ai-studio/route-factory.ts:24,40,64,78` | A factory aplica `requireAdmin` nos 4 verbos; as 4 rotas finas herdam sem chance de esquecer. Bom padrão. |
| `/api/ai-studio/*` PATCH | validation §4 — Zod no body | ❌ | `app/api/ai-studio/route-factory.ts:67-70` | POST valida o id (`Slug.safeParse`, `:53`); PATCH passa `updates` inteiro para `repo().patch` sem schema. |
| `/api/ai-studio/kb/[id]/docs` POST | security §16 — validar MIME **e magic bytes**; limite de tamanho no servidor | ⚠️ | `app/api/ai-studio/kb/[id]/docs/route.ts:10,36-42,47` | Extensão e tamanho (10 MB) validados no servidor — correto. Mas o MIME vem de `file.type` declarado pelo cliente, sem checagem de magic bytes. |
| `/api/admin/*` | security §3 — gate admin | ✅ | `app/api/admin/sql-catalog/route.ts:32,74`; `eval-runs/route.ts:72`; `judge-drift/route.ts:64`; `[id]/route.ts:24,41,80` | `requireAdmin` no topo de todos os 12 handlers. |
| `/api/admin/sql-catalog` GET | api-design §5 — paginação com limite máximo | ✅ | `app/api/admin/sql-catalog/route.ts:50-56` | `pageSize` clampado em 200, `page` ≥ 1. Offset-based, aceitável para lista administrativa. |
| `/api/admin/sql-catalog` GET | security §3 — fail-closed por tenant | ✅ | `app/api/admin/sql-catalog/route.ts:36-41` | `clientId` obrigatório com 400 explícito citando ADR-0006. |
| `/api/admin/sql-catalog` POST | validation §2 — parse, não validate | ❌ | `app/api/admin/sql-catalog/route.ts:71-84` | `typeof body.x === 'string'` manual em vez de Zod; `PostBody` declara tudo como `unknown`. |
| `/api/admin/orchestrator-metrics` | security §3 — gate admin | ✅ | `app/api/admin/orchestrator-metrics/route.ts:47-53` | Usa `verifyAuthToken` + `isAdminEmail` em vez de `requireAdmin` — inconsistente com as outras 11 rotas `/api/admin/*`, mas o efeito de gate é equivalente. |
| Todas as rotas | error-handling §7 / contracts/api §6.2 — envelope de erro estável, sem mensagem de SDK crua | ❌ | `app/api/reports/route.ts:78-79`; `metrics/route.ts:251-252`; `products/route.ts:91-92`; `users/route.ts:339-340`; `clients/route.ts:41-42` | Padrão dominante é `{ error: err.message }`. O contrato pede `{ error: { code, message, details, requestId } }` com `code` SCREAMING_SNAKE_CASE. Nenhuma rota emite `code` nem `requestId`; várias devolvem a mensagem do Firestore/SDK direto. |
| Todas as rotas | contracts/api §5 — envelope de sucesso `{ data, meta }` | ⚠️ | `app/api/metrics/batch/route.ts:108` (`{ results }`); `app/api/users/route.ts:335` (`{ ok: true }`); `app/api/reports/route.ts:76` (`{ data }`) | `{ data }` é majoritário e correto; `{ ok: true }`, `{ results }`, `{ items, total, page, pageSize }` (`admin/sql-catalog/route.ts:60`) convivem. Nenhuma resposta traz `meta.requestId`. |
| Todas as rotas | api-design §14 / security §8 — rate limiting | ❌ | busca global: só `src/features/ai-agents/lib/with-retry.ts:1` | Zero rate limiting no projeto. Nenhum `429`, nenhum `Retry-After`, nenhum header `RateLimit-*`. Aplica-se em especial a `/api/chat`, `/api/canvas-chat`, `/api/export-pdf` (spawna Chrome) e `/api/schema-detect/v2` (chama Gemini). |
| Todas as rotas | observability §Structured logging — logger central JSON, nunca `console` em runtime | ❌ | `app/api/metrics/[id]/data/route.ts:115`; `metrics/batch/route.ts:110`; `filter-options/route.ts:75`; `export-pdf/route.ts:164`; `schema-detect/v2/route.ts:87` | Não existe módulo de logger no repo. 12 arquivos de rota usam `console.*` com string interpolada. Sem `timestamp`/`level`/`service`/`requestId` estruturados. |
| Todas as rotas | observability §Correlation — `requestId`/`traceId` propagado | ❌ | ausência em `app/api/**/route.ts` | Nenhum handler atribui ou propaga `requestId`. Sem `middleware.ts`, não há ponto único para gerar. Impossível correlacionar log de rota com span de LLM. |
| Todas as rotas | observability §OpenTelemetry / §Onde aplicar — span raiz por handler | ❌ | ausência em `app/api/**/route.ts` | Nenhum route handler abre span. Consequência direta: `/api/admin/orchestrator-metrics/route.ts:54-62` devolve `phases: []` e `experimental: true` porque não há camada de telemetria persistida. |
| Todas as rotas | api-design §10 / contracts/api §7 — `Content-Type: application/json`; 401 vs 403 distintos | ✅ | `app/api/reports/route.ts:13,28`; `metrics/[id]/data/route.ts:60`; `require-admin.ts:29-35` | `NextResponse.json` fixa o Content-Type; 401 para não-autenticado e 403 para sem-permissão são consistentes em toda a superfície. |
| Todas as rotas | api-design §2 — verbo HTTP carrega a semântica | ⚠️ | `app/api/reports/route.ts:91,119,149`; `dashboard-templates/route.ts:57`; `metrics/route.ts:262`; `ai-studio/route-factory.ts:45` | Ações vão em `body.action` (`duplicate`, `move`, `promote`, `reset`) em vez de sub-recurso (`POST /reports/{id}/duplicate`). `POST /api/metrics/rename` também é verbo no path. |
| Todas as rotas | api-design §7 / §15 — versionamento de API interna | ⚠️ | `app/api/schema-detect/v2/route.ts` vs demais | APIs internas não devem ser versionadas (§15) — 38 rotas seguem isso. `schema-detect/v2` é a única versionada, sem `/v1` coexistindo. Inconsistência transversal (§18). |
| Todas as rotas | security §7 — mutação nunca via GET; CSRF | ✅ | `app/api/**/route.ts` (inventário §1.1) | Toda mutação é POST/PATCH/DELETE. Credencial vai em `Authorization: Bearer` (`client-token.ts:25`), não em cookie — CSRF estruturalmente mitigado. |
| Todas as rotas | security §6 — CORS não-permissivo em rota autenticada | ✅ | `next.config.ts:5-17` | Nenhum `Access-Control-Allow-Origin` é emitido; same-origin por default. |
| `next.config.ts` | security §6 — HSTS, `nosniff`, `Referrer-Policy`, CSP | ❌ | `next.config.ts:5-17` | Único header configurado é `Cross-Origin-Opener-Policy`. Faltam `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` e CSP. `docs/embedded-mode-postmessage-auth.md:145` já documenta o `frame-ancestors` pretendido, não implementado. |
| `firestore.rules` | security §10 — deny-by-default; sem `if true` | ✅ | `firestore.rules:103,107,114,118,122,130,134,142,146` | Todas as coleções server-managed têm `allow write: if false`. Nenhum `if true` no arquivo. |
| `firestore.rules` | security §10 — validar tenant em coleção per-tenant | ✅ | `firestore.rules:30-36,102,113,129` | `tenantAllowed()` aceita `clientIds[]` (ADR-0018) com guarda `is list` fail-closed, mantendo compat com o `clientId` singular. |
| `firestore.rules` | security §3 — menor privilégio na leitura | ⚠️ | `firestore.rules:40,61,69,77` | `clients`, `groups`, `products` e `dataSources` são legíveis por **qualquer** usuário autenticado pelo client SDK, sem filtro de tenant. Metadado de configuração de todos os clientes exposto cross-tenant. |
| `firestore.rules` | security §10 — Rules como defesa em profundidade coerente com a API | ⚠️ | `firestore.rules:49,54` | `clients/{id}/groups/**` permite `write` a qualquer membro do tenant via client SDK, contornando os checks de `/api/reports`. Não é cross-tenant, mas é uma segunda porta com regra mais frouxa que a primeira. |
| Config de ambiente | validation §5 — `process.env` validado com Zod no boot | ❌ | `src/shared/lib/runtime-config.ts:6-9` + 60 ocorrências de `process.env.` em `src/`+`app/` | Não existe módulo `env` validado. `readEnv` só faz trim, e defaults silenciosos (`?? DEFAULT_*`) mascaram misconfiguração — exatamente o anti-pattern de §5. |
| Secrets | secrets §2 / security §1 — nada de secret commitado | ✅ | `.gitignore:10,11,39,41,42`; `git ls-files` retorna só `*.example` e `secrets/.gitkeep` | `.env.local`, `.env`, `.env.docker` e `secrets/*` ignorados. Nenhuma chave versionada. |
| Secrets | secrets §1 — nada sensível sob `NEXT_PUBLIC_` | ✅ | `.env.example:15-29,70,79,100` | Só config pública de Firebase, IDs de database, domínio admin e allowlist de embed. |
| Governança | governance §Code ownership — `CODEOWNERS` cobrindo módulos de auth | ❌ | ausência de `.github/CODEOWNERS` e `CODEOWNERS` na raiz | A convenção exige CODEOWNERS com ≥2 owners para módulos de autenticação — não existe no repo, então nenhum gate de aprovação protege `api-auth.ts` / `firestore.rules`. |
| Governança | governance §ADRs — decisão registrada antes da implementação | ⚠️ | `adrs/decisions/0018-tenancy-por-usuario-conjunto-clientids.md:8` | ADR-0018 está `Proposed` desde 2026-07-21, mas o código que ela decide (`verifyCanProvision`, `mergeClientAccessByScope`, claim `clientIds[]`, `tenantAllowed`) já está implementado e em produção. Convenção pede ADR aprovado antes do PR. |

**Total: 76 linhas de aderência** — 31 ✅, 19 ⚠️, 26 ❌.

---

## Achados mais graves

### 1. `isAdminEmail` é um super-admin por sufixo de domínio, com default hardcoded

`src/shared/lib/runtime-config.ts:32-35` — a única condição para privilégio global é o e-mail
terminar no domínio configurado. Isso curto-circuita, na primeira linha, **todos** os gates de
autorização: `verifyDatasetAccess` (`api-auth.ts:97`), `verifyClientAccess` (`:190`),
`verifyRouteAccess` (`:223`) e `getProvisionScope` (`:273`). Não há claim, não há role, não há
degrau intermediário: qualquer conta no domínio lê a carteira de todos os tenants, provisiona
usuários e ignora permissão de página. `require-admin.ts:60-63` mantém o mesmo fallback,
neutralizando o gate por claim `role === 'admin'` que ele próprio implementa.

Agravante: `runtime-config.ts:1,11-13` faz `ADMIN_EMAIL_DOMAIN` cair para `'askliquid.com'`
hardcoded quando a env não está definida — um deploy com env faltando concede admin global em
silêncio, sem falha de boot.

Verifiquei se era intencional antes de classificar: ADR-0018 (§Contexto, item 2) e
`scripts/grant-claims.ts:12` documentam o comportamento. Ainda assim contraria security §3
(menor privilégio) — e o próprio ADR-0018 propõe `clientAdmin` justamente para criar o degrau
que hoje não existe, o que confirma que o estado atual é reconhecido como insuficiente.

### 2. Ausência total de rate limiting, telemetria estruturada e headers de segurança

Três lacunas transversais que a convenção trata como obrigatórias:

- **Rate limiting (security §8, api-design §14):** zero. Busca global por
  `rate.?limit|429|Retry-After|RateLimit-` em `src/`+`app/` só acha
  `src/features/ai-agents/lib/with-retry.ts:1` (retry de chamadas *de saída*). Sem cap por
  usuário/tenant em `/api/chat` (`maxDuration=300`), `/api/canvas-chat` (`maxDuration=600`),
  `/api/schema-detect/v2` (Gemini) e `/api/export-pdf` (spawna um Chrome por request).
  A convenção exige budget de tokens hard no servidor para features de IA — não existe.
- **Observabilidade (observability §Structured logging, §Correlation, §OTel):** não há logger
  central; 12 arquivos de rota usam `console.*` com string interpolada
  (`metrics/[id]/data/route.ts:115`, `export-pdf/route.ts:164`, …). Nenhum handler gera ou
  propaga `requestId`/`traceId`, nenhum abre span. É por isso que
  `admin/orchestrator-metrics/route.ts:54-62` devolve `phases: []` e `experimental: true`.
- **Headers HTTP (security §6):** `next.config.ts:5-17` configura só
  `Cross-Origin-Opener-Policy`. Faltam HSTS, `X-Content-Type-Options`, `Referrer-Policy` e CSP —
  esta última já desenhada em `docs/embedded-mode-postmessage-auth.md:145` e nunca implementada.

### 3. Validação de input ausente exatamente onde o payload define permissão ou vai cru para o banco

O projeto tem schemas Zod bons e os usa bem em `/api/metrics/*` e `/api/schema-detect/v2`. O
problema é a distribuição:

- `/api/groups` POST (`app/api/groups/route.ts:44-49`) recebe `routes[]` — o array que **define
  qual página cada grupo pode ver** — por cast, sem schema nem allowlist de rotas válidas.
- `/api/users` POST (`app/api/users/route.ts:67-76`) recebe `clientAccess[].routeOverrides` —
  que sobrescreve a permissão por cliente — também por cast. Só o `id` passa por schema (`:86`).
- `/api/reports` POST/PATCH (`:90-105`, `:232-241`) grava `blockMap`, `layout`, `queries` e
  `filters` no Firestore como `unknown`, violando validation §12 ("nunca escreva no Firestore um
  objeto que não passou por schema de escrita").
- `/api/chat` e `/api/canvas-chat` (`chat/route.ts:45-59`; `canvas-chat/route.ts:19-52`) validam
  `dateRange` com regex manual e deixam `messages`/`dashboardState`/`personaId` entrarem sem
  schema — e esses campos alimentam o prompt do LLM.

**Menções honrosas** (graves, mas abaixo dos três acima): `/api/download/[filename]` é
completamente não autenticado e serve relatório de tenant de `/tmp` apoiado em
segurança-por-obscuridade (`route.ts:13-15`); o gate de rota por métrica é uma allowlist manual
onde **omissão significa liberar** (`metric-route-map.ts:98-100` +
`execute-metric.ts:150-154`); e existem **8 cópias locais** do helper de autenticação
(7× `verifyAuth` + 1× `verifyAdmin` em `schema-detect/v2/route.ts:35`) que divergem de
`verifyAuthToken` e replicam o fail-open de dev cada uma por conta própria.

# Spec — Revisão e Remediação para "Terminar o Produto" (Liquid DataViz)

- **Data:** 2026-07-21
- **Branch:** `feat/vila-rosa-covenants-v2`
- **Status:** Proposed
- **Autores:** Giulliano Soares + Claude Code
- **Insumos:** `docs/documentacao-produto.html` (documentação de produto, 6 seções + Apêndice A com 92 observações); crítica adversarial do design por 4 agentes (cobertura, DoD, método/esquema, priorização), toda grounded no código.

> Este documento define **o COMO** da revisão (metodologia, definição de pronto, esquema de achado, salvaguardas e sequenciamento). **Não** é a auditoria em si e **não** implementa correções. Executá-lo produz dois artefatos: (a) um **registro de achados verificados** e (b) um **backlog de remediação priorizado**, que então alimenta a skill `writing-plans`.

---

## 1. Contexto e objetivo

O Liquid DataViz é um dashboard multi-tenant (Next.js 16 App Router) de securitização de crédito, com config canônica em Firestore (`liquid-play-dataviz`), dados de cliente em BigQuery (`bq-data-wh`) e uma camada de IA em runtime Mastra (ADR-0014). O produto está funcional para uso interno (admin `@askliquid.com`), mas há dúvida sobre **coerência e completude** das funcionalidades para "terminar o produto".

**Objetivo desta revisão:** auditar todas as funcionalidades documentadas, verificar cada inconsistência contra o código atual, descobrir defeitos que a documentação não pegou, e produzir um backlog de correção priorizado — **sem implementar features novas**, apenas fechar o que falta para o produto estar pronto segundo dois marcos de "pronto" (§3).

## 2. Escopo e não-escopo

**Em escopo:** as 6 seções da documentação (cadastro de cliente → bases → contratos → métricas → templates/reports → frontend → camada de IA), cruzadas por 6 lentes de qualidade (§4). Foco declarado do cliente: **CRUD, permissões, arquitetura agêntica/harness e configuração de onboarding**.

**Fora de escopo:**
- Implementar features novas.
- Reescrever arquitetura (decisões em `adrs/decisions/` são a fonte canônica; correções que divergem de uma ADR aceita exigem nova ADR com `supersedes:`).
- Melhorias de plataforma que **não** bloqueiam nenhum marco de pronto (§3) — vão para "dívida técnica anotada", não para o backlog de release.

## 3. Definição de Pronto (DoD)

Cada achado é priorizado pelo quanto bloqueia um destes dois marcos. **Todo critério é escrito como asserção verificável** (status HTTP, contagem de navegação, presença/ausência de linha), não como narrativa.

### DoD-1 — Cliente externo usável ponta-a-ponta (por não-admin, sem bypass)

1. Um cliente novo pode ser criado **pela Admin UI** com ≥1 `productBinding` + `schemaBindings`, sem editar código (paridade com `scripts/seed-*`).
2. Um admin consegue, **pela Admin UI**, conceder a rota `/g` (dinâmica de reports) a um grupo **ou** a `clientAccess.routeOverrides` de um usuário. *(Hoje impossível: `/g` não está em `ALL_ROUTES` — `src/features/admin/model/types.ts:55-70`; `RouteCheckboxGrid` só renderiza 4 grupos — `RouteCheckboxGrid.tsx:11,16`.)*
3. As camadas cliente e servidor concordam sobre a **mesma string de rota**. *(Hoje divergem: server compara `/g` exato — `execute-metric.ts:150-154` / `authorize.ts:47-48`; client compara o pathname completo `/g/{groupId}/r/{reportId}` — `ProtectedRoute.tsx:25,32` via `DashboardLayout.tsx:70,80`.)*
4. Um usuário **não-admin** com `clientAccess=[<cliente>]` e `/g` concedido: loga, vê a navegação só do seu cliente, abre `/g/{groupId}/r/{reportId}`, e **todas** as métricas do report retornam **200** em `POST /api/metrics/batch` (client E server), sem 403.
5. Aplica filtros de página (dropdown), faz drill-through entre reports (propagação por querystring) e exporta PDF — todos com sucesso observável.
6. **Provisionamento de acesso** existe e é documentado: há um fluxo (UI ou runbook) para criar a credencial do usuário e vinculá-la a `clientAccess`; um usuário novo loga **sem** precisar de console Firebase. *(Hoje `POST /api/users` só grava doc Firestore — `users/route.ts:104-111`; não há `createUser` no app; reset de senha já existe — `useAuth.ts:131`.)*
7. **Fail-closed de conta órfã:** conta autenticada sem `clientAccess` loga, vê 0 itens de navegação (`ProtectedRoute.tsx:81-90`) e recebe 403 em `/api/metrics/*`.
8. **Bypasses contidos/escopados:** `embedded` (iframe) e `print-token` (`?_pt=`, `AuthProvider.tsx:69-87`) não concedem admin global incondicional; qualquer acesso via token é curto, assinado e escopado ao tenant. Bypass de dev (`NODE_ENV=development`) permanece off em produção por construção (`runtime-config.ts:37-45`).
9. **Estados de erro/vazio:** report sem dados, métrica 422/500 (`execute-metric.ts:255-257`) e expiração do cache de 5 min do `useQuery` têm comportamento observável e não quebram a página.

### DoD-2 — Camada de IA gerenciável em produção

1. **CRUD consistente** de agentes/skills/tools/KB/workflows pela AI Studio; salvar e recarregar preserva o shape.
2. **Enum de modelo idêntico** entre schema e runtime: salvar qualquer um dos tiers na Admin UI resolve para um modelo válido. *(Hoje diverge: schema `['router','fast','slow','reasoning']` — `ai-studio/agent.ts:5`; runtime `['router','fast','flash','reasoning']` — `create-mastra-agent-from-config.ts:39`, `config/agents/types.ts:51`, `model-registry.ts:10-18`. `slow` quebra no runtime; `flash` é rejeitado no save.)*
3. **Gating de tools por cliente** funciona e é observável.
4. **Approve do catálogo SQL** exige `clientId` (400 sem ele) e retorna 403 se `clientId != existing.client_id` — enforce, não opt-in. *(Hoje o guard só dispara se `clientId` vier no body — `approve/route.ts:57-62`; e `requireAdmin` é global via `isAdminEmail`.)*
5. **Chat funcional:** o stream renderiza no `useChat` sem chunk cru de framing de sub-agente (bug conhecido — [[chat-stream-mastra-aisdk-bug]]).
6. **Memória/RAG por tenant:** isolamento por cliente, com TTL e política de PII aplicados.
7. Evals + judge-drift operáveis (rodam, gravam, exibem).
8. Itens nomeados explicitamente como **critério** ou **fora-de-escopo** (não deixados implícitos): versionamento/ativação de agente, custo/rate-limit/timeout, telemetria/audit de edição, defesa contra prompt-injection via KB (`kb-retrieval-tool.ts:26-33`), fallback de modelo.

### Lista de regressão (JÁ satisfeito hoje — não é gap; não pode regredir)

- Fail-closed server-side de dados: datasets órfãos/cross-tenant negados (`api-auth.ts:125-127,157-166,251-253`); `executeMetric` cruza `ownerClientId` + rota + dataset + cobertura (`execute-metric.ts:138-153,234-235`).
- Bypass de dev off em produção por construção (`runtime-config.ts:37-45`).
- Isolamento de KB por tenant (`query-kb.ts:20-25`).
- Reset de senha (`useAuth.ts:131`, `LoginPage.tsx:227-233`).

Estes viram **casos de regressão** no plano de verificação, não itens de backlog.

## 4. Matriz de cobertura (espinha × lentes)

### Espinha — ordem de **dependência** (não "cliente primeiro")

A ordem reflete o que o onboarding real exige que já exista (doc §837-891; obs. #9: `contractRef` errado → 422 silencioso em `execute-metric.ts:210`):

| # | Estágio (config) | Superfície principal |
|---|---|---|
| E1 | DataSources & BigQuery | `data-sources`, `liquid_aux`, `schema-detect/v2`, `bigquery/` |
| E2 | Data Contracts | `data-contracts` + `entities` + `attributes`, `relations` |
| E3 | Products | `products` |
| E4 | Métricas & indicadores | `metrics`, recipes, `resolve-metric`, gating, `metrics/filter-values`, `metrics/rename` |
| E5 | Templates | `dashboard-templates`, `scripts/templates/*` |
| E6 | Cliente & bindings | `clients` (productBindings/schemaBindings), `ClientForm` |
| E7 | Reports & Groups | `reports`, `report-groups`, `clients/{id}/groups` |
| E8 | Usuários & permissões (**último**) | `users`, `groups` (RBAC), claims (`grant-claims`), concessão de rotas |

| # | Estágio (uso) | Superfície principal |
|---|---|---|
| E9 | Experiência do cliente no frontend | `/g`, `PageFilterBar`, drill-through, `export-pdf`/`download`, tema; Explore/Canvas (`explore/`, `canvas-chat`, `create-chat-metric`) |
| E10 | Camada de IA | `ai-studio/*`, runtime Mastra, memória/RAG, `admin/sql-catalog/*`, evals, BQML, `chat`, `firecrawl` |

**Raia transversal — Operar & Observar** (não pertence ao ciclo de vida do cliente, mas ao "terminar o produto"): `admin/orchestrator-metrics`, `admin/eval-runs`, `admin/judge-drift` + páginas `admin-agent-quality`/`admin-orchestrator-analytics`; jobs cron (`scripts/cron/revalidate-catalog.ts`, `eviction-cron.ts`); scripts de migração/hotfix (`patch-*`, `hotfix-*`, `migrate-*`); e **`/api/benchmark`** (gateado só por `verifyAuthToken`, sem scoping de `clientId` — `benchmark/route.ts:7,22`; porém o payload é agregado **anonimizado por design** — `"fonte: 'Agregado anonimizado de carteiras Liquid'"`, `benchmark/route.ts:35` — logo a severidade depende da granularidade do agregado e da intenção de produto: **hipótese L2 a resolver no pass adversarial**, não "alta" a priori).

### Lentes (perguntas passadas sobre cada estágio)

- **L1 · CRUD** — existe Create/Read/Update/Delete? Validação (zod)? Idempotência e guarda anti-sobrescrita? Tratamento de erro? A criação via Admin UI produz o **mesmo shape** que via seed?
- **L2 · Permissões/multi-tenancy** — fail-closed? isolamento de tenant em **cada** rota? a rota é concedível pela Admin UI? bypasses contidos/escopados?
- **L3 · Agêntico/harness** — a config vira runtime com fidelidade? gating de tools? schema ↔ runtime consistentes? memória/RAG isolada por tenant? evals/drift observáveis?
- **L4 · Onboarding config** — cliente novo sobe só com seed + Admin UI? o que exige editar código? qual a ordem/dependências? há runbook?
- **L5 · Observabilidade/erros/telemetria** — o que acontece na falha e isso é observável? (`telemetry/record-span`, `recall-metrics`, `bigquery/sql-generation-logger`, `BlockError.tsx`, `ai-agents/lib/format-error`, degradação do batch).
- **L6 · Correção numérica/reconciliação** — o número está certo? (JOIN ambíguo `resolve-metric.ts:562`, snapshot-pin, pivots WIDE; reconciliação vs Looker — `docs/bases/vila-rosa/VALIDACAO.md`).

### Dimensão transversal — Testes/regressão

Não é uma lente (não é propriedade do estágio), mas **padrão de evidência** (§6) e **gate de release** (§8): mapear o que a suíte cobre/não cobre, e estabilizar o baseline de flakiness conhecido (~6 falhas reais; sob carga infla p/ 15-35 — [[test-suite-mastra-flakiness]]).

## 5. Esquema de achado

Cada achado é registrado com os campos:

| Campo | Descrição |
|---|---|
| `id` | Identificador estável (nunca reusado, mesmo se refutado) |
| `origem` | `#N` da observação do Apêndice A (1-92) **ou** `novo` |
| `root-cause-id` | Cluster por causa-raiz (a mesma causa reaparece em vários sites/estágios) |
| `estágio-dono` | Estágio canônico (E1-E10 ou OPS) |
| `also-affects` | Outros estágios que o mesmo achado toca (evita duplicar) |
| `lente` | L1-L6 |
| `dimensão` | **Tag ortogonal:** `segurança` \| `correção-de-dado` \| `funcional` \| `config` \| `doc` \| `cosmético` |
| `tipo` | `bug` \| `lacuna` \| `inconsistência` \| `doc-drift` \| `config/dados` \| `código-morto` \| `cosmético` (regra de precedência abaixo) |
| `componente/rota` | Superfície runtime afetada (`/g`, `/api/metrics/batch`, …) |
| `estado` | `ativo` \| `latente` (latente = footgun real mas contornado hoje) |
| `severidade` | `alta` \| `média` \| `baixa`, **derivada de `dimensão` + `estado`** (não do `tipo`) |
| `evidência` | `arquivo:linha` (obrigatório) |
| `método-de-verificação` | `leitura-estática` \| `teste-repro` \| `build/lint` \| `diff-doc` |
| `verificação` | `confirmado` \| `refutado` \| `plausível` |
| `DoD` | Qual marco bloqueia (DoD-1 / DoD-2 / nenhum) |
| `ADR-ref` | ADR relacionada, se a correção tocar decisão canônica |
| `dependências` | `blocks` / `blocked-by` (outros ids) |
| `esforço` | Estimativa grosseira (P/M/G) |
| `proposta` | Direção de correção (não implementação) |

**Regra de precedência de `tipo`** (quando um achado se encaixa em vários, escolher o primeiro aplicável): `bug` → `inconsistência` → `config/dados` → `lacuna` → `doc-drift` → `código-morto` → `cosmético`. A `dimensão` é ortogonal e é o que governa a severidade.

**Derivação de severidade:**
- `dimensão ∈ {segurança, correção-de-dado}` e `estado = ativo` → **alta**.
- `funcional`/`config` + `ativo` que **bloqueia um DoD** (funcionalidade indisponível para o cliente externo — mesmo critério de "alta" do Apêndice A) → **alta**. *(Sem esta regra, o próprio P0 — `/g` inconcedível — derivaria "média", o que contradiz sua posição no backlog.)*
- `config` cuja leitura errada afeta compliance (thresholds de covenant, mapas de status) → tratar como `correção-de-dado`.
- As dimensões acima em `latente`, ou `funcional`/`config` sem bloqueio de DoD → **média**.
- `doc`/`cosmético`/`código-morto` → **baixa**.

Ajuste manual permitido, mas justificado.

## 6. Método de verificação (o harness da própria revisão)

1. **As 92 observações entram como HIPÓTESES**, não verdades — cada uma é reconferida contra o código atual da branch.
2. **Verificar do código primeiro:** o auditor apura `severidade-código` independente e só então reconcilia com a `Sev` do Apêndice A (que é "atribuição da consolidação, não do código" — doc:4722). Deltas são marcados. Isso evita viés de ancoragem.
3. **Checklist positivo contra falsos-negativos** (o frame das 92 é estruturalmente cego a defeitos não listados). Por estágio, varrer independentemente: todo literal de projeto GCP hard-coded; todo branch `NODE_ENV`; todo fail-open/`return true` em caminho de permissão; todo `@deprecated` ainda importado; todo tipo de campo divergente seed vs contract. Marcar `origem: novo`; medir a razão `novo:hipótese` como sinal de cobertura.
4. **Agentes paralelos por estágio** (read-only, ver §7) verificam + estendem; cada um recebe as observações do seu estágio, as lentes, o esquema de achado e o checklist positivo.
5. **Verificação adversarial** (segundo agente tenta refutar; default = refutar se incerto) para todo achado que for **`severidade=alta` OU `dimensão ∈ {segurança, correção-de-dado}` OU mapeia a um DoD**. Só sobrevive o que tem evidência sólida.
6. **Refutado não é descartado:** mantém `id` estável, `verificação: refutado` + evidência, e é reclassificado para `tipo: doc-drift` (a doc estava errada) → vira entregável de correção de documentação.
7. **Consolidação:** dedup por `root-cause-id`, reconciliação de severidade, mapeamento para DoD, e sequenciamento (§8).

**Padrão de evidência por tipo:**

| Tipo | Evidência mínima |
|---|---|
| bug funcional | teste vermelho (`vitest run <arquivo>`) **ou** trace de call-path `arq:linha → arq:linha` do branch errado + input disparador |
| segurança/isolamento | cenário de ameaça + linha fail-open + prova de que é o único gate (default-refutar) |
| lacuna | grep positivo (existe noutro lugar) + negativo (ausente aqui) |
| inconsistência | os dois sites lado a lado + alcançáveis pelo mesmo input |
| doc-drift | diff literal (claim da doc vs código) + grep=0 do referente |
| config/dados | declarado vs físico (tipo seed vs contract; literal vs DataSource) |
| código-morto | grep de consumidores vazio (ou só testes) |
| cosmético | string literal + onde renderiza; sem repro |

## 7. Salvaguardas operacionais (READ-ONLY — obrigatórias no prompt de cada agente de auditoria)

A suíte é segura por construção (mocka BigQuery — `e2e-hierarchy.smoke.test.ts:49`; stuba `server-only`; happy-dom — `vitest.config.ts:14,17-20`). Mas há superfície **perigosa** que muta produção ou gasta crédito (memória: seeds já rodaram em produção — [[vila-rosa-onboarding-status]], [[docker-local-sa-key]]).

**Proibido a todo agente de auditoria:**
- Qualquer `Edit`/`Write`/commit; qualquer git mutante, incluindo `git checkout`/`git stash` (a working tree é compartilhada entre agentes paralelos).
- Rodar `seed:*` / `scripts/*seed*.mjs`, `bq:*`, `rag:*`, `eval:*`, `cron:*`, `migrate:*`, `detect:drift`, `measure:*`, `patch-*`, `hotfix-*`.
- Inicializar cliente real BigQuery/Firestore/Vertex; `pnpm dev` (bypass de dev + chamadas reais); Playwright contra server vivo; `WebFetch`/rede. **SQL se confere estático, não se roda.**

**Permitido para evidência:** `vitest run <arquivo-específico>` (nunca `vitest run` sem filtro — pega smokes), `pnpm lint`, `pnpm build`. Nada que escreva arquivos (`--coverage`, `-u`, `--ui`). Se um comando puder escrever, usar worktree isolada read-only.

## 8. Workstreams, sequenciamento e critérios de aceite

Backlog agrupado por causa e ordenado pelo que **destrava** cada marco.

| WS | Foco | DoD | Itens-âncora (a re-verificar) |
|---|---|---|---|
| **WS-1** | Permissões & multi-tenancy | DoD-1 | **P0:** `/g` concedível na Admin UI (`ALL_ROUTES`) + alinhar route-match cliente↔servidor. Também: embedded admin incondicional (`useUserPermissions.tsx:45`, `ProtectedRoute.tsx:61`); print-token escopado; fail-closed de conta órfã; **`/api/benchmark` cross-tenant** (`benchmark/route.ts:7,22`) |
| **WS-2** | CRUD & onboarding | DoD-1 | Formato legado vs novo de cliente; `createdAt` zerado por `merge:false`; paridade seed↔Admin UI; provisionamento de credencial/convite |
| **WS-3** | Templates & galeria | DoD-1 (uso) | `productRefs ['play']` órfão (10 templates invisíveis — `visao-geral.template.mjs:17`, sem alias `play→liquid-play`) |
| **WS-4** | Camada de IA | DoD-2 | `ModelTier` mismatch (`agent.ts:5` vs `types.ts:51`); bug do stream do chat; gating de tools; TTL/PII da memória; approve do sql-catalog com `clientId` **obrigatório** (severidade baixa — guard já existe, `approve/route.ts:57-62` — mas é critério DoD-2 #4, esforço P) |
| **WS-0** | Dados & compliance (**gate**) | release | Thresholds/alertThresholds "A CONFIRMAR" (`covenants-v2-visao-executiva:100,105`; `evolucao-obra:63-65`; `inadimplencia:49-54`); `RATING_STATUS_MAP` ilustrativo (`mapa-vendas:24-28`) |
| **WS-Testes** | Regressão (**gate**) | release | Estabilizar baseline de flakiness; casos de regressão da lista do §3 |
| **WS-Onboarding** | Runbook & paridade | DoD-1 | Runbook de onboarding ponta-a-ponta; teste round-trip seed↔Admin UI |
| **WS-5** | Hardening & doc-drift | — | Gauge sem `*100` (já contornado nos templates Vila Rosa → latente); admin global vs por-tenant (defense-in-depth); cosméticos; código-morto; correções de doc (incl. achados `refutado` → doc-drift) |

**Grafo de dependências / ordem:**

```
WS-1 (P0 = /g concedível + route-match)
  → WS-2 (parte de rotas depende de WS-1; createdAt/formato são independentes)
     → WS-3 ‖ WS-4        (WS-3 depende de WS-1+WS-2; WS-4 é independente, serve DoD-2)
        → WS-0 (gate de dados) ‖ WS-Testes (gate) ‖ WS-Onboarding
           → WS-5 (hardening/cosmético, por último)
```

**Critérios de aceite objetivos (amarrados ao DoD):**
- **WS-1:** usuário não-admin com `clientAccess=[vila-rosa]` e `/g` concedido carrega `/g/{groupId}/r/{reportId}` e **todas** as `covenants.*` retornam 200 (client E server), sem 403.
- **WS-2:** cliente criado pela Admin UI produz doc **idêntico** ao do seed (campos + `createdAt` preservado) — round-trip Admin UI == seed.
- **WS-3:** `vila-rosa` (productBindings) vê na galeria só templates dos produtos assinados e **zero** templates órfãos `['play']`.
- **WS-4:** qualquer `model` do enum da Admin UI resolve para tier runtime válido (sem `'slow'` órfão); chat renderiza no `useChat` sem chunk cru.
- **WS-0:** nenhum `threshold`/`warnThreshold`/`alertThreshold` de gauge marcado "A CONFIRMAR" em produção.

**Questão aberta a resolver na auditoria (pode mudar prioridade):** `/api/filter-options` é productBindings-blind e hard-coded na tabela `contratos` (`filter-options/route.ts:58`). **Não** afeta `/g` (que usa `metrics/filter-values`, product-aware — `PageFilterBar.tsx:5`), mas quebra os filtros das **páginas padrão** para clientes productBindings-only. **Se** o caminho do cliente externo Vila Rosa tocar páginas padrão, isto sobe de "dívida" para **blocker de DoD-1** (WS-1/WS-2). Confirmar a dependência real.

**Dívida técnica anotada (fora-de-escopo desta release):** `resolveDerivedMetric` monta JOIN sem qualificar alias (`resolve-metric.ts:513-633`) → `derived` inutilizável para colunas homônimas; contornado no Vila Rosa via `kind:'sql'`, mas bloqueia métricas `derived` futuras.

## 9. Entregáveis e fluxo

1. **Este spec** — commitado em `docs/superpowers/specs/`.
2. **Registro de achados verificados** — Markdown em `docs/`, um achado por linha com o esquema do §5 (`novo:hipótese` reportado).
3. **Backlog de remediação priorizado** — os workstreams do §8 com achados alocados, critérios de aceite e grafo de dependências.
4. **`writing-plans`** — transforma o backlog em plano de implementação executável (fase seguinte, fora deste spec).

Opcional (a pedido): um HTML irmão da `documentacao-produto.html` com o registro + backlog.

## 10. Riscos e questões abertas

- **Falsos-positivos** herdados do Apêndice A: mitigados por verificação-do-código-primeiro + adversarial (§6).
- **Falsos-negativos** (defeitos não listados): mitigados pelo checklist positivo (§6.3); risco residual assumido.
- **Segurança operacional:** nunca commitar `secrets/`, `.env*`, `docker-compose.yml`, `.dockerignore`, `.gitignore` ou outras mudanças não relacionadas da working tree; `git add` apenas arquivos-alvo desta tarefa; credenciais só via env apontando para `C:/Users/gsoar/.gcloud/*.json`. Nunca commitar os PNGs de `docs/bases/vila-rosa` (só `.md`).
- **Questão aberta 1:** dependência de `/api/filter-options` no caminho do Vila Rosa (§8).
- **Questão aberta 2:** quais itens de DoD-2 (versionamento/custo/telemetria/prompt-injection) são critério de release vs fora-de-escopo — decidir ao consolidar.

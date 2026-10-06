# Spec — Core agêntico de aplicação (guarda-chuva)

- **Status:** aprovado (revisão 2 em 2026-09-29: boilerplate em `app/`, framework intocado)
- **Data:** 2026-09-29
- **Origem:** `docs/prompts/2026-09-29-agentic-app-core-harness.md`
- **Escopo:** arquitetura macro do core e fronteiras entre subprojetos. Cada
  subprojeto (SP0–SP5) ganha spec detalhada e plano próprios.
- **SSOT:** `.contexts/` prevalece e é **somente leitura**: nem `.contexts/` nem
  `.claude/` são editados por este trabalho. O boilerplate mora em `app/` e as
  decisões dele ficam nesta spec (e em `app/docs/` quando o código existir).

---

## 1. Propósito e critério de sucesso

Um core agêntico **genérico, sem domínio de negócio**, a partir do qual qualquer
aplicação agêntica nasce, clonando o repositório inteiro ou só o harness
(`.contexts/` + `.claude/`).

**Sucesso (v1):** com `pnpm install && pnpm dev && pnpm seed:local`, 100% local,
um dev consegue:

1. logar, escolher organização e projeto no menu lateral e editar o perfil
   (idioma, fuso, moeda, tema);
2. conversar com um agente supervisor que delega a subagentes, com streaming,
   componentes interativos, aprovação de ação, histórico, upload e voz;
3. consultar a knowledge base e o catálogo de dados; o agente renderiza um
   formulário a partir de um contrato e executa a ação com aprovação e audit;
4. rodar um workflow com aprovação humana e um workflow agendado;
5. ver no `/admin` traces, custos por tenant e resultado de evals;
6. abrir a mesma área do usuário no app desktop (Tauri).

E `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm contracts:check` verdes.

## 2. Decisões

| # | Decisão |
|---|---|
| D1 | O boilerplate é um **monorepo** pnpm + Turborepo na pasta **`app/`** deste repositório. `.contexts/` e `.claude/` (framework) ficam na raiz, intocados. |
| D2 | **Web (Next 16) + Tauri 2** (desktop e mobile) desde a v1, compartilhando a camada FSD. `/admin` só no web. |
| D3 | **Firestore**: dados da aplicação e realtime. **Postgres 18 + pgvector**: storage do Mastra (schema `mastra`) e knowledge base (schema `ai`). **Cloud Storage**: uploads. **BigQuery**: analytics, custos e histórico de evals. |
| D4 | **Tenancy**: Organização (tenant) → Projeto → árvore opcional de Unidades tipadas pela aplicação. Papéis por nó, herdados para baixo. Usuário em várias organizações. |
| D5 | **Topologia**: API `/v1` em Route Handlers do Next (web e desktop). Functions Gen 2 só para eventos, jobs e webhooks. Servidor Mastra em host long-lived (Cloud Run). |
| D6 | **Extensão por módulo**: `defineModule()`. O core nunca importa um módulo específico. |
| D7 | **Contratos como catálogo de dados** legível por humanos, compilador e IA (seção 5). |
| D8 | Escrita direta do cliente no Firestore **negada**. Toda mutação passa por `/v1`. |
| D9 | RBAC **sem deny explícito** na v1. |
| D10 | **Desenvolvimento local** com Firebase Emulator Suite + Postgres/pgvector em Docker. |
| D11 | Firebase Data Connect **fora** da v1 (o emulator usa PGlite, o que quebra a paridade de engine). |
| D12 | Multi-agente via **supervisor/subagents** do Mastra. `.network()` (deprecated) não é usado. |

## 3. Layout e fronteiras

```
.contexts/ .claude/          framework DDC (somente leitura)
app/                         boilerplate (raiz do workspace pnpm)
  apps/
    web/        Next 16: só roteamento — (app)/, admin/, v1/ (re-exporta driving adapters)
    desktop/    Tauri 2 + Vite + React 19: só roteamento + plugins nativos
    mastra/     servidor Mastra (src/mastra/index.ts) → Docker → Cloud Run
    functions/  Functions Gen 2 (nodejs24, ADR 0004 E1)
  packages/
    client/     FSD: src/{views,widgets,features,entities,shared}; shared/ui = Atomic
    contracts/  src/contracts/<context>/, events/, primitives/ + registry + catálogo
    services/   src/services/<context>/ hexagonal
    agents/     agents, tools, skills, workflows, processors, scorers
    i18n/  config/
  modules/      vazio no core; `modules/example` só para provar o contrato
```

A estrutura interna de cada pacote é a da doutrina (`architecture/fsd.md`,
`feature-based.md`, `atomic-design.md`, `contracts/schemas.md` §2). O monorepo só
distribui o `src/` único em pacotes dentro de `app/`. Pacotes chamam `@core/<pkg>`,
`private: true`; uma aplicação derivada pode renomear o escopo. Uma versão por
dependência compartilhada via `catalog:` do `pnpm-workspace.yaml`. Fronteiras
enforced por `eslint-plugin-boundaries` (regra `boundaries/dependencies`).

**Fronteiras de import (lint):**
- `apps` só compõem.
- `client` não importa `services` nem `agents`.
- `services` e `agents` não importam `client`.
- `agents` usa `services` apenas por use cases.
- `contracts` não depende de ninguém.

**Contextos de backend do core:** identity, tenancy, access, profile,
conversations, knowledge, connectors, audit, usage, notifications.

## 4. Identidade, tenancy e acesso

- **Principals:**
  - `user` (Firebase Auth / Identity Platform, MFA opcional);
  - `device` (ativado por código, token com escopo de nó);
  - `service` (API key com escopo, para integrações e clientes MCP);
  - `platform staff` (único acesso a `/admin`).
- **Firestore:** coleções top-level com `tenantId` (`contracts/firebase-firestore.md` §7):
  - `organizations`, `projects`, `units`, `users`;
  - `memberships`, `roles`, `invitations`;
  - `api-keys`, `devices`, `audit-logs`;
  - `access/{tenantId}_{uid}`: projeção de grants que as Rules leem.
- **Claims** são só projeção: org ativa, papel de staff e versão de acesso. Trocar
  de organização passa por `/v1` e força refresh do token.
- **Permissões:**
  - Formato `<module>.<resource>.<action>`, declaradas nos manifestos.
  - Papéis de sistema + papéis custom por tenant.
  - `authorize()` em `services/access` é a **única** função de decisão (fail-closed), usada por `/v1`, Functions e tools dos agentes.
  - Permissões `requiresApproval` usam um fluxo genérico de aprovação.
  - Agentes têm teto de permissões: o efetivo é a interseção entre o que o usuário e o agente podem.
- **Doutrina:** novo `rules/tenancy.md`, conforme exigido por `contracts/firebase-firestore.md` §7.

## 5. Contratos e catálogo de dados

**Fonte única por tipo:**

| Contrato | Fonte |
|---|---|
| Entidade/documento, comando/query, settings, componente de UI gerativa | Zod em `packages/contracts` |
| Evento | Zod, com o envelope de `contracts/events.md` |
| Tabela Postgres | Drizzle → Zod derivado + teste de paridade com o contrato |
| Estado de UI local | Zod no `model/` do slice |

**Metadados** (registry do Zod 4, via `.meta()`), aplicados a todo schema exportado e a todo campo:
- `id` estável e `description` obrigatório;
- `examples`, `relations`;
- `pii` (`none | personal | sensitive`);
- `tenancyScope`;
- `ui` (`widget`, `labelKey`, `order`, `group`, visibilidade por permissão).

**Artefatos** gerados por `pnpm contracts:catalog` e validados no CI por `contracts:check`:
- `docs/openapi/v1.yaml`;
- JSON Schema;
- `docs/catalog/**`;
- views SQL semânticas.

**Uso pela IA:**
1. **Conhecer a estrutura:** o catálogo é indexado na knowledge base e exposto pelas tools `listEntities`/`describeEntity` e como resources do MCP. Campos `sensitive` ficam fora.
2. **Formulários:** a tool `renderForm` faz o chat renderizar o `SchemaForm` a partir do mesmo schema.
3. **Consulta:** SQL somente leitura sobre as views semânticas, com allowlist, `LIMIT`, RLS e timeout.
4. **Ação:** comandos viram tools com o mesmo `inputSchema`, passam por `authorize()` e exigem aprovação humana.

**Doutrina:** novo `contracts/data-catalog.md`.

## 6. App shell e UI

- **Base:**
  - shadcn `new-york` com base Radix, instalado pela CLI (componentes e blocks);
  - Tailwind 4;
  - tokens de `.design-system/DESIGN.md`;
  - `product/design-system.md` passa a referenciar esse arquivo.
- **Atomic em `shared/ui`:** primitivos em `atoms/`. Composições neutras como `SchemaForm`, `DataTable` e `AppSidebar`, e layouts de `templates/`.
- **Shell:**
  - sidebar com seletor de organização e projeto;
  - navegação vinda dos manifestos e filtrada por permissão;
  - command palette;
  - perfil (dados, segurança/MFA, sessões, idioma, fuso, moeda, tema, notificações);
  - `/settings` do tenant (membros, convites, papéis, unidades, conectores, agentes, uso).
- **Roteamento:** um port em `shared/lib/router`, com adapter Next e adapter TanStack Router (Tauri).
- **i18n** (`rules/internationalization.md`): ICU, com `pt-BR` como fonte e `en-US`/`es-419` preparados. `next-intl` no web e `use-intl` no desktop (ADR).
- **Dinheiro:** `{ amountMinor, currency }`, formatado só com `Intl`. A moeda default é resolvida na ordem nó → projeto → organização.
- **Fuso:**
  - persistir em UTC;
  - exibir no fuso resolvido na ordem usuário → nó → projeto → organização → navegador;
  - regras de calendário são avaliadas no fuso do nó.

## 7. Runtime agêntico (Mastra)

Pins em `MEMORY.md`. A última estável é medida antes de instalar (ADR 0004).

- **Agentes:**
  - supervisor + subagentes;
  - `instructions` versionadas;
  - cap de steps obrigatório;
  - `RequestContext` tipado (tenant, projeto, nó, usuário, locale, fuso, moeda, permissões, tela ativa).
- **Skills:** Agent Skills (`SKILL.md`), tanto do core quanto dos módulos.
- **Tools:**
  - registry com Zod estrito;
  - leitura separada de mutação;
  - mutação com aprovação;
  - tools geradas dos contratos.
- **Memória:**
  - thread com `lastMessages` limitado;
  - working memory;
  - semantic recall;
  - Observational Memory, que só entra se o eval comparativo justificar;
  - `resourceId = tenantId:uid`.
- **Knowledge base:**
  - `@mastra/rag` + `PgVector`;
  - ingestão por workflow a partir de upload, URL (Firecrawl), catálogo e módulos;
  - namespace por tenant/projeto;
  - citações obrigatórias.
- **Conectores:**
  - banco de dados (somente leitura, via camada semântica);
  - APIs HTTP (OpenAPI → tools, segredos no Secret Manager);
  - MCP client (`@mastra/mcp`, com `allowedHosts`, OAuth e aprovação).
  - O core também expõe um **MCP server** próprio.
- **Tools externas:** Firecrawl e browser, com opt-in por tenant.
- **Guardrails** (processors):
  - `PromptInjectionDetector`, `PIIDetector`, `ModerationProcessor`, `SystemPromptScrubber`;
  - `TokenCostControl`, com orçamento por tenant.
- **Durabilidade:**
  - durable agents e PubSub (Google Cloud PubSub fora de `local`);
  - scheduler de workflows no host long-lived.
- **Auth:** `MastraAuthProvider` próprio (`@mastra/core/server`) em `packages/agents`: `verifyIdToken` do firebase-admin 14.5.0, `authorizeUser` checando a membership em `services/access`, `mapUserToResourceId` = `tenantId:uid`. `@mastra/auth-firebase` não é adotado (usa a API legada removida no firebase-admin 14; §16).

## 8. Chat

- **Base:**
  - AI Elements + `useChat` (AI SDK 7);
  - transporte Mastra (`@mastra/ai-sdk`, `version: 'v7'`);
  - o mesmo widget no web e no desktop.
- **Exibição:**
  - delegações entre agentes;
  - passos de workflow;
  - tool calls e raciocínio, colapsáveis.
- **Controle do stream:**
  - streaming com botão de parar e retomada;
  - estados "respondendo", "sem conexão", "sem certeza" e `tripwire`.
- **Componentes interativos:**
  - UI gerativa por registry tipado (form, tabela, gráfico, aprovação com antes/depois, seletor);
  - aprovação de tools inline, com audit.
- **Histórico:** listar, buscar, renomear, fixar, arquivar, apagar e resumir. Os metadados ficam no Firestore e as mensagens no storage do Mastra.
- **Mídia:**
  - upload de arquivo, imagem e vídeo para o Storage (Signed URL, validação, rules por tenant), anexado como part multimodal ou ingerido na knowledge base;
  - voz com push-to-talk (STT + TTS) e modo realtime opcional.

## 9. Workflows e `/admin`

- **Workflows:**
  - Mastra, com Zod, retries, branch, parallel e loops;
  - `suspend/resume` para aprovação humana;
  - `schedule` com cron e fuso;
  - inbox de aprovações;
  - progresso por streaming.
- **Workflows do core:** ingestão de KB, reindexação do catálogo, aprovação genérica e relatório de uso.
- **`/admin` (staff):**
  - organizações e planos;
  - usuários e impersonation auditada;
  - agentes e habilitação por tenant;
  - prompts versionados (Studio Editor ou store com rollback);
  - conectores;
  - datasets, experiments e evals;
  - traces e logs;
  - custos com tetos e alertas;
  - flags (Remote Config).
- **`/settings`:** o mesmo conjunto, escopado ao tenant.

## 10. Evals e observabilidade

- **Evals:**
  - scorers via `createScorer`, datasets e experiments;
  - gates com banda de tolerância no CI;
  - eval set versionado por agente;
  - histórico no BigQuery.
  - `@mastra/evals` segue fora enquanto a exceção E4 do ADR 0004 valer. Nesse caso, entram scorers próprios.
- **Tracing:**
  - `@mastra/observability` com `SensitiveDataFilter`;
  - OTLP para Cloud Trace;
  - spans `gen_ai.*`;
  - `traceId` propagado entre web, `/v1`, Mastra e Functions.
- **Logs e métricas:**
  - logs JSON (`rules/observability.md`);
  - métricas RED;
  - tokens e custo por tenant;
  - TTFT, taxa de tripwire e taxa de aprovação.
- **Audit log** separado do log técnico.

## 11. Ambiente local

Segue `processes/environments.md` §9:
- **Emulator Suite:** Auth, Firestore, Functions, Storage, Pub/Sub e Eventarc.
- **Postgres:** `pgvector/pgvector:0.8.6-pg18` no Docker.
- **Processos de desenvolvimento:** `next dev` (3000), `mastra dev` com Studio (4111, validando tokens do Auth Emulator) e `tauri dev`.
- **Comandos:**
  - `pnpm dev` sobe tudo;
  - `pnpm seed:local` cria usuários, organização, projeto, papéis e KB de exemplo.
- **IA e testes:**
  - provider real por padrão;
  - `AI_MODE=fake`, flag explícita para CI/testes/offline;
  - testes de integração via `firebase emulators:exec` com Postgres em container.

## 12. Doutrina: lacunas identificadas (recomendação, sem editar o framework)

O framework não é alterado. O boilerplate segue `.contexts/` como está e registra
em `app/docs/decisions/` o que a doutrina não cobre. Lacunas observadas, para o
dono do framework avaliar quando quiser:

- Não há contexto para monorepo com pacotes (`processes/git.md` §20 deixa "a definir").
- Não há stack para Tauri 2, Vite, TanStack Router, Cloud Run, Firebase App Hosting/Storage/App Check/Remote Config/FCM, AI Elements, Firecrawl.
- `contracts/firebase-firestore.md` §7 pede `rules/tenancy.md` ao adotar tenancy por conjunto; o boilerplate documenta o modelo em `app/docs/decisions/`.
- Não há contrato de catálogo de dados legível por IA nem contrato de agentes/módulos.
- `stacks/ai/mastra-sdk.md` está atrás das docs atuais (supervisor, RequestContext, Skills, Observational Memory, processors, scorers; deployer Vercel preferido; não diz que Firestore não é storage).
- `MEMORY.md` pina Next 16.3.6 e `ai@7.0.120`; em 2026-09-29 o `latest` é 16.3.7 e 7.0.122 (política ADR 0004: última estável).
- ADR 0004 não tem exceção para o runtime do App Hosting (`nodejs24`); o `apps/web` do boilerplate declara `engines >=24 <27` (decisão local, §14).

## 13. Subprojetos

| SP | Entrega | Gate |
|---|---|---|
| SP0 Fundação | spike do App Hosting (§16.3); monorepo em `app/`; config; emuladores + compose; `env` Zod; `packages/contracts` com registry, primitivos e `contracts:catalog/check`; spikes (§14) | `pnpm dev` sobe vazio; lint, typecheck e test verdes; spikes reportados |
| SP1 Identidade, tenancy, RBAC | §4 | testes de Rules e de `authorize` (herança, multi-org, fail-closed, device, staff) |
| SP2 App shell e UI | §6, web + desktop, `modules/example` | e2e: login → troca org/projeto → perfil; axe limpo; Tauri abre a área do usuário |
| SP3 Runtime agêntico | §7 | integração com `AI_MODE=fake`; eval set mínimo; isolamento de memória por tenant |
| SP4 Chat | §8 | e2e: streaming, delegação, `renderForm` → submit, aprovação com audit, upload, voz, histórico |
| SP5 Workflows e `/admin` | §9, §10 | workflow HITL e agendado; `/admin` com traces, custos e evals; critério §1 completo |

## 14. Riscos e pontos a confirmar (spikes do SP0)

1. **App Hosting em produção com Next 16.3** (suporte oficial não confirmado; issue `firebase/apphosting-adapters#690`) e o emulator local. Decisão humana 2026-09-29: manter App Hosting provisoriamente (Node 24 em prod; `apps/web` engines `>=24 <27` + `@types/node@24`); spike é a primeira task do SP0 com os critérios de saída de §16.3. Falhou → Next standalone no Cloud Run (`node:26`). Local: `next dev`.
2. Versões estáveis e compatibilidade (TS 7, Node 26, React 19.3, Zod 4.6) de:
   - Tauri 2, Vite, TanStack Router;
   - `next-intl`, AI Elements;
   - `@mastra/ai-sdk`, `@mastra/voice-*`, `@mastra/google-cloud-pubsub`.
3. Peer atual de `@mastra/evals` com Vitest 5 (E4).
4. `MastraAuthProvider` próprio validando tokens do Auth Emulator e membership (§16.2).
5. Push (FCM) e App Check no Tauri, principalmente no Android.
6. Observational Memory contra semantic recall (custo e qualidade).

## 15. Fora de escopo da v1

- Qualquer domínio de negócio.
- Offline-first completo no desktop: o core define só o port e o contrato de outbox.
- Channels (WhatsApp/Slack): fica só o port.
- Data Connect.
- Deny explícito no RBAC.
- Sandboxes de código, salvo caso concreto.

## 16. Decisões e fatos verificados nas revisões (2026-09-29)

Registro das decisões humanas e dos fatos checados em fonte primária durante a
revisão do desenho. Vale como decisão do boilerplate; o framework não é alterado.

### 16.1 Versões medidas (`npm view`, 2026-09-29)

Next 16.3.7, `ai` 7.0.122, `@ai-sdk/react` 4.0.125, pnpm 12.6.0, turbo 2.11.5,
`@tauri-apps/cli`/`api` 2.12.0 (crate `tauri` 2.12.0, MSRV 1.90), Rust estável
1.98.1 (pinado em `rust-toolchain.toml`), vite 8.3.1, `@tanstack/react-router`
1.170.40, `@tanstack/router-plugin` 1.168.41, `@vitejs/plugin-react` 6.1.1,
`@tailwindcss/vite` 4.3.3, `next-intl`/`use-intl` 4.14.8, firebase 12.19.0,
firebase-admin 14.5.0, firebase-tools 15.32.0, `@firebase/rules-unit-testing`
5.0.2, `@apphosting/adapter-nextjs` 14.0.21, `@google-cloud/cloud-sql-connector`
1.12.0, drizzle-orm 0.45.3, **`drizzle-zod` 0.8.3** (`drizzle-orm/zod` só existe
na linha 1.0 rc), `eslint-plugin-boundaries` 7.2.0, shadcn CLI 4.21.0, `@mastra/*`
conforme `MEMORY.md`. `@mastra/evals` 1.10.3 ainda exige `vitest <5` (E4 vale).

### 16.2 Identidade e acesso

- `@mastra/auth-firebase@1.1.2` **não é adotado**: depende de `firebase-admin ^13.7.0` e usa `admin.apps`/`admin.auth()`/`admin.credential`, removidos no firebase-admin 14 ("Remove Deprecated Legacy Namespace Support"). O Mastra usa um provider próprio que estende `MastraAuthProvider` (`@mastra/core/server`).
- Fonte de verdade: `memberships`, `roles`, `devices`, `api-keys`, `platform-staff/{uid}`. `authorize()` lê a fonte, nunca claims. Claims (`tenantId`, `platformRole`, `accessVersion`) são projeção, reescritos por read-modify-write. `access/{tenantId}_{uid}` é a projeção lida pelas Security Rules.
- Troca de organização: `PUT /v1/me/active-organization` → 204.
- **`/v1` aceita só `Authorization: Bearer`**, nunca cookie. O cookie de sessão do web (`HttpOnly`, `Secure`, `SameSite=Lax`, `verifySessionCookie(cookie, true)`) serve só a RSC e Server Actions, com a checagem de origem do Next. Não há `POST /v1/auth/refresh` (o SDK do Firebase renova o token).
- `verifyIdToken(token, true)` (checkRevoked) em mutações do `/v1`, no Mastra e no `/admin`. Leituras confiam em `authorize()` lendo a fonte.
- API key: prefixada, guardada como hash, comparada com `timingSafeEqual`, `expiresAt` obrigatório. Permissão efetiva = escopo da chave ∩ grants **atuais** do criador; removida a membership do criador, as chaves dele são revogadas.
- Dispositivo: código de ativação com ≥ 40 bits de entropia, uso único, TTL 10 min, bloqueio após 5 falhas, rate limit por IP; recebe custom token e um grant `device` em `memberships`.
- Rate limit (rule `security`): ativação de dispositivo, falhas de API key (429 antes de checar hash), troca de organização por `uid`.
- Staff: MFA obrigatório (`firebase.sign_in_second_factor`); impersonation só leitura, ≤ 60 min, auditada. Aprovação `requiresApproval` é de quatro olhos (quem pede não aprova).
- Desktop: ID token em memória; refresh token no cofre seguro do SO via port `shared/lib/secure-store` (adapter é spike).
- Uploads: `POST /v1/files` → 201 + `Location`, com Signed URL V4 (15 min, `Content-Type` fixo, `x-goog-content-length-range`, path gerado no servidor); Storage Rules negam todo acesso direto do cliente; checagem de magic bytes no `onObjectFinalized`.
- Audit: `audit-logs` (com `tenantId`) e `platform-audit-logs` (eventos sem tenant, com `targetTenantId`); append-only por convenção, cópia imutável no export BigQuery; sem TTL até `compliance.md` ser preenchido.

### 16.3 Runtime e hospedagem

- Mastra no Cloud Run: `mastra build` gera `.mastra/output` autocontido; `MASTRA_HOST=0.0.0.0` é obrigatório (default `localhost`); `server.timeout` default 180 s corta stream longo; scheduler é `setInterval` que "claims due rows", então exige CPU sempre alocada (`--no-cpu-throttling`) e `min-instances ≥ 1`; Mastra privado, chamado pelo `/v1` com `X-Serverless-Authorization` (IAM) + `Authorization` (token do usuário); CORS do Mastra desligado; Studio só em `local`; um serviço Mastra na v1. Cloud SQL: 100 conexões por instância Cloud Run; path de socket ≤ 108 caracteres. Corepack não vem no Node 25+: instalar pnpm via npm no Dockerfile.
- App Hosting: suporta versões pares de Node espelhando o Cloud Run, onde `nodejs26` é Preview → GA mais novo é `nodejs24`. A tabela oficial de Next vai até 15.2.x; issue `firebase/apphosting-adapters#690` relata OOM com Next 16.3.6 (workaround `experimental.isrFlushToDisk: false`).
- **Critérios de saída do spike do App Hosting** (todos PASS): build com `@apphosting/adapter-nextjs` 14.0.21 em `nodejs24`; Cache Components + ISR funcionam; stream SSE por Route Handler ≥ 10 min sem corte; 2 h de carga de prerender sem OOM/restart; cold start p50/p95 medido. **Fallback:** Next standalone no Cloud Run (`node:26-alpine`), estáticos via rewrite do Firebase Hosting ou LB + Cloud CDN, cache handler compartilhado, `sharp` para musl, domínio próprio.
- Data Connect aparece nas docs como "Firebase SQL Connect"; o emulator roda PGlite.

### 16.4 Catálogo de dados

- Zod 4.6.5: `.meta()` clona e registra no `globalRegistry`; `.register()` registra a mesma instância; o registry não é enumerável, então `defineContract` mantém `listContracts()` próprio e detecta `id` duplicado cedo. `z.toJSONSchema` copia todo o meta: o `override` apaga as chaves cruas e grava `x-*`; contratos aninhados viram `$defs/$ref`.
- Metadado obrigatório: `id` (`<context>.<Name>`), `kind`, `description`, `examples` (≥ 1), `pii` (`none|personal|sensitive`, o de campo é o autoritativo), `tenancyScope`, `relations`; opcionais `ui`, `permission`, `deprecated`. Breaking change → `<context>.<Name>V2`.
- `catalog.ai.json` exclui `sensitive` e redige `personal` em exemplos. **`personal` pode ir ao modelo só dentro do tenant e com a permissão de leitura de quem pergunta**; `sensitive` nunca. Enviar `personal` a provedor externo de LLM exige aprovação de compliance quando `compliance.md` for preenchido.
- SQL da IA: só leitura sobre views semânticas. Postgres: schema `semantic`, views com direitos do dono (sem `security_invoker`), `security_barrier`, dono `semantic_owner` (`NOLOGIN`, sem `BYPASSRLS`), tabelas base com `FORCE ROW LEVEL SECURITY` por `app.tenant_id`/`app.node_ids` (setting ausente → zero linhas); role `semantic_reader` só com `USAGE` + `SELECT` nas views; transação `READ ONLY`; `LIMIT` 100 default, 1000 máx.; `statement_timeout` ≤ 5 s. **BigQuery na tool SQL: permitido, mas desligado (fail-closed) até o SP3** definir o isolamento (datasets `<context>_semantic` só com table functions parametrizadas, tenant injetado pelo servidor, AST rejeita literal de tenant vindo do modelo, teto de custo).
- Toda mutação por agente pede **confirmação do usuário**; permissão `requiresApproval` pede, além disso, a aprovação de outro principal.


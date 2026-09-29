# Spec — Core agêntico de aplicação (guarda-chuva)

- **Status:** draft para revisão
- **Data:** 2026-09-29
- **Origem:** `docs/prompts/2026-09-29-agentic-app-core-harness.md`
- **Escopo:** arquitetura macro do core e fronteiras entre subprojetos. Cada
  subprojeto (SP0–SP5) ganha spec detalhada e plano próprios.
- **SSOT:** `.contexts/` prevalece. Esta spec só registra decisões e mapeia para a
  doutrina; não a repete.

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
| D1 | Este repositório vira **monorepo** pnpm + Turborepo, com `.contexts/` e `.claude/` na raiz. |
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
.contexts/ .claude/          harness DDC
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
distribui o `src/` único em pacotes.

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
- **Auth:** `@mastra/auth-firebase`, com `authorizeUser` checando a membership.

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

## 12. Contextos de engenharia

**ADRs novos** (0006 em diante):
1. Monorepo e mapeamento `src/` → pacotes.
2. Tauri 2 + Vite + TanStack Router. Inclui linhas de exceção na 0004, porque esses itens estão fora do baseline.
3. Divisão de dados e Data Connect fora da v1.
4. Topologia de runtime.
5. Modelo de tenancy e acesso.
6. Contratos como catálogo de dados.
7. Supervisor/subagents.
8. Lib de i18n e cadeia de resolução de locale/moeda/fuso.

**Criar:**
- `rules/tenancy.md`
- `rules/ai-agents.md`: cap, aprovação, teto de permissões, orçamento, citação, eval antes de trocar modelo ou prompt
- `contracts/data-catalog.md`
- `contracts/agents.md`: agent/tool/skill/workflow/processor/scorer e `defineModule()`
- `architecture/monorepo.md`
- `stacks/desktop/tauri@2.md`
- `stacks/frontend/vite.md`
- `stacks/frontend/tanstack-router.md`
- `stacks/frontend/ai-elements.md`
- `stacks/backend/cloud-run.md`
- `stacks/backend/firebase-platform.md`: Auth/Identity Platform, App Hosting, Storage, App Check, Remote Config, FCM, Emulator Suite
- `stacks/ai/firecrawl.md`

**Atualizar:**
- `stacks/ai/mastra-sdk.md`:
  - supervisor, RequestContext, Skills, Observational Memory;
  - durable agents e PubSub, processors;
  - scorers, datasets e experiments;
  - auth-firebase, `@mastra/ai-sdk` v7, Studio e Editor, voice;
  - Firestore não suportado;
  - deploy Docker/Cloud Run no lugar do deployer Vercel.
- `stacks/ai/harness-engineering.md`: mapear as camadas para os pacotes.
- `MEMORY.md`, `stacks/VERSIONS.md` e `decisions/0004-...` (novas exceções, reavaliação da E4).
- `processes/environments.md` §9, `processes/git.md` §20 e `processes/deploy.md`.
- Notas de mapeamento em `architecture/fsd.md`, `architecture/feature-based.md`, `architecture/atomic-design.md` e `contracts/schemas.md`.
- `product/design-system.md`, apontando para `.design-system/`.
- `business/glossary.md`, com os termos do core: Organização, Projeto, Unidade, Membro, Papel, Permissão, Principal, Módulo, Agente, Tool, Skill, Conector, Thread, Knowledge base.
- `.claude/`: `CLAUDE.md`, skills e rules path-scoped novas (só apontando para `.contexts`) e gatilhos do `suggest-skills`.

**Remover:** nada. Menções a Data Connect e ao deployer Vercel do Mastra passam a
"não usado no core v1".

## 13. Subprojetos

| SP | Entrega | Gate |
|---|---|---|
| SP0 Fundação e doutrina | ADRs e contextos (§12); monorepo; config; emuladores + compose; `env` Zod; `packages/contracts` com registry, primitivos e `contracts:catalog/check`; spikes (§14) | `pnpm dev` sobe vazio; lint, typecheck e test verdes; spikes reportados |
| SP1 Identidade, tenancy, RBAC | §4 | testes de Rules e de `authorize` (herança, multi-org, fail-closed, device, staff) |
| SP2 App shell e UI | §6, web + desktop, `modules/example` | e2e: login → troca org/projeto → perfil; axe limpo; Tauri abre a área do usuário |
| SP3 Runtime agêntico | §7 | integração com `AI_MODE=fake`; eval set mínimo; isolamento de memória por tenant |
| SP4 Chat | §8 | e2e: streaming, delegação, `renderForm` → submit, aprovação com audit, upload, voz, histórico |
| SP5 Workflows e `/admin` | §9, §10 | workflow HITL e agendado; `/admin` com traces, custos e evals; critério §1 completo |

## 14. Riscos e pontos a confirmar (spikes do SP0)

1. **App Hosting em produção com Next 16.3** (suporte oficial não confirmado; issue `firebase/apphosting-adapters#690`) e o emulator local. Decisão humana 2026-09-29: manter App Hosting com E6 provisória (Node 24 em prod; `apps/web` engines `>=24 <27` + `@types/node@24`); spike é a primeira task do SP0b com critérios de saída da ADR 0009. Falhou → Next standalone no Cloud Run (`node:26`). Local: `next dev`.
2. Versões estáveis e compatibilidade (TS 7, Node 26, React 19.3, Zod 4.6) de:
   - Tauri 2, Vite, TanStack Router;
   - `next-intl`, AI Elements;
   - `@mastra/auth-firebase`, `@mastra/ai-sdk`, `@mastra/voice-*`, `@mastra/google-cloud-pubsub`.
3. Peer atual de `@mastra/evals` com Vitest 5 (E4).
4. `@mastra/auth-firebase` com tokens do Auth Emulator e `authorizeUser` custom.
5. Push (FCM) e App Check no Tauri, principalmente no Android.
6. Observational Memory contra semantic recall (custo e qualidade).

## 15. Fora de escopo da v1

- Qualquer domínio de negócio.
- Offline-first completo no desktop: o core define só o port e o contrato de outbox.
- Channels (WhatsApp/Slack): fica só o port.
- Data Connect.
- Deny explícito no RBAC.
- Sandboxes de código, salvo caso concreto.

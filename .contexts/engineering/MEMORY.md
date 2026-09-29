# Engineering Memory Index

Índice dos contextos de engenharia do DDC Framework. Referenciados via `@<path-sem-extensão>`.

**Última revisão de versões:** 2026-09-29.

> A matriz abaixo é o baseline do **framework**. O que estava no npm e nas
> release notes nesse dia, e o que ficou de fora, está em
> [`stacks/VERSIONS.md`](stacks/VERSIONS.md). Um projeto consumidor compara o
> `package.json` dele com essa tabela antes de tratar a linha como fato local.

**ADRs:** [0001](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) (harness, IDs, secrets), [0002](decisions/0002-baseline-2026-09-version-and-naming-alignment.md) (pins e nomes entre camadas), [0003](decisions/0003-cross-doc-convention-conflicts-resolved.md) (qual documento vence em cada conflito), [0004](decisions/0004-latest-stable-baseline-and-documented-exceptions.md) (política de última estável + exceções E1–E6), [0005](decisions/0005-firestore-document-ids-use-automatic-ids.md) (ID automático no Firestore; ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`), [0006](decisions/0006-monorepo-layout-and-package-boundaries.md) (monorepo pnpm + Turborepo; doutrina `src/` distribuída em pacotes) e [0007](decisions/0007-desktop-and-mobile-shell-with-tauri-2.md) (Tauri 2 desde a v1 para desktop e mobile; `/admin` só web), [0008](decisions/0008-data-stores-split-firestore-postgres-storage-bigquery.md) (Firestore para a aplicação, Postgres + pgvector para Mastra e knowledge base, Storage para arquivos, BigQuery analítico; Data Connect fora) e [0009](decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md) (`/v1` no Next em App Hosting, Functions só para eventos, jobs e webhooks, Mastra no Cloud Run), [0010](decisions/0010-tenancy-organization-project-units-and-rbac.md) (tenancy Organização → Projeto → Unidades, RBAC por nó sem deny, claims como projeção, upload por Signed URL, audit em `audit-logs`, auth do Mastra sem `@mastra/auth-firebase`) e [0011](decisions/0011-contracts-as-machine-readable-data-catalog.md) (contratos Zod + registry de metadados tipado geram OpenAPI, JSON Schema, catálogo e views semânticas; quatro usos pela IA com guard-rails).

## Matriz de compatibilidade (baseline de produção)

Stack pinado para ser **mutuamente compatível**. Não subir uma major isolada sem validar a linha inteira.

| Camada | Baseline | Notas de compatibilidade |
|---|---|---|
| Runtime | **Node.js 26.10.0** (Current; LTS em 2026-10-28) | ADR 0004. **Exceção E1:** deploy de Firebase Functions fica em `nodejs24` (o Google não tem `nodejs26`). **E6 (provisória):** `apps/web` roda `nodejs24` em prod no App Hosting; local e CI em 26 (ADR 0009). Node 24 entra em Maintenance em 2026-10-20. |
| Linguagem | **TypeScript 7.0.2** | `@typescript/typescript6@6.0.2` só para API programática (typescript-eslint, Volar, deployer). E2. |
| Lint | **ESLint 9.39.5** | E3: a última é 10.11.0, mas `eslint-plugin-react@7.37.5` só aceita `^9.7`. |
| Frontend app | **Next.js 16.3.7** + React **19.3.0** | 16.3 é Active LTS; 16.3.7 (release de segurança) é o `latest` medido em 2026-09-29. 16.4 é canary. `eslint-config-next` na mesma versão do `next`. |
| UI | **Tailwind 4.3.3** + **shadcn/ui** + **radix-ui 1.6.7** | React 19.3. |
| Validação | **Zod 4.6.5** | Schema-first; `z.infer` único source de tipos. Sem Zod 3 no bundle. |
| State client | **Zustand 5.0.15** | Só client components; server state fora. |
| Backend serverless | **firebase-functions@7.4.0** + **firebase-admin@14.5.0**, runtime **nodejs24** | Gen 2 only. `nodejs24` é o mais novo que o Google oferece (E1). |
| OLTP | **PostgreSQL 18.6** + Drizzle 0.45.3 + **drizzle-zod 0.8.3** | `uuidv7()` nativo. Schema de DB derivado com `drizzle-zod` (`drizzle-orm/zod` só na 1.0 rc; ADR 0011). 18.5 não foi publicado. Postgres 19 segue em beta. |
| Vectors | **pgvector 0.8.6** em Postgres 18 | Imagem `pgvector/pgvector:0.8.6-pg18`. HNSW default. |
| OLAP | **BigQuery** | Inalterado em major; ver stack. |
| Unit/integration | **Vitest 5.0.2** | Vite ^6.4, ^7 ou ^8 como peer (medido: 8.3.1). Pacotes `@vitest/*` na mesma versão. |
| E2E | **Playwright 1.63.0** | E5: `@playwright/experimental-ct-react` (1.62.1) não é adotado; componente roda no Vitest. |
| AI default | **`ai@7.0.122`** | Providers nas majors medidas em `VERSIONS.md` (não a mesma major do `ai`). `@mastra/core@1.71.0` aceita `LanguageModelV4`. E4: `@mastra/evals` fora (peer `vitest <5`). |
| Monorepo | **pnpm 12.6.0** + **turbo 2.11.5** | `packageManager: pnpm@12.6.0` na raiz; turbo orquestra build/lint/test por pacote. `engines.node` `>=26.0.0 <27` em todo pacote, exceto `apps/functions` (`>=24.0.0 <25`, E1) e `apps/web` (`>=24.0.0 <27` + `@types/node@24`, E6). |
| Desktop | **Tauri 2.12.0** (`@tauri-apps/cli` + `@tauri-apps/api`) + **Vite 8.3.1** + **TanStack Router 1.170.40** | CLI e API na mesma versão. Rust **1.98.1** pinado em `rust-toolchain.toml` (stable de 2026-09-01; MSRV do crate `tauri` 2.12.0: 1.90). ADR 0007. Vite 8.3.1 é o mesmo medido como peer do Vitest 5. TanStack Router: peer React `>=18 \|\| >=19` (React 19.3 ok), engines Node `>=20.19`. |
| i18n | **next-intl 4.14.8** / **use-intl 4.14.8** | `next-intl` no Next (peer `next ^16`); `use-intl` fora do Next (desktop). Mesma versão nos dois. |
| Firebase client | **firebase 12.19.0** + **firebase-tools 15.32.0** (dev) | `@firebase/rules-unit-testing@5.0.2` (peer `firebase ^12`) testa Security Rules no emulator. firebase-tools não vai para o runtime. |

**Invariantes de compatibilidade:**

1. App, CI, Docker e tooling rodam em **Node 26**; **só o deploy de Firebase Functions (E1) e o runtime de prod do `apps/web` no App Hosting (E6, provisória)** rodam em **Node 24** (ADR 0004); o `apps/web` roda Node 26 em local e CI. O Mastra no Cloud Run roda imagem `node:26-alpine`.
2. Typecheck com **TS 7** (`tsc --noEmit`); emit de app via bundler (Next/Turbopack).
3. Next 16 ↔ React 19 — peers obrigatórios; sem React 18.
4. Zod 4 em **todas** as boundaries (não misturar Zod 3 no mesmo bundle).
5. Postgres 18.6 + pgvector 0.8.6 no mesmo cluster; imagens de dev/CI `postgres:18` / `pgvector/pgvector:0.8.6-pg18`.
6. Firebase Functions Gen 2 em **nodejs24**, com `engines.node` `>=24.0.0 <25` no pacote de functions (E1); o `apps/web` declara `>=24.0.0 <27` com `@types/node@24` como guarda (E6 provisória: local e CI em 26, App Hosting escolhe `nodejs24`); **todo o resto do monorepo** (raiz, demais apps e packages) declara `>=26.0.0 <27`. Código de `packages/*` usado pelo web ou pelas functions roda em Node 24.
7. Vitest 5 e Playwright 1.63 compartilham o browser quando o browser mode está ativo. Component testing do Playwright não é usado (E5).
8. Monorepo em **pnpm 12.6.0** (workspaces) + **turbo 2.11.5**; uma única versão de cada dependência compartilhada no workspace (sem duas majors de React, Zod ou `ai`). **`firebase-admin` único (14.5.0):** `@mastra/auth-firebase@1.1.2` (que traria uma cópia `^13.7.0` e usa a API de namespace removida na 14) **não é adotado**; o servidor Mastra usa provider próprio `extends MastraAuthProvider` (ADR 0010). Sem exceção na 0004.
9. **Política (ADR 0004):** o baseline é sempre a última estável. Pré-release (canary, beta, rc) não é versão. Pacote atrás do `latest` só com linha de exceção no ADR 0004.

---

## Rules — 19 contextos imperativos

- [development](rules/development.md) — Regras gerais de código (TS strict, ESM, naming, control flow)
- [security](rules/security.md) — OWASP, secrets, auth, prompt injection, supply chain
- [performance](rules/performance.md) — Rendering, bundle, data fetching, LCP/INP/TTFB/TTFT
- [validation](rules/validation.md) — Parse-don't-validate, boundaries, branded types
- [testing](rules/testing.md) — Comportamento vs implementação, fakes, fronteiras, flakiness zero
- [code-review](rules/code-review.md) — Escopo de PR, checklists, severidade de comentários
- [documentation](rules/documentation.md) — Quando documentar (WHY) e quando não, TSDoc, ADRs
- [api-design](rules/api-design.md) — Recursos, HTTP, idempotência, versionamento, webhooks
- [data-modeling](rules/data-modeling.md) — Nomes por camada, IDs (Postgres `uuidv7()`, Firestore ID automático, ULID em `eventId`), timestamps UTC, `amountMinor` inteiro
- [migration](rules/migration.md) — Expand-and-contract, CONCURRENTLY, dual-write, runbook
- [state-management](rules/state-management.md) — Server vs client state, derivação, race conditions
- [error-handling](rules/error-handling.md) — Taxonomia, Result vs throw, retry, boundaries
- [caching](rules/caching.md) — Camadas, chaves determinísticas, stampede, HTTP headers
- [observability](rules/observability.md) — Três pilares, OTel, RED/USE, SLI/SLO, LLM tokens
- [internationalization](rules/internationalization.md) — Sem hard-code, ICU MessageFormat, Intl, RTL
- [governance](rules/governance.md) — ADRs, ownership, gates, exceções, evals AI, custo (teto × aprovação), compliance
- [accessibility](rules/accessibility.md) — WCAG 2.2 AA, semântica primeiro, ARIA como último recurso
- [grounding](rules/grounding.md) — Anti-alucinação: verificar paths/símbolos/versões no repo
- [tenancy](rules/tenancy.md) — Tenant server-bound, claims como projeção, fail-closed, herança por nó sem deny, principals, audit (ADR 0010)

## Architecture — 7 modelos estruturais

- [fsd](architecture/fsd.md) — Feature-Sliced Design (layers/slices/segments)
- [feature-based](architecture/feature-based.md) — Package by feature, vertical slicing
- [atomic-design](architecture/atomic-design.md) — Atoms/molecules/organisms/templates/pages
- [hexagonal](architecture/hexagonal.md) — Ports & Adapters (driving/driven)
- [ddd](architecture/ddd.md) — Strategic (Bounded Contexts) + Tactical (aggregates, VOs)
- [clean-architecture](architecture/clean-architecture.md) — Quatro camadas concêntricas, Dependency Rule
- [monorepo](architecture/monorepo.md) — apps/packages/modules, mapeamento `src/` → pacotes, fronteiras de import, pipelines Turbo (ADR 0006)

## Practices — 5 disciplinas

- [tdd](practices/tdd.md) — Red-Green-Refactor, Classical vs Mockist
- [bdd](practices/bdd.md) — Three amigos, Gherkin, example mapping
- [sdd](practices/sdd.md) — Spec-first (API-first + AI-assisted)
- [clean-code](practices/clean-code.md) — Princípios canônicos tensionados (Ousterhout, Metz, Beck)
- [ai-friendly-code](practices/ai-friendly-code.md) — Código otimizado para LLMs (token economy, localidade)

## Stacks — 30 tecnologias

### runtime/
- [node@26](stacks/runtime/node@26.md) — Node.js 26 (Current, LTS 2026-10-28), Temporal, strip-types, Permission Model; Functions ficam em `nodejs24` (ADR 0004 E1)

### language/
- [typescript@7](stacks/language/typescript@7.md) — TS 7 nativo (Go), strict + `erasableSyntaxOnly`, side-by-side com TS 6 API (`.pnpmfile.cjs` com Next 16.3)

### frontend/
- [next@16](stacks/frontend/next@16.md) — Next.js 16.3 Active LTS (pin na matriz), App Router, Turbopack, Instant Navigations
- [react@19](stacks/frontend/react@19.md) — React 19.3, Actions, `use`, ref como prop, React Compiler
- [tailwind@4](stacks/frontend/tailwind@4.md) — Tailwind 4, Oxide engine, CSS-first config
- [shadcn-ui](stacks/frontend/shadcn-ui.md) — Copy-not-install sobre Radix + Tailwind 4 + cva
- [radix-ui](stacks/frontend/radix-ui.md) — Primitives headless, `asChild`, data-attributes
- [vite](stacks/frontend/vite.md) — Vite 8 (Rolldown/Oxc) como bundler do shell desktop; Tailwind via `@tailwindcss/vite`, aliases do tsconfig
- [tanstack-router](stacks/frontend/tanstack-router.md) — Router file-based do desktop; adapter do port `shared/lib/router`

### desktop/
- [tauri@2](stacks/desktop/tauri@2.md) — Tauri 2.12: capabilities, IPC, CSP, updater assinado, Android (`10.0.2.2`), plugins como ports (ADR 0007)

### validation/
- [zod@4](stacks/validation/zod@4.md) — Zod 4.6 com `z.email`, `z.iso`, `z.toJSONSchema`

### state/
- [zustand@5](stacks/state/zustand@5.md) — Zustand 5, `useSyncExternalStore`, per-request stores

### ai/
- [vercel-ai-sdk](stacks/ai/vercel-ai-sdk.md) — `ai@7` + providers nas majors medidas em VERSIONS.md
- [mastra-sdk](stacks/ai/mastra-sdk.md) — `@mastra/core@1` + CLI `mastra@1`, modelos `LanguageModelV4`
- [openai](stacks/ai/openai.md) — OpenAI API (Responses, reasoning, Realtime, Batch)
- [openai-sdk](stacks/ai/openai-sdk.md) — SDK `openai` (Node) — streaming, Realtime, Batch
- [anthropic](stacks/ai/anthropic.md) — Claude API (prompt caching, computer use, extended thinking)
- [anthropic-sdk](stacks/ai/anthropic-sdk.md) — SDK `@anthropic-ai/sdk` (direct/Bedrock/Vertex)
- [gemini](stacks/ai/gemini.md) — Gemini API; default Vertex `gemini-3.5-flash` (2.5 aposenta no Vertex em 2026-10-20)
- [google-genai-sdk](stacks/ai/google-genai-sdk.md) — SDK `@google/genai` unificado
- [harness-engineering](stacks/ai/harness-engineering.md) — 8 camadas ao redor do LLM

### backend/
- [firebase-functions](stacks/backend/firebase-functions.md) — Functions Gen 2, firebase-functions@7.4, firebase-admin@14.5, runtime nodejs24
- [cloud-run](stacks/backend/cloud-run.md) — Servidor Mastra: imagem `node:26-alpine`, `MASTRA_HOST`, billing por instância para o scheduler, IAM invoker, Cloud SQL (ADR 0009)
- [firebase-platform](stacks/backend/firebase-platform.md) — Auth/Identity Platform, App Hosting (`nodejs24`, E6 provisória), Storage, App Check, Remote Config, FCM, Emulator Suite e portas

### database/
- [firebase-firestore](stacks/database/firebase-firestore.md) — SDKs Client/Admin, queries, vector
- [postgres](stacks/database/postgres.md) — Postgres 18, Drizzle, `uuidv7()`, AIO, pooling
- [pgvector](stacks/database/pgvector.md) — Vetores 0.8.6 (vector/halfvec/bit/sparse), HNSW vs IVFFlat
- [bigquery](stacks/database/bigquery.md) — Warehouse OLAP, Storage Write API, dryRun

### testing/
- [vitest](stacks/testing/vitest.md) — Vitest 5.0, projects, browser-playwright, `clearMocks` ligado
- [playwright](stacks/testing/playwright.md) — E2E 1.63 + a11y, locators role-first; component testing fica no Vitest (ADR 0004 E5)

## Contracts — 9 doutrinas de modelagem

- [api](contracts/api.md) — Naming kebab/camel, envelopes RFC 9457, status codes, paginação cursor
- [firebase-firestore](contracts/firebase-firestore.md) — Coleções, audit fields, soft-delete, tenant isolation (default `tenantId`; o core adota o modelo por nó de `rules/tenancy.md`, que prevalece sobre o §7)
- [bigquery](contracts/bigquery.md) — Star schema, STRUCT/ARRAY, partitioning, policy tags
- [postgres](contracts/postgres.md) — snake_case, **uuidv7() PKs** (default), audit+soft-delete, TIMESTAMPTZ, outbox
- [pgvector](contracts/pgvector.md) — Schema `ai`, `chunks_v1`, PKs uuidv7, versionamento de embeddings
- [schemas](contracts/schemas.md) — Zod compartilhado em `src/contracts/<context>/`, branded IDs, versioning
- [events](contracts/events.md) — Envelope CloudEvents-like; **eventId = ULID** (wire); `aggregateId` = id do store; outbox TEXT
- [secrets](contracts/secrets.md) — Secret Manager, rotação 90d, validação Zod no boot
- [data-catalog](contracts/data-catalog.md) — Metadados obrigatórios (`defineContract`, `.meta()`: id, pii, tenancyScope, relations, ui), `contracts:catalog`/`check`, paridade Drizzle ↔ Zod, views semânticas, uso pela IA (ADR 0011)

## Processes — 8 fluxos operacionais

- [git](processes/git.md) — Trunk-Based, squash merge, rebase sync, main protegida
- [commits](processes/commits.md) — Conventional Commits 1.0.0, types/scope/breaking
- [pull-requests](processes/pull-requests.md) — Template, <400 LOC, SLAs, PRs especiais
- [deploy](processes/deploy.md) — Pipeline canônico, expand-and-contract, canary/blue-green
- [release](processes/release.md) — SemVer via Conventional Commits, Keep a Changelog
- [environments](processes/environments.md) — local/dev/staging/prod, paridade 12-factor, isolamento GCP
- [monitoring](processes/monitoring.md) — Stack OTel, SLOs com error budget, on-call rotation
- [rollback](processes/rollback.md) — Flag flip > deploy revert > forward fix; expand-and-contract enable

## Decisions — 11 ADRs + índice

- [README](decisions/README.md) — formato e numeração dos ADRs
- [0001 — Baseline 2026-07 + harness DDC](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) — uuidv7 no Postgres, using-ddc, plans, verification, hooks, remoção guard-secrets
- [0002 — Baseline 2026-09 + nomes](decisions/0002-baseline-2026-09-version-and-naming-alignment.md) — pins medidos e tradução camelCase/snake_case entre camadas
- [0003 — Conflitos de convenção](decisions/0003-cross-doc-convention-conflicts-resolved.md) — envelope de erro, schema, `views`, testes colocados, `function`/barrel, frontmatter: quem vence
- [0004 — Última estável + exceções](decisions/0004-latest-stable-baseline-and-documented-exceptions.md) — Node 26 como baseline; E1 Functions `nodejs24`, E2 typescript-eslint, E3 ESLint 9, E4 `@mastra/evals`, E5 Playwright CT, E6 App Hosting `nodejs24`
- [0005 — IDs do Firestore](decisions/0005-firestore-document-ids-use-automatic-ids.md) — ID automático no Firestore (ULID é monotônico e gera hotspot); ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`
- [0006 — Monorepo](decisions/0006-monorepo-layout-and-package-boundaries.md) — pnpm + Turborepo; `apps/` só compõem, `packages/` recebem o `src/` da doutrina, fronteiras por `eslint-plugin-boundaries`
- [0007 — Desktop e mobile com Tauri 2](decisions/0007-desktop-and-mobile-shell-with-tauri-2.md) — Tauri 2 + Vite + TanStack Router desde a v1, reusando `packages/client`; rejeitados PWA-first e Expo; `/admin` só web
- [0008 — Divisão de dados](decisions/0008-data-stores-split-firestore-postgres-storage-bigquery.md) — Firestore (app, tempo real), Postgres 18 + pgvector (schemas `mastra` e `ai`), Cloud Storage, BigQuery; rejeitados Firestore-only, Postgres-only e Spanner; Data Connect fora da v1 (emulator PGlite)
- [0009 — Topologia de runtime](decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md) — `/v1` em Route Handlers no App Hosting; Functions só eventos/jobs/webhooks; Mastra privado no Cloud Run; rejeitados `/v1` em Functions e Mastra como backend único
- [0010 — Tenancy e acesso](decisions/0010-tenancy-organization-project-units-and-rbac.md) — Organização → Projeto → Unidades; `memberships`/`roles` como fonte, projeção `access/{tenantId}_{uid}` para as Rules, claims ≤ 1000 bytes; principals user/device/service/staff; Signed URL para upload; `audit-logs`; provider próprio no Mastra (rejeitados claims como fonte, motor ReBAC externo, E7 e `pnpm.overrides`)
- [0011 — Contratos como catálogo de dados](decisions/0011-contracts-as-machine-readable-data-catalog.md) — Zod + `contractRegistry`/`defineContract` gera OpenAPI, JSON Schema, `docs/catalog/**` e views semânticas; gate `contracts:check`; `drizzle-zod` 0.8.3; supersede em parte a 0008 (BigQuery na tool SQL do agente, desligado até o SP3); rejeitados docs ad hoc e JSON Schema/OpenAPI-first

---

**Total:** ~70 contextos + ADRs · referenciar via `@<path-sem-extensão>` em outros docs.

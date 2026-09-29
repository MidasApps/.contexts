# Engineering Memory Index

Índice dos contextos de engenharia do DDC Framework. Referenciados via `@<path-sem-extensão>`.

**Última revisão de versões:** 2026-09-28.

> A matriz abaixo é o baseline do **framework**. O que estava no npm e nas
> release notes nesse dia, e o que ficou de fora, está em
> [`stacks/VERSIONS.md`](stacks/VERSIONS.md). Um projeto consumidor compara o
> `package.json` dele com essa tabela antes de tratar a linha como fato local.

**ADRs:** [0001](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) (harness, IDs, secrets), [0002](decisions/0002-baseline-2026-09-version-and-naming-alignment.md) (pins e nomes entre camadas), [0003](decisions/0003-cross-doc-convention-conflicts-resolved.md) (qual documento vence em cada conflito) e [0004](decisions/0004-latest-stable-baseline-and-documented-exceptions.md) (política de última estável + exceções E1–E5) e [0005](decisions/0005-firestore-document-ids-use-automatic-ids.md) (ID automático no Firestore; ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`).

## Matriz de compatibilidade (baseline de produção)

Stack pinado para ser **mutuamente compatível**. Não subir uma major isolada sem validar a linha inteira.

| Camada | Baseline | Notas de compatibilidade |
|---|---|---|
| Runtime | **Node.js 26.10.0** (Current; LTS em 2026-10-28) | ADR 0004. **Exceção E1:** deploy de Firebase Functions fica em `nodejs24` (o Google não tem `nodejs26`). Node 24 entra em Maintenance em 2026-10-20. |
| Linguagem | **TypeScript 7.0.2** | `@typescript/typescript6@6.0.2` só para API programática (typescript-eslint, Volar, deployer). E2. |
| Lint | **ESLint 9.39.5** | E3: a última é 10.11.0, mas `eslint-plugin-react@7.37.5` só aceita `^9.7`. |
| Frontend app | **Next.js 16.3.6** + React **19.3.0** | 16.3 é Active LTS. 16.4 é canary. 16.3.7 anunciado para 2026-09-30. |
| UI | **Tailwind 4.3.3** + **shadcn/ui** + **radix-ui 1.6.7** | React 19.3. |
| Validação | **Zod 4.6.5** | Schema-first; `z.infer` único source de tipos. Sem Zod 3 no bundle. |
| State client | **Zustand 5.0.15** | Só client components; server state fora. |
| Backend serverless | **firebase-functions@7.4.0** + **firebase-admin@14.5.0**, runtime **nodejs24** | Gen 2 only. `nodejs24` é o mais novo que o Google oferece (E1). |
| OLTP | **PostgreSQL 18.6** + Drizzle 0.45.3 | `uuidv7()` nativo. 18.5 não foi publicado. Postgres 19 segue em beta. |
| Vectors | **pgvector 0.8.6** em Postgres 18 | Imagem `pgvector/pgvector:0.8.6-pg18`. HNSW default. |
| OLAP | **BigQuery** | Inalterado em major; ver stack. |
| Unit/integration | **Vitest 5.0.2** | Vite ^6.4, ^7 ou ^8 como peer (medido: 8.3.1). Pacotes `@vitest/*` na mesma versão. |
| E2E | **Playwright 1.63.0** | E5: `@playwright/experimental-ct-react` (1.62.1) não é adotado; componente roda no Vitest. |
| AI default | **`ai@7.0.120`** | Providers nas majors medidas em `VERSIONS.md` (não a mesma major do `ai`). `@mastra/core@1.71.0` aceita `LanguageModelV4`. E4: `@mastra/evals` fora (peer `vitest <5`). |

**Invariantes de compatibilidade:**

1. App, CI, Docker e tooling rodam em **Node 26**; **só o deploy de Firebase Functions** roda em **Node 24** (E1, ADR 0004).
2. Typecheck com **TS 7** (`tsc --noEmit`); emit de app via bundler (Next/Turbopack).
3. Next 16 ↔ React 19 — peers obrigatórios; sem React 18.
4. Zod 4 em **todas** as boundaries (não misturar Zod 3 no mesmo bundle).
5. Postgres 18.6 + pgvector 0.8.6 no mesmo cluster; imagens de dev/CI `postgres:18` / `pgvector/pgvector:0.8.6-pg18`.
6. Firebase Functions Gen 2 em **nodejs24**, com `engines.node` `>=24.0.0 <25` no pacote de functions (o resto do monorepo `>=26.0.0 <27`).
7. Vitest 5 e Playwright 1.63 compartilham o browser quando o browser mode está ativo. Component testing do Playwright não é usado (E5).
8. **Política (ADR 0004):** o baseline é sempre a última estável. Pré-release (canary, beta, rc) não é versão. Pacote atrás do `latest` só com linha de exceção no ADR 0004.

---

## Rules — 18 contextos imperativos

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

## Architecture — 6 modelos estruturais

- [fsd](architecture/fsd.md) — Feature-Sliced Design (layers/slices/segments)
- [feature-based](architecture/feature-based.md) — Package by feature, vertical slicing
- [atomic-design](architecture/atomic-design.md) — Atoms/molecules/organisms/templates/pages
- [hexagonal](architecture/hexagonal.md) — Ports & Adapters (driving/driven)
- [ddd](architecture/ddd.md) — Strategic (Bounded Contexts) + Tactical (aggregates, VOs)
- [clean-architecture](architecture/clean-architecture.md) — Quatro camadas concêntricas, Dependency Rule

## Practices — 5 disciplinas

- [tdd](practices/tdd.md) — Red-Green-Refactor, Classical vs Mockist
- [bdd](practices/bdd.md) — Three amigos, Gherkin, example mapping
- [sdd](practices/sdd.md) — Spec-first (API-first + AI-assisted)
- [clean-code](practices/clean-code.md) — Princípios canônicos tensionados (Ousterhout, Metz, Beck)
- [ai-friendly-code](practices/ai-friendly-code.md) — Código otimizado para LLMs (token economy, localidade)

## Stacks — 25 tecnologias

### runtime/
- [node@26](stacks/runtime/node@26.md) — Node.js 26 (Current, LTS 2026-10-28), Temporal, strip-types, Permission Model; Functions ficam em `nodejs24` (ADR 0004 E1)

### language/
- [typescript@7](stacks/language/typescript@7.md) — TS 7 nativo (Go), strict + `erasableSyntaxOnly`, side-by-side com TS 6 API (`.pnpmfile.cjs` com Next 16.3)

### frontend/
- [next@16](stacks/frontend/next@16.md) — Next.js 16.3.6 Active LTS, App Router, Turbopack, Instant Navigations
- [react@19](stacks/frontend/react@19.md) — React 19.3, Actions, `use`, ref como prop, React Compiler
- [tailwind@4](stacks/frontend/tailwind@4.md) — Tailwind 4, Oxide engine, CSS-first config
- [shadcn-ui](stacks/frontend/shadcn-ui.md) — Copy-not-install sobre Radix + Tailwind 4 + cva
- [radix-ui](stacks/frontend/radix-ui.md) — Primitives headless, `asChild`, data-attributes

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

### database/
- [firebase-firestore](stacks/database/firebase-firestore.md) — SDKs Client/Admin, queries, vector
- [postgres](stacks/database/postgres.md) — Postgres 18, Drizzle, `uuidv7()`, AIO, pooling
- [pgvector](stacks/database/pgvector.md) — Vetores 0.8.6 (vector/halfvec/bit/sparse), HNSW vs IVFFlat
- [bigquery](stacks/database/bigquery.md) — Warehouse OLAP, Storage Write API, dryRun

### testing/
- [vitest](stacks/testing/vitest.md) — Vitest 5.0, projects, browser-playwright, `clearMocks` ligado
- [playwright](stacks/testing/playwright.md) — E2E 1.63 + a11y, locators role-first; component testing fica no Vitest (ADR 0004 E5)

## Contracts — 8 doutrinas de modelagem

- [api](contracts/api.md) — Naming kebab/camel, envelopes RFC 9457, status codes, paginação cursor
- [firebase-firestore](contracts/firebase-firestore.md) — Coleções, audit fields, soft-delete, tenant isolation (default `tenantId`; modelo por conjunto → `rules/tenancy.md`, criado pelo projeto ao adotá-lo)
- [bigquery](contracts/bigquery.md) — Star schema, STRUCT/ARRAY, partitioning, policy tags
- [postgres](contracts/postgres.md) — snake_case, **uuidv7() PKs** (default), audit+soft-delete, TIMESTAMPTZ, outbox
- [pgvector](contracts/pgvector.md) — Schema `ai`, `chunks_v1`, PKs uuidv7, versionamento de embeddings
- [schemas](contracts/schemas.md) — Zod compartilhado em `src/contracts/<context>/`, branded IDs, versioning
- [events](contracts/events.md) — Envelope CloudEvents-like; **eventId = ULID** (wire); `aggregateId` = id do store; outbox TEXT
- [secrets](contracts/secrets.md) — Secret Manager, rotação 90d, validação Zod no boot

## Processes — 8 fluxos operacionais

- [git](processes/git.md) — Trunk-Based, squash merge, rebase sync, main protegida
- [commits](processes/commits.md) — Conventional Commits 1.0.0, types/scope/breaking
- [pull-requests](processes/pull-requests.md) — Template, <400 LOC, SLAs, PRs especiais
- [deploy](processes/deploy.md) — Pipeline canônico, expand-and-contract, canary/blue-green
- [release](processes/release.md) — SemVer via Conventional Commits, Keep a Changelog
- [environments](processes/environments.md) — local/dev/staging/prod, paridade 12-factor, isolamento GCP
- [monitoring](processes/monitoring.md) — Stack OTel, SLOs com error budget, on-call rotation
- [rollback](processes/rollback.md) — Flag flip > deploy revert > forward fix; expand-and-contract enable

## Decisions — 5 ADRs + índice

- [README](decisions/README.md) — formato e numeração dos ADRs
- [0001 — Baseline 2026-07 + harness DDC](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) — uuidv7 no Postgres, using-ddc, plans, verification, hooks, remoção guard-secrets
- [0002 — Baseline 2026-09 + nomes](decisions/0002-baseline-2026-09-version-and-naming-alignment.md) — pins medidos e tradução camelCase/snake_case entre camadas
- [0003 — Conflitos de convenção](decisions/0003-cross-doc-convention-conflicts-resolved.md) — envelope de erro, schema, `views`, testes colocados, `function`/barrel, frontmatter: quem vence
- [0004 — Última estável + exceções](decisions/0004-latest-stable-baseline-and-documented-exceptions.md) — Node 26 como baseline; E1 Functions `nodejs24`, E2 typescript-eslint, E3 ESLint 9, E4 `@mastra/evals`, E5 Playwright CT
- [0005 — IDs do Firestore](decisions/0005-firestore-document-ids-use-automatic-ids.md) — ID automático no Firestore (ULID é monotônico e gera hotspot); ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`

---

**Total:** ~70 contextos + ADRs · referenciar via `@<path-sem-extensão>` em outros docs.

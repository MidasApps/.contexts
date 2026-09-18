# Engineering Memory Index

Índice dos contextos de engenharia do DDC Framework. Referenciados via `@<path-sem-extensão>`.

**Última revisão de versões:** 2026-07-14.

**ADR da onda de baseline + harness:** [`decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) (accepted).

## Matriz de compatibilidade (baseline de produção)

Stack pinado para ser **mutuamente compatível**. Não subir uma major isolada sem validar a linha inteira.

| Camada | Baseline | Notas de compatibilidade |
|---|---|---|
| Runtime | **Node.js 24 LTS** (Krypton, pin ~24.18) | Node 26 = Current — não produção até LTS. |
| Linguagem | **TypeScript 7.x** | Side-by-side com TS 6 API se eslint/Volar exigir. |
| Frontend app | **Next.js 16.2.x** (+ React **19.2.x**) | 16.3 Preview = Instant Navigations; adotar após stable. |
| UI | **Tailwind 4** + **shadcn/ui** + **Radix** | Tailwind 4 CSS-first; React 19 peers. |
| Validação | **Zod 4.4.x** | Schema-first; `z.infer` único source de tipos. |
| State client | **Zustand 5** | Só client components; server state fora. |
| Backend serverless | **firebase-functions@7** + **Admin ≥13**, runtime **nodejs24** | Gen 2 only. |
| OLTP | **PostgreSQL 18** + Drizzle | `uuidv7()` nativo; checksums default. |
| Vectors | **pgvector 0.8.x** em Postgres 18 | HNSW default. |
| OLAP | **BigQuery** | Inalterado em major; ver stack. |
| Unit/integration | **Vitest 4.x** | Vite ≥6; browser via `@vitest/browser-playwright`. |
| E2E | **Playwright 1.61.x** | Node 22/24/26; helper Next `instant()` em 16.3. |
| AI default | **Vercel AI SDK** (cross-provider) | SDKs oficiais quando feature exclusiva. |

**Invariantes de compatibilidade:**

1. Todo JS/TS de app/functions/CI roda em **Node 24**.
2. Typecheck com **TS 7** (`tsc --noEmit`); emit de app via bundler (Next/Turbopack).
3. Next 16 ↔ React 19 — peers obrigatórios; sem React 18.
4. Zod 4 em **todas** as boundaries (não misturar Zod 3 no mesmo bundle).
5. Postgres 18 + pgvector 0.8 no mesmo cluster; imagens de dev/CI `postgres:18` / `pgvector/pgvector:pg18`.
6. Firebase Functions Gen 2 em **nodejs24** com o mesmo `engines.node` do monorepo.
7. Vitest 4 e Playwright 1.61 compartilham Playwright como browser engine quando browser mode está ativo.

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
- [data-modeling](rules/data-modeling.md) — Identidade vs valor, ULIDs/UUIDv7, timestamps UTC, money como inteiro
- [migration](rules/migration.md) — Expand-and-contract, CONCURRENTLY, dual-write, runbook
- [state-management](rules/state-management.md) — Server vs client state, derivação, race conditions
- [error-handling](rules/error-handling.md) — Taxonomia, Result vs throw, retry, boundaries
- [caching](rules/caching.md) — Camadas, chaves determinísticas, stampede, HTTP headers
- [observability](rules/observability.md) — Três pilares, OTel, RED/USE, SLI/SLO, LLM tokens
- [internationalization](rules/internationalization.md) — Sem hard-code, ICU MessageFormat, Intl, RTL
- [governance](rules/governance.md) — ADRs, ownership, gates, exceções, evals AI, compliance
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
- [node@24](stacks/runtime/node@24.md) — Node.js 24 LTS (Krypton), strip-types, Permission Model

### language/
- [typescript@7](stacks/language/typescript@7.md) — TS 7 nativo (Go), strict + `erasableSyntaxOnly`, side-by-side com TS 6 API

### frontend/
- [next@16](stacks/frontend/next@16.md) — Next.js 16.2 LTS / 16.3 preview (Instant Navigations), App Router, Turbopack
- [react@19](stacks/frontend/react@19.md) — React 19.2, Actions, `use`, ref como prop, React Compiler
- [tailwind@4](stacks/frontend/tailwind@4.md) — Tailwind 4, Oxide engine, CSS-first config
- [shadcn-ui](stacks/frontend/shadcn-ui.md) — Copy-not-install sobre Radix + Tailwind 4 + cva
- [radix-ui](stacks/frontend/radix-ui.md) — Primitives headless, `asChild`, data-attributes

### validation/
- [zod@4](stacks/validation/zod@4.md) — Zod 4.4 com `z.iso`, `z.toJSONSchema`, performance 7–100x vs 3

### state/
- [zustand@5](stacks/state/zustand@5.md) — Zustand 5, `useSyncExternalStore`, per-request stores

### ai/
- [vercel-ai-sdk](stacks/ai/vercel-ai-sdk.md) — Camada cross-provider (Core + UI hooks)
- [mastra-sdk](stacks/ai/mastra-sdk.md) — Framework agents/workflows/RAG/evals
- [openai](stacks/ai/openai.md) — OpenAI API (Responses, reasoning, Realtime, Batch)
- [openai-sdk](stacks/ai/openai-sdk.md) — SDK `openai` (Node) — streaming, Realtime, Batch
- [anthropic](stacks/ai/anthropic.md) — Claude API (prompt caching, computer use, extended thinking)
- [anthropic-sdk](stacks/ai/anthropic-sdk.md) — SDK `@anthropic-ai/sdk` (direct/Bedrock/Vertex)
- [gemini](stacks/ai/gemini.md) — Gemini API (AI Studio vs Vertex, multimodal, context caching)
- [google-genai-sdk](stacks/ai/google-genai-sdk.md) — SDK `@google/genai` unificado
- [harness-engineering](stacks/ai/harness-engineering.md) — 8 camadas ao redor do LLM

### backend/
- [firebase-functions](stacks/backend/firebase-functions.md) — Functions Gen 2, firebase-functions@7, runtime nodejs24

### database/
- [firebase-firestore](stacks/database/firebase-firestore.md) — SDKs Client/Admin, queries, vector
- [postgres](stacks/database/postgres.md) — Postgres 18, Drizzle, `uuidv7()`, AIO, pooling
- [pgvector](stacks/database/pgvector.md) — Vetores 0.8.x (vector/halfvec/bit/sparse), HNSW vs IVFFlat
- [bigquery](stacks/database/bigquery.md) — Warehouse OLAP, Storage Write API, dryRun

### testing/
- [vitest](stacks/testing/vitest.md) — Vitest 4.x, projects, browser-playwright, schemaMatching
- [playwright](stacks/testing/playwright.md) — E2E 1.61.x + component + a11y, locators role-first

## Contracts — 8 doutrinas de modelagem

- [api](contracts/api.md) — Naming kebab/camel, envelopes RFC 9457, status codes, paginação cursor
- [firebase-firestore](contracts/firebase-firestore.md) — Coleções, audit fields, soft-delete, tenant isolation
- [bigquery](contracts/bigquery.md) — Star schema, STRUCT/ARRAY, partitioning, policy tags
- [postgres](contracts/postgres.md) — snake_case, **uuidv7() PKs** (default), audit+soft-delete, TIMESTAMPTZ, outbox
- [pgvector](contracts/pgvector.md) — Schema `ai`, `chunks_v1`, PKs uuidv7, versionamento de embeddings
- [schemas](contracts/schemas.md) — Zod compartilhado em `src/contracts/<context>/`, branded IDs, versioning
- [events](contracts/events.md) — Envelope CloudEvents-like; **eventId = ULID** (wire); outbox TEXT
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

## Decisions

- [0001 — Baseline 2026-07 + harness DDC](decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md) — pins, uuidv7/ULID, using-ddc, plans, verification, hooks, remoção guard-secrets

---

**Total:** ~70 contextos + ADRs · referenciar via `@<path-sem-extensão>` em outros docs.

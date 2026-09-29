# SP0 — Fundação do boilerplate em `app/`: implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. Subagent-per-task with
> templates in `.claude/skills/writing-plans-ddc/` (implementer + task-reviewer).
> **`.contexts/` e `.claude/` são o framework: somente leitura. Nunca edite, crie ou
> apague nada neles** (nem o ledger `.claude/agent-memory/progress.md`). Progresso vai
> em `docs/plans/2026-09-29-sp0-app-foundation/progress.md`.

**Goal:** monorepo do boilerplate em `app/`, vazio porém funcional: toolchain, config
compartilhada, contratos com registry/catálogo, Emulator Suite + Postgres/pgvector,
esqueletos dos quatro apps e `pnpm dev` subindo tudo localmente, com CI verde.

**Architecture:** workspace pnpm + Turborepo com raiz em `app/` (spec §3). Nenhuma regra
de negócio; apenas health checks e o contrato de catálogo. Decisões e fatos verificados:
`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2, §3, §5, §11, §14, §16.

**Tech Stack:** pins de `@.contexts/engineering/MEMORY.md` + medição de 2026-09-29 na spec
§16.1 (Next 16.3.7, `ai` 7.0.122 são `latest`, conforme política do ADR 0004). Node 26.10.0
(Functions `nodejs24`, E1), pnpm 12.6.0, turbo 2.11.5, TS 7.0.2 (+ API TS 6 só para lint, E2),
ESLint 9.39.5 (E3), Zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0, Rust 1.98.1, Java 21.

## Global Constraints

- **Framework read-only:** nenhum arquivo em `.contexts/` ou `.claude/` muda. Verify de
  toda task inclui `git diff --quiet main -- .contexts .claude && echo framework-ok`.
- Tudo novo mora em `app/` (exceto `docs/plans/**` e, no fim, `.github/workflows/` na raiz,
  com `working-directory: app`).
- Pins exatos; versões compartilhadas no `catalog:` de `app/pnpm-workspace.yaml`.
- `engines.node`: `>=26.0.0 <27` em todo pacote; `app/apps/functions` `>=24.0.0 <25` (E1);
  `app/apps/web` `>=24.0.0 <27` + `@types/node@24` (decisão local, spec §14/§16.3).
- tsconfig canônico de `@.contexts/engineering/stacks/language/typescript@7.md`; libs e
  Functions em `nodenext`; `app/.pnpmfile.cjs` com o hook TS 6 do mesmo doc.
- Env: `src/env.ts` Zod por app (`@.contexts/engineering/contracts/secrets.md` §5.4);
  `app/.env.example` completo; `.env.local` ignorado.
- Erros HTTP no envelope de `@.contexts/engineering/contracts/api.md` §6; logs JSON
  (`@.contexts/engineering/rules/observability.md`).
- Local nunca aponta para projeto remoto (`@.contexts/engineering/processes/environments.md` §9).
- Arquivos ≤ 500 linhas, funções ≤ 50, named exports (rule `ai-friendly-code`).
- Commits Conventional; scopes `app`, `config`, `contracts`, `firebase`, `web`, `desktop`,
  `mastra`, `functions`, `ci`.

---

### Task 0: Spike — Next 16.3.7 no Firebase App Hosting

**Contexts:** spec §16.3 (critérios e fallback); `@.contexts/engineering/stacks/frontend/next@16.md`;
`@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`

**Files:**
- Create: `app/spikes/app-hosting-next16/` (descartável): 1 página com Cache Components, 1 rota ISR, 1 Route Handler SSE longo, `apphosting.yaml` com `runConfig`, engines `>=24.0.0 <27`
- Create: `docs/plans/2026-09-29-sp0-app-foundation/reports/spike-app-hosting.md`

- [ ] Step 1: Read contexts + spec §16.3
- [ ] Step 2: **Pedir ao usuário** projeto Firebase de sandbox (não `demo-*`, não prod) e autorização de deploy
- [ ] Step 3: Deploy via App Hosting; medir os 5 critérios de §16.3
- [ ] Step 4: Relatório com evidência e veredito PASS/FAIL; FAIL → parar e escalar (fallback muda §16.3)
- [ ] Step 5: Remover recursos do sandbox; apagar `app/spikes/` antes do PR; progress + commit `docs(app): record app hosting next 16 spike`

**Verify:** relatório com os 5 critérios, cada um com evidência e PASS/FAIL; `framework-ok`.

### Task 1: Toolchain e raiz do workspace `app/`

**Contexts:** `@.contexts/engineering/stacks/runtime/node@26.md`, `@.contexts/engineering/stacks/language/typescript@7.md`, `@.contexts/engineering/processes/git.md` (§20), spec §3

**Files:**
- Create: `app/.nvmrc` (`26.10.0`), `app/package.json` (`private`, `packageManager: "pnpm@12.6.0"`, `engines`, scripts `dev|build|lint|typecheck|test|test:e2e|contracts:catalog|contracts:check|seed:local` via `turbo run`), `app/pnpm-workspace.yaml` (`apps/*`, `packages/*`, `modules/*` + `catalog:`), `app/turbo.json`, `app/.pnpmfile.cjs`, `app/.npmrc`, `app/.gitignore` (`node_modules`, `.turbo`, `.next`, `dist`, `.tscache`, `.env.local`, `.firebase-data`, `src-tauri/target`, `.mastra`)
- Create: `app/README.md` (o que é o boilerplate; framework em `../.contexts` é somente leitura)

- [ ] Step 1: Read contexts
- [ ] Step 2: Confirmar `node -v` = v26.10.0, `pnpm -v` = 12.6.0, `rustc -V` ≥ 1.98.1 (senão pedir ao usuário)
- [ ] Step 3: Criar arquivos; `cd app && pnpm install` sem erros
- [ ] Step 4: progress + commit `build(app): bootstrap pnpm and turborepo workspace`

**Verify:** `cd app && pnpm turbo run lint --dry-run` sem erro; `framework-ok`.

### Task 2: `app/packages/config` — tsconfig, ESLint 9 com fronteiras, Vitest

**Contexts:** `@.contexts/engineering/stacks/language/typescript@7.md`, `@.contexts/engineering/stacks/testing/vitest.md`, `@.contexts/engineering/rules/development.md`, spec §3

**Files:**
- Create: `app/packages/config/package.json` (`@core/config`), `tsconfig/{base,bundler,nodenext}.json`, `eslint/index.js` (flat config; `eslint-plugin-boundaries` com elementos `app`, `client`, `contracts`, `services`, `agents`, `i18n`, `module` e as regras de spec §3), `vitest/preset.ts`
- Test: `app/packages/config/eslint/boundaries.test.ts` (fixture `client` → `services` gera `boundaries/dependencies`; `client` → `contracts` passa)

- [ ] Steps: read → teste falhando → config → passa → progress → commit `build(config): add shared tsconfig, eslint boundaries and vitest preset`

**Verify:** `cd app && pnpm -F @core/config test` → 2 passed; `framework-ok`.

### Task 3: `app/packages/contracts` — primitivos e registry de metadados (TDD)

**Contexts:** `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/stacks/validation/zod@4.md`, `@.contexts/engineering/rules/data-modeling.md`, `@.contexts/engineering/decisions/0005-firestore-document-ids-use-automatic-ids.md`, spec §5 e §16.4

**Files:**
- Create: `app/packages/contracts/package.json` (`@core/contracts`, `zod: catalog:`)
- Create: `src/contracts/primitives/{ids,money,locale,time-zone,iso-datetime,catalog-meta}.schema.ts` (`CatalogMetaSchema` com os campos de §16.4)
- Create: `src/contracts/registry.ts` — `defineContract(schema, meta)` (registra no `globalRegistry` e em Map próprio, `id` duplicado falha) + `listContracts()`
- Test: `money.schema.test.ts` (rejeita `amountMinor` não inteiro e moeda minúscula), `registry.test.ts` (rejeita contrato sem `description`/`pii`, rejeita `id` duplicado, `listContracts()` devolve o registrado)

- [ ] Steps: read → testes falhando → mínimo → passa + typecheck → progress → commit `feat(contracts): add primitives and catalog metadata registry`

**Verify:** `cd app && pnpm -F @core/contracts test && pnpm -F @core/contracts typecheck`; `framework-ok`.

### Task 4: Gerador `contracts:catalog` e gate `contracts:check`

**Contexts:** `@.contexts/engineering/contracts/api.md` (§15), spec §5 e §16.4

**Files:**
- Create: `app/packages/contracts/scripts/build-catalog.ts` (lê `listContracts()`; emite `app/docs/catalog/catalog.json`, `catalog.ai.json` sem `sensitive` e com `personal` redigido em exemplos, `app/docs/catalog/<context>/<Name>.md`, JSON Schema via `z.toJSONSchema` com `override` → chaves `x-*`, e `app/docs/openapi/v1.yaml`)
- Create: `scripts/check-catalog.ts` (regera em memória e compara; falha se divergente, campo sem `description`/`pii`, ou chave crua de meta no artefato)
- Create: `src/contracts/example/note.schema.ts` (`example.Note`, removível)
- Test: `scripts/build-catalog.test.ts`

- [ ] Steps: read → testes falhando → scripts → passa → `pnpm contracts:catalog` → progress → commit `feat(contracts): generate and check data catalog`

**Verify:** `cd app && pnpm contracts:catalog && pnpm contracts:check` → exit 0; `framework-ok`.

### Task 5: Firebase Emulator Suite e Rules deny-by-default

**Contexts:** `@.contexts/engineering/stacks/database/firebase-firestore.md`, `@.contexts/engineering/contracts/firebase-firestore.md` (§7), `@.contexts/engineering/stacks/backend/firebase-functions.md`, spec §4, §11, §16.2

**Files:**
- Create: `app/firebase.json` (emulators auth 9099, firestore 8080, functions 5001, storage 9199, pubsub 8085, eventarc 9299, ui 4000, `singleProjectMode`), `app/.firebaserc` (`demo-core`), `app/firestore.rules` e `app/storage.rules` (deny all), `app/firestore.indexes.json`
- Create: `app/packages/services/package.json` (`@core/services`) + `src/services/shared/firebase-rules.test.ts` (`@firebase/rules-unit-testing`: leitura e escrita negadas)

- [ ] Steps: read → teste falhando → rules → `firebase emulators:exec --only firestore,storage "pnpm -F @core/services test"` → progress → commit `build(firebase): add emulator suite and deny-by-default rules`

**Verify:** comando acima passa; `framework-ok`.

### Task 6: Postgres + pgvector local e env tipado

**Contexts:** `@.contexts/engineering/stacks/database/postgres.md`, `@.contexts/engineering/stacks/database/pgvector.md`, `@.contexts/engineering/contracts/pgvector.md`, `@.contexts/engineering/contracts/secrets.md` (§5.4)

**Files:**
- Create: `app/docker-compose.yml` (`pgvector/pgvector:0.8.6-pg18`, healthcheck), `app/infra/postgres/init/001-schemas.sql` (extensão `vector`, schemas `mastra`, `ai`, `semantic`), `app/.env.example`
- Test: `app/packages/services/src/services/shared/postgres-schemas.test.ts`

- [ ] Steps: read → teste falhando → compose/init → `docker compose up -d --wait` → passa → progress → commit `build(app): add local postgres with pgvector`

**Verify:** `docker compose ps` healthy; teste passa; `framework-ok`.

### Task 7: `app/apps/web` — Next 16 com `/v1/health`

**Contexts:** `@.contexts/engineering/stacks/frontend/next@16.md`, `@.contexts/engineering/rules/api-design.md`, `@.contexts/engineering/contracts/api.md` (§5, §6), `@.contexts/engineering/rules/observability.md`

**Files:**
- Create: `app/apps/web` (Next 16.3.7, React 19.3.0; `src/app/layout.tsx`, `src/app/(app)/page.tsx`, `src/proxy.ts` com `x-request-id` ULID, `src/env.ts`)
- Create: `app/packages/services/src/services/platform/adapters/driving/health-route-handler.ts` + `app/apps/web/src/app/v1/health/route.ts` (re-export) → `200 { data: { status: "ok" } }`
- Test: `health-route-handler.test.ts`

- [ ] Steps: read → teste falhando → implementação → passa → `pnpm -F web build` → progress → commit `feat(web): scaffold next app with v1 health endpoint`

**Verify:** `curl -s localhost:3000/v1/health` → `{"data":{"status":"ok"}}`; `framework-ok`.

### Task 8: `app/apps/mastra` — servidor Mastra + Studio local

**Contexts:** `@.contexts/engineering/stacks/ai/mastra-sdk.md` (e spec §7, §16.3 onde ele estiver defasado), `@.contexts/engineering/stacks/ai/harness-engineering.md`

**Files:**
- Create: `app/apps/mastra` (`src/mastra/index.ts` com `PostgresStore` no schema `mastra`, `PinoLogger`, `Observability`; `src/env.ts`; `Dockerfile` `node:26-alpine` com pnpm via npm, `MASTRA_HOST=0.0.0.0`)
- Create: `docs/plans/2026-09-29-sp0-app-foundation/reports/spike-mastra.md`

- [ ] Steps: read → `pnpm -F mastra dev` (Studio 4111) → `docker build`/`run -p 8081:8081` → registrar → progress → commit `feat(mastra): scaffold mastra server with postgres storage`

**Verify:** `curl -s localhost:4111/health` → 200; imagem sobe; `framework-ok`.

### Task 9: `app/apps/functions` — Functions Gen 2 (nodejs24)

**Contexts:** `@.contexts/engineering/stacks/backend/firebase-functions.md`, ADR 0004 (E1)

**Files:**
- Create: `app/apps/functions` (`engines >=24.0.0 <25`, `src/index.ts` com `onRequest` `healthz`); Modify: `app/firebase.json` (`functions.source`, `runtime: nodejs24`)
- Test: `app/apps/functions/src/healthz.test.ts` via `firebase emulators:exec --only functions`

- [ ] Steps: read → teste falhando → implementação → passa → progress → commit `feat(functions): scaffold gen2 functions on nodejs24`

**Verify:** teste passa no emulator; `framework-ok`.

### Task 10: `app/apps/desktop` — Tauri 2 + Vite + TanStack Router

**Contexts:** `@.contexts/engineering/stacks/frontend/react@19.md`, `@.contexts/engineering/rules/security.md`, docs oficiais v2.tauri.app, vite.dev, tanstack.com/router; spec §16.1

**Files:**
- Create: `app/apps/desktop` (Vite 8.3.1, React 19.3.0, TanStack Router; `src-tauri/` com CSP restritiva, capabilities mínimas, `rust-toolchain.toml` `1.98.1`; tela que chama `GET {API_URL}/v1/health`)
- Create: `docs/plans/2026-09-29-sp0-app-foundation/reports/spike-tauri.md`

- [ ] Steps: read → `pnpm -F desktop tauri dev` mostra `ok` → registrar → progress → commit `feat(desktop): scaffold tauri 2 shell with vite`

**Verify:** janela mostra `ok` com o web rodando; `framework-ok`.

### Task 11: `pnpm dev`, `seed:local` e CI

**Contexts:** `@.contexts/engineering/processes/environments.md` (§9), `@.contexts/engineering/rules/testing.md`

**Files:**
- Create: `app/scripts/dev.ts` (compose `--wait` + emulators com `--import/--export-on-exit .firebase-data` + `turbo run dev`), `app/scripts/seed-local.ts` (idempotente; `owner@demo.local` no Auth Emulator)
- Create: `.github/workflows/app-ci.yml` (`working-directory: app`; Node 26.10.0, pnpm 12.6.0, lint, typecheck, test em `firebase emulators:exec` com serviço pgvector, `contracts:check`, passo `git diff --quiet origin/main -- .contexts .claude`)
- Modify: `app/README.md` (setup local)

- [ ] Steps: read → scripts → `pnpm dev` sobe tudo → seed 2× sem erro → progress → commit `ci(app): add dev orchestration, local seed and ci pipeline`

**Verify:** Next 3000, Studio 4111, Emulator UI 4000, Postgres healthy; `pnpm lint && pnpm typecheck && pnpm test && pnpm contracts:check` verdes; `framework-ok`.

### Task 12: Spikes restantes e relatório do SP0

**Contexts:** spec §14 e §16

**Files:**
- Create: `docs/plans/2026-09-29-sp0-app-foundation/reports/sp0-summary.md`: provider Mastra próprio validando token do Auth Emulator + membership; App Hosting emulator × Next 16.3.7; peer `@mastra/evals` (E4); FCM/App Check no Tauri; lacunas de versão novas

- [ ] Steps: executar → registrar evidência → progress → commit `docs(app): record sp0 spike results`

**Verify:** relatório com cada item, fonte/comando e conclusão; `framework-ok`.

---

## Self-review

- Spec §13 SP0 → Tasks 0–12, todas em `app/` ou `docs/plans/`.
- Nenhuma task cita contexto inexistente na `main` (decisões novas apontam para a spec §16).
- Framework protegido por verify em toda task e por passo no CI.

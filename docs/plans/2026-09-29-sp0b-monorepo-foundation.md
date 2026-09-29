# SP0b — Fundação do monorepo: implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. Prefer subagent-per-task
> with templates in `writing-plans-ddc` (implementer + task-reviewer). Track progress in
> `.claude/agent-memory/progress.md`. **Pré-requisito:** SP0a concluído (ADRs 0006–0013).

**Goal:** monorepo vazio porém funcional: toolchain, config compartilhada, contratos
com registry/catálogo, Firebase Emulator Suite + Postgres/pgvector, esqueletos dos
quatro apps e `pnpm dev` subindo tudo localmente, com CI verde.

**Architecture:** pnpm workspaces + Turborepo na raiz, sem mover `.contexts/`/`.claude/`.
Layout e fronteiras conforme `@.contexts/engineering/architecture/monorepo.md` (SP0a Task 2).
Nenhuma regra de negócio; apenas health checks e o contrato de catálogo.

**Tech Stack (medido 2026-09-29):** Node 26.10.0 (Functions `nodejs24`, E1), pnpm 12.6.0,
turbo 2.11.5, TypeScript 7.0.2 (+ `@typescript/typescript6@6.0.2` só para lint, E2),
ESLint 9.39.5 (E3), `eslint-plugin-boundaries` 7.2.0, Next 16.3.7, React 19.3.0,
Zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0, firebase-tools 15.32.0, firebase 12.19.0,
firebase-admin 14.5.0, firebase-functions 7.4.0, `@firebase/rules-unit-testing` 5.0.2,
`@mastra/core` 1.71.0, `mastra` 1.31.3, `@mastra/pg` 1.27.1, `@mastra/loggers` 1.3.2,
`@mastra/observability` 1.18.1, `@tauri-apps/cli`/`api` 2.12.0, vite 8.3.1,
`@tanstack/react-router` 1.170.40, drizzle-orm 0.45.3, Postgres 18.6 +
`pgvector/pgvector:0.8.6-pg18`, Rust 1.95 (estável local), Java 21 (emulators).

## Global Constraints

- Pins exatos (sem `^`) em todo `package.json`; fora do `latest` só com linha no ADR 0004.
- `engines.node` `>=26.0.0 <27` na raiz e pacotes; `apps/functions` `>=24.0.0 <25` (E1); `apps/web` `>=24.0.0 <27` + `@types/node@24` (E6 provisória).
- tsconfig canônico de `@.contexts/engineering/stacks/language/typescript@7.md` (§ "tsconfig canônico");
  libs/Functions em `nodenext`; `.pnpmfile.cjs` com hook TS 6 (mesmo doc).
- Env: `src/env.ts` Zod por app, falha no boot (`@.contexts/engineering/contracts/secrets.md` §5.4,
  rule `environments`); `.env.example` completo; `.env.local` gitignored.
- Erros HTTP no envelope `@.contexts/engineering/contracts/api.md` §6; logs JSON
  (`@.contexts/engineering/rules/observability.md`).
- Local nunca aponta para projeto remoto (`@.contexts/engineering/processes/environments.md` §9).
- Arquivos ≤ 500 linhas, funções ≤ 50, named exports (rule `ai-friendly-code`).
- Commits Conventional com scopes `repo`, `config`, `contracts`, `firebase`, `web`,
  `desktop`, `mastra`, `functions`, `ci`.

---

### Task 0: Spike — Next 16.3.7 no Firebase App Hosting (bloqueante da topologia)

**Contexts:** `@.contexts/engineering/decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md` (critérios de saída do spike e fallback), `@.contexts/engineering/stacks/backend/firebase-platform.md`, `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md` (E6 provisória)

**Files:**
- Create: `spikes/app-hosting-next16/` (app Next 16.3.7 mínimo, descartável, fora de `apps/`): 1 página com Cache Components, 1 rota ISR, 1 Route Handler SSE longo, `apphosting.yaml` com `runConfig` e engines `>=24.0.0 <27`
- Create: `docs/plans/2026-09-29-sp0b-monorepo-foundation/reports/spike-app-hosting.md`

- [ ] Step 1: Read contexts (critérios da ADR 0009)
- [ ] Step 2: **Pedir ao usuário** um projeto Firebase de sandbox (não `demo-*`, não prod) e autorização para deploy nele
- [ ] Step 3: Deploy via App Hosting; medir cada critério da ADR 0009 (build com `@apphosting/adapter-nextjs`, Cache Components + ISR, SSE ≥ 10 min, 2h de carga de prerender sem OOM/restart, cold start)
- [ ] Step 4: Relatório com evidência (logs, métricas, prints do console) e veredito PASS/FAIL
- [ ] Step 5: FAIL → parar e escalar ao usuário (fallback Cloud Run standalone muda ADR 0009/E6); PASS → seguir para Task 1
- [ ] Step 6: Remover recursos do sandbox; ledger; commit `docs(contexts): record app hosting next 16 spike` (o código do spike não entra em `main`: apagar `spikes/` antes do PR)

**Verify:** relatório com os 5 critérios, cada um com evidência e PASS/FAIL.

### Task 1: Toolchain local e raiz do workspace

**Contexts:** `@.contexts/engineering/stacks/runtime/node@26.md`, `@.contexts/engineering/stacks/language/typescript@7.md`,
`@.contexts/engineering/processes/git.md` (§20), `@.contexts/engineering/architecture/monorepo.md`

**Files:**
- Create: `.nvmrc` (`26.10.0`), `package.json` (raiz, `private`, `packageManager: "pnpm@12.6.0"`,
  `engines`, scripts `dev|build|lint|typecheck|test|test:e2e|contracts:catalog|contracts:check|seed:local`
  delegando para `turbo run`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `modules/*` + `catalog:` com todas as dependências compartilhadas, ver `architecture/monorepo.md`),
  `turbo.json` (tasks com `dependsOn` e `outputs`), `.pnpmfile.cjs`, `.npmrc`
- Modify: `.gitignore` (`node_modules`, `.turbo`, `.next`, `dist`, `.tscache`, `.env.local`,
  `.firebase-data`, `src-tauri/target`, `.mastra`)

- [ ] Step 1: Read contexts
- [ ] Step 2: **Pedir ao usuário** para instalar Node 26.10.0 (local está em 24.15.0) e `npm i -g pnpm@12.6.0`; confirmar com `node -v` / `pnpm -v`
- [ ] Step 3: Criar arquivos; `pnpm install` sem erros
- [ ] Step 4: Ledger + commit `build(repo): bootstrap pnpm and turborepo workspace`

**Verify:** `node -v` → `v26.10.0`; `pnpm -v` → `12.6.0`; `pnpm turbo run lint --dry-run` lista zero tasks sem erro.

### Task 2: `packages/config` — tsconfig, ESLint 9 com fronteiras, Vitest

**Contexts:** `@.contexts/engineering/stacks/language/typescript@7.md`, `@.contexts/engineering/stacks/testing/vitest.md`,
`@.contexts/engineering/rules/development.md`, `@.contexts/engineering/architecture/monorepo.md`

**Files:**
- Create: `packages/config/package.json` (`@core/config`)
- Create: `packages/config/tsconfig/{base,bundler,nodenext}.json`
- Create: `packages/config/eslint/index.js` (flat config; `eslint-plugin-boundaries` com elementos
  `app`, `client`, `contracts`, `services`, `agents`, `i18n`, `module`; regras: `client` ↛ `services|agents`,
  `services|agents` ↛ `client`, `contracts` ↛ qualquer interno, `app` só compõe)
- Create: `packages/config/vitest/preset.ts`
- Test: `packages/config/eslint/boundaries.test.ts` (roda ESLint em fixtures `fixtures/client-imports-services.ts` → espera erro `boundaries/dependencies`; `fixtures/client-imports-contracts.ts` → sem erro)

- [ ] Steps: read → teste falhando → config → teste passa → `pnpm -F @core/config test` → ledger → commit `build(config): add shared tsconfig, eslint boundaries and vitest preset`

**Verify:** `pnpm -F @core/config test` → 2 passed.

### Task 3: `packages/contracts` — primitivos e registry de metadados (TDD)

**Contexts:** `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/contracts/data-catalog.md`,
`@.contexts/engineering/stacks/validation/zod@4.md`, `@.contexts/engineering/rules/data-modeling.md`,
`@.contexts/engineering/decisions/0005-firestore-document-ids-use-automatic-ids.md`

**Files:**
- Create: `packages/contracts/package.json` (`@core/contracts`, dep `zod: catalog:` — versão 4.6.5 declarada uma vez no `catalog` do `pnpm-workspace.yaml`)
- Create: `packages/contracts/src/contracts/primitives/{ids,money,locale,time-zone,iso-datetime}.schema.ts`
- Create: `packages/contracts/src/contracts/primitives/catalog-meta.schema.ts` — `CatalogMetaSchema`
  (`id`, `description` obrigatório, `examples?`, `pii: none|personal|sensitive`,
  `tenancyScope: platform|org|project|unit`, `relations?`, `ui?`)
- Create: `packages/contracts/src/contracts/registry.ts` — `contractRegistry = z.registry<CatalogMeta>()` + `defineContract(schema, meta)` que valida meta com `CatalogMetaSchema.parse`
- Test: `packages/contracts/src/contracts/primitives/money.schema.test.ts`, `registry.test.ts`

```ts
// money.schema.test.ts (exemplo de caso)
it("rejects non-integer amountMinor", () => {
  expect(MoneySchema.safeParse({ amountMinor: 12.5, currency: "BRL" }).success).toBe(false);
});
it("rejects lowercase currency", () => {
  expect(MoneySchema.safeParse({ amountMinor: 1290, currency: "brl" }).success).toBe(false);
});
// registry.test.ts
it("rejects a contract without description", () => {
  expect(() => defineContract(z.object({}), { id: "x.Y", pii: "none", tenancyScope: "org" } as never)).toThrow();
});
```

- [ ] Steps: read → testes falhando → implementação mínima → passa + `tsc --noEmit` → ledger → commit `feat(contracts): add primitives and catalog metadata registry`

**Verify:** `pnpm -F @core/contracts test && pnpm -F @core/contracts typecheck` → verde.

### Task 4: Gerador `contracts:catalog` e gate `contracts:check`

**Contexts:** `@.contexts/engineering/contracts/data-catalog.md`, `@.contexts/engineering/contracts/api.md` (§15)

**Files:**
- Create: `packages/contracts/scripts/build-catalog.ts` (lê `contractRegistry`, emite `docs/catalog/catalog.json`, `docs/catalog/<ctx>/<entity>.md` e JSON Schema via `z.toJSONSchema`)
- Create: `packages/contracts/scripts/check-catalog.ts` (regera em memória, compara com disco; falha se diferente, se campo sem `description` ou sem `pii`)
- Create: `packages/contracts/src/contracts/example/note.schema.ts` (contrato de exemplo neutro, removível)
- Test: `packages/contracts/scripts/build-catalog.test.ts` (catálogo do exemplo contém `id`, campos, `pii`; `check` falha quando um campo perde `description`)

- [ ] Steps: read → testes falhando → scripts → passa → `pnpm contracts:catalog` gera `docs/catalog/**` → ledger → commit `feat(contracts): generate and check data catalog`

**Verify:** `pnpm contracts:catalog && pnpm contracts:check` → exit 0; `git status docs/catalog` mostra arquivos gerados.

### Task 5: Firebase — `firebase.json`, Rules deny-by-default, Emulator Suite

**Contexts:** `@.contexts/engineering/stacks/backend/firebase-platform.md`, `@.contexts/engineering/stacks/database/firebase-firestore.md`,
`@.contexts/engineering/contracts/firebase-firestore.md`, `@.contexts/engineering/rules/tenancy.md`

**Files:**
- Create: `firebase.json` (emulators `auth` 9099, `firestore` 8080, `functions` 5001, `storage` 9199, `pubsub` 8085, `eventarc` 9299, `ui` 4000, `singleProjectMode: true`), `.firebaserc` (`demo-core` — prefixo `demo-` garante zero acesso remoto)
- Create: `firestore.rules` (deny all por padrão; D8), `firestore.indexes.json` (vazio), `storage.rules` (deny all)
- Create: `packages/services/package.json` (`@core/services`) + `packages/services/src/services/shared/firebase-rules.test.ts` usando `@firebase/rules-unit-testing` (leitura e escrita negadas para usuário autenticado sem grant)

- [ ] Steps: read → teste falhando (sem rules) → rules → `firebase emulators:exec --only firestore,storage "pnpm -F @core/services test"` passa → ledger → commit `build(firebase): add emulator suite and deny-by-default rules`

**Verify:** comando acima → testes passed; `firebase emulators:start` sobe UI em `localhost:4000`.

### Task 6: Postgres + pgvector local e env tipado

**Contexts:** `@.contexts/engineering/stacks/database/postgres.md`, `@.contexts/engineering/stacks/database/pgvector.md`,
`@.contexts/engineering/contracts/pgvector.md`, `@.contexts/engineering/contracts/secrets.md` (§5.4), rule `environments`

**Files:**
- Create: `docker-compose.yml` (serviço `postgres` com `pgvector/pgvector:0.8.6-pg18`, healthcheck `pg_isready`, volume nomeado)
- Create: `infra/postgres/init/001-schemas.sql` (`CREATE EXTENSION IF NOT EXISTS vector; CREATE SCHEMA IF NOT EXISTS mastra; CREATE SCHEMA IF NOT EXISTS ai;`)
- Create: `.env.example` (todas as vars de todos os apps, com placeholders: `APP_ENV`, `DATABASE_URL`, `FIREBASE_*_EMULATOR_HOST`, `GCLOUD_PROJECT=demo-core`, `MASTRA_URL`, `AI_MODE`, chaves de provider)
- Test: `packages/services/src/services/shared/postgres-schemas.test.ts` (conecta em `DATABASE_URL`, confere extensão `vector` e schemas `mastra`/`ai`)

- [ ] Steps: read → teste falhando → compose/init → `docker compose up -d` → passa → ledger → commit `build(repo): add local postgres with pgvector`

**Verify:** `docker compose ps` healthy; teste passed.

### Task 7: `apps/web` — Next 16 com `/v1/health`

**Contexts:** `@.contexts/engineering/stacks/frontend/next@16.md`, `@.contexts/engineering/rules/api-design.md`,
`@.contexts/engineering/contracts/api.md` (§5, §6), `@.contexts/engineering/rules/observability.md`

**Files:**
- Create: `apps/web` (Next 16.3.7, React 19.3.0; `src/app/layout.tsx`, `src/app/(app)/page.tsx` placeholder via i18n key, `src/proxy.ts` atribuindo `x-request-id` ULID)
- Create: `apps/web/src/env.ts` (Zod)
- Create: `packages/services/src/services/platform/adapters/driving/health-route-handler.ts` + `apps/web/src/app/v1/health/route.ts` (re-export) → `200 { data: { status: "ok" } }`
- Test: `packages/services/src/services/platform/adapters/driving/health-route-handler.test.ts`

- [ ] Steps: read → teste falhando → implementação → passa → `pnpm -F web build` → ledger → commit `feat(web): scaffold next app with v1 health endpoint`

**Verify:** `pnpm -F web dev` + `curl -s localhost:3000/v1/health` → `{"data":{"status":"ok"}}`.

### Task 8: `apps/mastra` — servidor Mastra + Studio local (spike Docker)

**Contexts:** `@.contexts/engineering/stacks/ai/mastra-sdk.md`, `@.contexts/engineering/stacks/backend/cloud-run.md`,
`@.contexts/engineering/contracts/agents.md`, rule `ai-agents`

**Files:**
- Create: `apps/mastra/package.json` (`@mastra/core`, `mastra`, `@mastra/pg`, `@mastra/loggers`, `@mastra/observability`)
- Create: `apps/mastra/src/mastra/index.ts` (`new Mastra({ storage: new PostgresStore({ connectionString: env.DATABASE_URL, schemaName: "mastra" }), logger: new PinoLogger({ name: "mastra", level: "info" }), observability })`, sem agentes ainda)
- Create: `apps/mastra/src/env.ts`, `apps/mastra/Dockerfile` (`node:26-alpine`, `mastra build`, `node .mastra/output/index.mjs`)
- Create: `docs/plans/2026-09-29-sp0b-monorepo-foundation/reports/spike-mastra.md`

- [ ] Steps: read → `pnpm -F mastra dev` sobe Studio em 4111 → `docker build` e `docker run` respondem → registrar resultado (incl. se o hook TS 6 para `typescript-paths` foi necessário) → ledger → commit `feat(mastra): scaffold mastra server with postgres storage`

**Verify:** `curl -s localhost:4111/api` responde 200; imagem Docker sobe.

### Task 9: `apps/functions` — Functions Gen 2 (nodejs24)

**Contexts:** `@.contexts/engineering/stacks/backend/firebase-functions.md`, `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md` (E1)

**Files:**
- Create: `apps/functions/package.json` (`engines.node` `>=24.0.0 <25`, firebase-functions 7.4.0, firebase-admin 14.5.0), `tsconfig.json` (`nodenext`), `src/index.ts` com `onRequest` `healthz` e logger estruturado
- Modify: `firebase.json` (`functions.source: "apps/functions"`, `runtime: "nodejs24"`)
- Test: `apps/functions/src/healthz.test.ts` via `firebase emulators:exec --only functions`

- [ ] Steps: read → teste falhando → implementação → passa → ledger → commit `feat(functions): scaffold gen2 functions on nodejs24`

**Verify:** teste passed dentro do emulator.

### Task 10: `apps/desktop` — Tauri 2 + Vite (spike)

**Contexts:** `@.contexts/engineering/stacks/desktop/tauri@2.md`, `@.contexts/engineering/stacks/frontend/vite.md`,
`@.contexts/engineering/stacks/frontend/tanstack-router.md`

**Files:**
- Create: `apps/desktop` (Vite 8.3.1 + React 19.3.0 + TanStack Router; `src-tauri/` com `tauri.conf.json` CSP restritiva e capabilities mínimas; tela que chama `GET {API_URL}/v1/health` e mostra status)
- Create: `docs/plans/2026-09-29-sp0b-monorepo-foundation/reports/spike-tauri.md` (Windows ok? Android init ok? pnpm + TS 7 ok?)

- [ ] Steps: read → `pnpm -F desktop tauri dev` abre janela mostrando `ok` → registrar spike → ledger → commit `feat(desktop): scaffold tauri 2 shell with vite`

**Verify:** janela abre e mostra `ok` com web rodando; relatório escrito.

### Task 11: Orquestração `pnpm dev`, `seed:local` e CI

**Contexts:** `@.contexts/engineering/processes/environments.md` (§9), `@.contexts/engineering/processes/deploy.md`, rule `testing`

**Files:**
- Create: `scripts/dev.ts` (sobe `docker compose up -d --wait`, `firebase emulators:start --import .firebase-data --export-on-exit`, e `turbo run dev --filter=web --filter=mastra --filter=functions`; encerra tudo no SIGINT)
- Create: `scripts/seed-local.ts` (stub idempotente: cria projeto demo no Auth Emulator com 1 usuário `owner@demo.local`; SP1 expande)
- Create: `.github/workflows/ci.yml` (Node 26.10.0, pnpm 12.6.0, `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test` dentro de `firebase emulators:exec` com serviço Postgres pgvector, `contracts:check`)
- Create: `README.md` raiz (clonar tudo vs só `.contexts/`+`.claude/`; pré-requisitos; `pnpm dev`)

- [ ] Steps: read → scripts → `pnpm dev` sobe tudo → `pnpm seed:local` duas vezes sem erro (idempotente) → ledger → commit `ci(repo): add dev orchestration, local seed and ci pipeline`

**Verify:** `pnpm dev` → Next 3000, Studio 4111, Emulator UI 4000, Postgres healthy; `pnpm lint && pnpm typecheck && pnpm test && pnpm contracts:check` verdes.

### Task 12: Spikes pendentes e relatório do SP0

**Contexts:** spec §14; `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`

**Files:**
- Create: `docs/plans/2026-09-29-sp0b-monorepo-foundation/reports/sp0-summary.md` com resultado de:
  App Hosting emulator × Next 16.3.7 (produção já coberta pela Task 0); `MastraAuthProvider` próprio (ADR 0010) validando token do Auth Emulator e membership
  (script mínimo); peer `@mastra/evals` (E4); FCM/App Check no Tauri (pesquisa documentada);
  versões novas que exigirem exceção → linha E7+ no ADR 0004 (E6 = App Hosting nodejs24)

- [ ] Steps: executar cada spike → registrar evidência → ledger → commit `docs(contexts): record sp0 spike results`

**Verify:** relatório com 5 itens, cada um com comando/fonte e conclusão.

---

## Self-review

- Spec §13 SP0 (monorepo, config, emuladores + compose, env Zod, contracts registry/catalog/check, spikes) → Tasks 1–12.
- Pins batem com a medição de 2026-09-29 e MEMORY após SP0a Task 1.
- Node local 24.15.0 ≠ baseline → Task 1 Step 2 bloqueia até o usuário instalar.

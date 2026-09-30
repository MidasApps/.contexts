# Agentic app core

Generic boilerplate for agentic applications: a pnpm + Turborepo workspace with
shared config, typed contracts, backend services and thin app shells. It carries
no business rules; a derived application adds its own bounded contexts as modules.

Audience: developers starting a new agentic app from this core, and agents working
in it (their guidance lives in the DDC framework, see below).

## Framework is read-only

`../.contexts` (single source of truth for engineering, product and business
doctrine) and `../.claude` (rules, skills, agents and hooks that operationalize it)
are the DDC framework. This workspace follows them and never edits them; CI fails
when a change touches them (`.github/workflows/app-ci.yml`).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 26.10.0 (`.nvmrc`) | runtime and scripts (native type stripping) |
| pnpm | 12.6.0 (`packageManager`) | `npm install -g pnpm@12.6.0` (no corepack on Node 25+) |
| Docker | with Compose v2 | Postgres + pgvector (`docker-compose.yml`) |
| Java | 21 | Firestore and Pub/Sub emulators |
| Rust | via rustup (the desktop app pins 1.98.1 in `rust-toolchain.toml`) | desktop only |

## Local setup

Run from `app/`:

```bash
pnpm install
cp .env.example .env.local   # placeholders only; local never targets a remote project
pnpm dev                     # Postgres, Emulator Suite, Functions watch, web, Mastra
pnpm seed:local              # in another terminal, while `pnpm dev` runs
```

`pnpm dev` (`scripts/dev.ts`) runs, in order:

1. `docker compose --env-file .env.local up -d --wait` (Postgres healthy);
2. one Functions build, then an esbuild watch that rebuilds `apps/functions/lib`;
3. `firebase emulators:start --project demo-core --import .firebase-data --export-on-exit .firebase-data`
   (`--import` only once `.firebase-data/` exists);
4. `turbo run dev` for web and Mastra, once the emulators have loaded the functions.

Ctrl+C stops everything: the emulators export their data to `.firebase-data/`, and
any process still running after 30 s is killed with its children. Press Ctrl+C
twice to stop at once. Postgres keeps running (`docker compose stop` stops it).
The desktop app is opt-in because Rust builds take minutes: `pnpm dev:desktop`.

`pnpm seed:local` (`scripts/seed-local.ts`) is idempotent and refuses to run
unless `APP_ENV=local`, `FIREBASE_PROJECT_ID` is a `demo-*` project and
`FIREBASE_AUTH_EMULATOR_HOST` is a loopback address. It creates or resets
`owner@demo.local` in the Auth Emulator, with password `SEED_OWNER_PASSWORD` or
the local-only default `demo-owner-password`. Organizations, projects and roles
arrive with SP1 (`scripts/src/seed/seed-steps.ts` is the extension point).

### Ports

| Service | Port | Set by |
|---|---|---|
| Web (`next dev`) | 3000 | `WEB_PORT` (e.g. `WEB_PORT=3100 pnpm dev`) |
| Mastra API + Studio | 4111 | `PORT` (Mastra's own) |
| Emulator UI | 4000 | `firebase.json` |
| Auth emulator | 9099 | `firebase.json` |
| Firestore emulator | 8080 | `firebase.json` |
| Functions emulator | 5001 | `firebase.json` |
| Storage emulator | 9199 | `firebase.json` |
| Pub/Sub emulator | 8085 | `firebase.json` |
| Postgres | 5432 | `POSTGRES_PORT` (keep `DATABASE_URL` in sync) |
| Desktop Vite dev server | 1420 | `apps/desktop` |

Health checks: `GET /v1/health` (web), `GET /health` (Mastra),
`GET /demo-core/southamerica-east1/healthz` (Functions emulator).

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test              # unit tests, no external service
pnpm test:emulators    # *.emulator.test.ts inside `firebase emulators:exec` (needs Java 21)
pnpm test:postgres     # *.postgres.test.ts; needs `docker compose up -d --wait`
pnpm contracts:check   # the generated catalog matches the contracts
```

The file suffix says what a test needs (`.test.ts`, `.emulator.test.ts`,
`.postgres.test.ts`); see `.contexts/engineering/rules/testing.md`.
CI runs all of them (`.github/workflows/app-ci.yml`).

## Contracts and data catalog

Contracts are Zod schemas with catalog meta in `packages/contracts`. Generated
artifacts live in `docs/catalog/` (`catalog.json`, `catalog.ai.json`, one Markdown
page and JSON Schema per contract) and `docs/openapi/v1.yaml`:

```bash
pnpm contracts:catalog   # regenerate after changing a contract, then commit
pnpm contracts:check     # fails on drift, missing field meta or dangling relations
```

`catalog.ai.json` never contains `sensitive` data and redacts `personal` examples
(decision `docs/decisions/0005-contract-pii-semantics.md`).

## Layout

```
app/
  apps/
    web/        Next 16: routing only; /v1 re-exports driving adapters
    desktop/    Tauri 2 + Vite + React 19 shell
    mastra/     Mastra server and Studio
    functions/  Firebase Functions Gen 2 (nodejs24, ADR 0004 E1)
  packages/
    config/     shared tsconfig presets, ESLint flat config, Vitest preset
    contracts/  Zod primitives, contract registry and data catalog
    services/   hexagonal backend (env, logging, HTTP boundary, health)
  scripts/      `pnpm dev` and `pnpm seed:local` (@core/scripts)
  infra/        local Postgres init scripts
  docs/         decisions, generated catalog and OpenAPI
```

`packages/client`, `packages/agents`, `packages/i18n` and `modules/` are planned
(spec §3) and do not exist yet. Import boundaries are already enforced by
`eslint-plugin-boundaries` (`packages/config/eslint/boundaries.js`): apps only
compose; `client` does not import `services` or `agents`; `services` and `agents`
do not import `client`; `agents` reach `services` only through use cases;
`contracts` depends on nothing.

## Starting a new app from this core

1. Clone the repository (framework and `app/` together), or copy only
   `.contexts/` + `.claude/` to start from the harness alone.
2. Optionally rename the `@core/*` package scope (package names, imports and
   `--filter` arguments), and set your own identifiers: the desktop
   `identifier` in `apps/desktop/src-tauri/tauri.conf.json` and the Firebase
   project ids for remote environments (local stays `demo-*`).
3. Keep `.contexts/` and `.claude/` read-only; record app decisions in
   `docs/decisions/`.
4. Business capabilities will plug in as modules under `modules/` through
   `defineModule()`, which arrives in SP2. Until then there is no module API.

## Decisions and plans

- App decisions: `docs/decisions/` (0001 OpenAPI generation, 0002 process log
  context, 0003 public liveness endpoint, 0004 Functions env files, 0005 contract
  pii semantics, 0006 tenancy and access model, 0007 authentication sessions,
  0008 API keys and device activation, 0009 rate limiting and idempotency store,
  0010 dependency audit advisories).
- Framework ADRs: `../.contexts/engineering/decisions/`.
- Design spec: `../docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`.
- SP0 plan, reports and follow-ups: `../docs/plans/2026-09-29-sp0-app-foundation/`.

Per-app details: `apps/web/README.md`, `apps/mastra/README.md`,
`apps/functions/README.md`, `apps/desktop/README.md`.

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
   (`--import` only once `.firebase-data/` exists), with `FUNCTIONS_DISCOVERY_TIMEOUT=180`
   unless the shell sets another value: the CLI's 10 s default is too short for the Functions
   emulator to load `lib/` on a busy machine, and a timed-out load serves no function (uploads
   then stay "pending");
4. `turbo run dev` for web and Mastra, once the emulators have loaded the functions.

Ctrl+C stops everything: the emulators export their data to `.firebase-data/`, and
any process still running after 30 s is killed with its children. Press Ctrl+C
twice to stop at once. Postgres keeps running (`docker compose stop` stops it).
The desktop app is opt-in because Rust builds take minutes: `pnpm dev:desktop`.

`pnpm seed:local` (`scripts/seed-local.ts`) is idempotent and refuses to run
unless `APP_ENV=local`, `FIREBASE_PROJECT_ID` is a `demo-*` project and both
`FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST` are loopback
addresses. It writes through the core services (`createCoreServer`), so
projections, claims and audit entries stay consistent, and a second run reports
`unchanged` for every Firestore step (accounts are reset to their passwords).
Steps: `scripts/src/seed/seed-steps.ts`.

| Account | Access | Password (`.env.local`, else the local default) |
|---|---|---|
| `owner@demo.local` | owner of "Demo Organization" (active) and "Second Organization" | `SEED_OWNER_PASSWORD` / `demo-owner-password` |
| `member@demo.local` | `member` on "Project 1" of the demo organization (active organization: the demo one; decision 0030 A5) | `SEED_MEMBER_PASSWORD` / `demo-member-password` |
| `viewer@demo.local` | `viewer` on the demo organization (active) | `SEED_VIEWER_PASSWORD` / `demo-viewer-password` |
| `invitee@demo.local` | no membership (accepts an invitation in the SP2 e2e) | `SEED_INVITEE_PASSWORD` / `demo-invitee-password` |
| `staff@demo.local` | platform staff `platform-admin`, SMS factor `+15555550100` | `SEED_STAFF_PASSWORD` / `demo-staff-password` |

The demo organization has "Project 1" and "Project 2"; the second has "Project 1".
"Project 1" of the demo organization holds "Unit A" and, under it, "Unit A.1",
of the core's neutral unit type `core.unit`, which every app registers, so these
units can be renamed and moved (decision 0030 A6). The knowledge base samples go
to the demo organization.

### Identity, tenancy and access (SP1)

- Contexts in `packages/services/src/services/`: `identity` (principals, `/v1/me`,
  sessions, API keys, devices, platform staff and impersonation), `tenancy`
  (organizations, projects, units, regional settings), `access` (`authorize()`,
  memberships, roles, projections and claims, invitations, approvals) and `audit`.
  Model: `docs/decisions/0006-tenancy-and-access-model.md`.
- Endpoints: every `/v1` route is listed in `docs/openapi/v1.yaml` (generated from
  the endpoint descriptors in `@core/contracts`). `/v1` accepts only
  `Authorization: Bearer` (decision 0007).
- Firestore Security Rules (`firestore.rules`) are defense in depth: clients never
  write, and read only their own `users` doc, their access projection of the active
  organization, and the organization, projects and units it makes visible.
- Platform staff: `pnpm platform:grant-staff -- --project <id> --email <email> --role
  <platform-admin|platform-support> --confirm <id>` (local: a `demo-*` project and the
  emulators). Staff routes need MFA; locally MFA is SMS, because the Auth Emulator has
  no TOTP: sign in, then read the code from the emulator's `verificationCodes`
  (Emulator UI or `GET /emulator/v1/projects/demo-core/verificationCodes`).
- Staff user search (decision 0044): names are found through the storage-only
  `users.searchName`. After deploying it, run once per environment
  `pnpm users:backfill-search-names -- --project <id> --confirm <id>` (add `--dry-run`
  to count first; idempotent, resumes with `--start-after <uid>`).
- Rate limits (Firestore buckets, decision 0009): device redeem 5 failures / 15 min
  per IP; API key failures 20 / min per IP; desktop exchange 10 / min per IP;
  active-organization switch and claims sync 10 / min per principal; invitation
  preview and accept 20 / min per principal. A refusal is `429` with `Retry-After`.

### Agent runtime (SP3)

- `packages/agents` (`@core/agents`) holds the runtime; `apps/mastra` composes it with the
  app's modules and serves it privately (Cloud Run); `/v1` reaches it only through the
  `MastraGateway` (decisions 0019–0029).
- `AI_MODE=fake` (default in `.env.example` for local) runs agents, tools, memory,
  knowledge, guardrails and evals offline with scripted models; `AI_MODE=real` needs the
  provider keys of the `AI_MODEL_*` roles.
- Agents: `assistant` (supervisor, the only entry) delegates to `knowledge`, `data`,
  `action` and `web`. A module adds tools, commands (mutations with approval), agents and
  skills and workflows with one entry in `apps/mastra/src/modules.ts` (manifest, command
  factory, `defineAgentModule(...)` factory; `modules/example` is the reference); see
  `packages/agents/README.md` ("How to add a capability from a module").
- Evals: `pnpm evals` (fake models, CI gate against `packages/agents/evals/baselines`),
  `pnpm evals:real` (real providers, opt-in), `pnpm evals:seed` (Mastra datasets).
  Reports land in `app/.evals/`.
- `pnpm test:emulators` includes the SP3 gate suite
  (`apps/mastra/src/mastra/sp3-gate.emulator.test.ts`), which also needs Postgres
  (`docker compose up -d --wait` and `pnpm db:migrate`).
- Gate evidence: `../docs/plans/2026-09-29-sp3-agentic-runtime/reports/sp3-gate.md`.

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
| e2e: web / desktop preview | 3100 / 1420 | `E2E_WEB_PORT` / `E2E_DESKTOP_PORT` (`pnpm test:e2e`) |
| e2e: Auth / Firestore emulators | 9391 / 8391 | `firebase.e2e.json` |

Health checks: `GET /v1/health` (web), `GET /health` (Mastra),
`GET /demo-core/southamerica-east1/healthz` (Functions emulator).

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test              # unit and component tests (jsdom + axe), no external service
pnpm test:emulators    # *.emulator.test.ts inside `firebase emulators:exec` (needs Java 21)
pnpm test:postgres     # *.postgres.test.ts; needs `docker compose up -d --wait`
pnpm contracts:check   # the generated catalog matches the contracts
pnpm i18n:check        # every message key in pt-BR, en-US and es-419, valid ICU
pnpm test:e2e          # Playwright journeys on their own emulator stack (see below)
```

The file suffix says what a test needs (`.test.ts`, `.emulator.test.ts`,
`.postgres.test.ts`, Playwright `e2e/*.spec.ts`); see
`.contexts/engineering/rules/testing.md`. CI runs all of them
(`.github/workflows/app-ci.yml`), plus `desktop-check` (desktop `vite build` and
`cargo check --locked` on Linux).

### End-to-end (Playwright)

`pnpm test:e2e` (`scripts/e2e.ts`) starts the Auth and Firestore emulators of
`firebase.e2e.json` (project `demo-core-e2e`, ports apart from `pnpm dev`, so both
can run at once), builds web and desktop with the e2e public config and runs:

- `apps/web/e2e/*.spec.ts` on chromium, firefox, webkit and a phone (Pixel 7):
  sign-in, organization/project switching, profile, settings, `/admin` (staff with
  SMS MFA from the emulator) and axe (WCAG 2.2 AA) on every page, light and dark;
- `apps/desktop/e2e/` (`desktop-web`): the desktop frontend served by `vite preview`.

The setup project seeds its own world (`packages/e2e/src/seed-users.ts`, same
`owner@demo.local` and `member@demo.local` accounts as `pnpm seed:local`). Ports:
`E2E_WEB_PORT` (default 3100) and `E2E_DESKTOP_PORT` (default 1420).
`pnpm test:e2e -- <command>` runs another command inside the same stack, e.g.
`pnpm test:e2e -- pnpm -F @core/web exec playwright test e2e/auth.spec.ts`.
Browsers once: `pnpm -F @core/web exec playwright install chromium firefox webkit`.

### Native desktop smoke (local only)

`pnpm -F @core/desktop test:native` drives the real Tauri window with WebdriverIO
and `@wdio/tauri-service` (decision 0017 §4): it signs in as `owner@demo.local`
and checks the user area. It needs a debug build of the app and the e2e stack;
see `apps/desktop/README.md`. It is evidence gathered per release, not a CI gate.

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
    web/        Next 16: locale routes of the user area and /admin, /v1 route files
                (re-export driving adapters), proxy (request id, CORS, locale, CSP)
    desktop/    Tauri 2 + Vite + TanStack Router: the same user area, OS keychain session
    mastra/     Mastra server and Studio
    functions/  Firebase Functions Gen 2 (nodejs24, ADR 0004 E1)
  packages/
    config/     shared tsconfig presets, ESLint flat config (+ import boundaries), Vitest preset
    contracts/  Zod primitives, endpoint descriptors, defineModule(), data catalog
    services/   hexagonal backend: identity, tenancy, access, audit, files, knowledge, ...
    agents/     agent runtime (Mastra agents, tools, workflows, guardrails)
    client/     @core/client: shared FSD client for web and desktop, Atomic UI kit
    i18n/       @core/i18n: locales, negotiation, money/time formatters, message catalogs
    e2e/        @core/e2e: Playwright harness shared by the web and desktop e2e runs
  modules/
    example/    reference module: manifest, settings contract, client pages, messages
  scripts/      `pnpm dev`, `pnpm seed:local`, `pnpm test:e2e` (@core/scripts)
  infra/        local Postgres init scripts and migrations
  docs/         decisions, generated catalog and OpenAPI
```

Import boundaries are enforced by `eslint-plugin-boundaries`
(`packages/config/eslint/boundaries.js`): apps only compose; `client` imports only
`contracts` and `i18n`; `services` and `agents` do not import `client`; `agents`
reach `services` only through use cases; `contracts` depends on nothing; no core
package imports a module (apps list the installed modules).

## Client, UI and modules (SP2)

- **`@core/client`** (`packages/client/src`, decision 0011): FSD layers `app-shell`
  (providers, module registry, navigation, session), `views` (one per page), `widgets`
  (sidebar, topbar, switchers, command palette), `features`, `entities` and `shared`
  (`shared/ui` is the Atomic kit: shadcn new-york on Radix + Tailwind 4 with the
  `.design-system` tokens, decision 0014). Server state lives in TanStack Query over
  `/v1` (Bearer); product mutations never use Server Actions. The apps implement the
  ports (`router`, `session-bridge`, `secure-store`, `platform`) and pass them to
  `createClientApp`; views never import `next/*` or `@tanstack/*` (decision 0012).
  Every component has a colocated `*.test.tsx` that also runs axe.
- **Routes** (one map, `shared/lib/router/route-paths.ts`): `/sign-in`, `/invite`,
  `/organizations`, `/o/:organizationId[/p/:projectId[/m/:moduleId/*]]`,
  `/o/:organizationId/settings/:section`, `/profile/:section`; the web prefixes
  `/{locale}` and adds `/admin` (platform staff with MFA). A member whose only grant
  is on a project lands on that project when they open the organization
  (decision 0030 A5).
- **Desktop session** (decision 0017): the Firebase ID token stays in memory; a
  desktop session secret lives in the OS keychain (Windows Credential Manager, macOS
  Keychain, Secret Service) through the Tauri commands `secure_store_get|set|delete`,
  rotated on every start. Details in `apps/desktop/README.md`.

### i18n workflow

UI copy is never hard-coded (decision 0013). Core messages live in
`packages/i18n/src/messages/<locale>/<namespace>.json`; `pt-BR` is the source,
`en-US` and `es-419` must have the same keys and ICU placeholders. A module ships
its own `src/messages/<locale>.json` under its id as namespace. Add the key to the
three files, use it through `useTranslations("<namespace>")`, then run
`pnpm i18n:check` (CI gate). Money is `{ amountMinor, currency }` formatted with
`Intl`; dates are stored in UTC and shown in the display time zone of the node
(user, then project, then organization).

### Creating a module (copy `modules/example`)

1. **Package:** copy `modules/example` to `modules/<id>` and rename the package
   (`@core/module-<id>`); keep the `exports` (`./manifest`, `./contracts`,
   `./client`, `./server`, `./agents`). Modules may import `@core/contracts`,
   `@core/client` and the public API of `@core/services`, never another module or
   an app.
2. **Manifest** (`src/manifest.ts`, data only, decision 0015): `defineModule()` with
   the `id`, permissions (`<id>.<resource>.<action>` plus default roles), unit types,
   navigation items (slot `project` or `organization`, permission, order), the
   settings contract and the messages of the three locales. SP3 capabilities
   (agents, tools, workflows, skills) hang off the same manifest (`capabilities.ts`).
3. **Contracts** (`src/contracts/`): Zod schemas with `defineContract` catalog meta;
   the module settings page renders the settings contract with `SchemaForm`. `/v1`
   endpoints of the module are `defineEndpoint` descriptors with ids
   `<id>.<operation>`, listed in one array (`EXAMPLE_ENDPOINTS`, decision 0063).
4. **Server** (`src/server/`, optional): the use cases, their repositories, the
   agent commands (`createExampleCommands`) and the `/v1` handlers
   (`createExampleRoutes`, each wrapped in `withApiRoute` from `@core/services`).
5. **Client** (`src/client.ts`): `defineClientModule({ manifest, pages })`; `pages`
   maps the path after `/m/<id>/` to a lazily loaded page component (module pages
   need no route files in the apps). Pages read the module's endpoints through
   `useCallEndpoint` and `cursorListQuery` (`@core/client/shared/api`).
6. **Messages:** `src/messages/{pt-BR,en-US,es-419}.json`; `pnpm i18n:check`.
7. **Install it** in the composition files (the only places that name modules):
   `apps/web/src/modules.ts` (server manifests), `apps/web/src/client/modules.ts`
   and `apps/desktop/src/modules.ts` (client modules), `catalog.modules.ts`
   (contracts in the generated catalog, `endpoints` in the OpenAPI),
   `transpilePackages` in `apps/web/next.config.ts`, and the workspace dependency
   in each app's `package.json`. Tailwind already scans `modules/*/src`. A module
   with `/v1` endpoints also goes in `apps/web/src/server/modules.ts`
   (`createModuleRoutes`, `MODULE_ENDPOINT_IDS`) and gets one route file per path
   under `apps/web/src/app/v1/` (`export const GET = route("<id>.<operation>")`);
   its Firestore queries add their composite indexes to `firestore.indexes.json`.
8. **Verify:** `pnpm -F @core/module-<id> test`, `pnpm contracts:catalog` (commit the
   regenerated `docs/catalog` and `docs/openapi`), `pnpm lint && pnpm typecheck &&
   pnpm i18n:check`, and an e2e journey through its page when it has one.

## Starting a new app from this core

1. Clone the repository (framework and `app/` together), or copy only
   `.contexts/` + `.claude/` to start from the harness alone.
2. Optionally rename the `@core/*` package scope (package names, imports and
   `--filter` arguments), and set your own identifiers: the desktop
   `identifier` in `apps/desktop/src-tauri/tauri.conf.json` and the Firebase
   project ids for remote environments (local stays `demo-*`).
3. Keep `.contexts/` and `.claude/` read-only; record app decisions in
   `docs/decisions/`.
4. Business capabilities plug in as modules under `modules/` through
   `defineModule()` (see "Creating a module" above).

## Decisions and plans

- App decisions: `docs/decisions/` (0001 OpenAPI generation, 0002 process log
  context, 0003 public liveness endpoint, 0004 Functions env files, 0005 contract
  pii semantics, 0006 tenancy and access model, 0007 authentication sessions,
  0008 API keys and device activation, 0009 rate limiting and idempotency store,
  0010 dependency audit advisories, 0011 client data and rendering model,
  0012 routing and router port, 0013 i18n, money and time zone, 0014 UI kit
  shadcn atomic, 0015 module contract, 0016 web content security policy,
  0017 desktop session secure store and testing, 0018 mobile targets deferred,
  0019 agent runtime layout and request context, 0020 Firebase Mastra auth,
  0021 model roles and fake mode, 0022 knowledge base tables and embeddings,
  0023 Postgres migrations and Mastra storage init, 0024 semantic SQL guard,
  0025 agent command tools and approvals, 0026 guardrails, budgets and usage
  ledger, 0027 connectors, MCP and web tools, 0028 agent evals gate, 0029 agent
  memory and skills, 0030 SP1 review hardening).
- Framework ADRs: `../.contexts/engineering/decisions/`.
- Design spec: `../docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`.
- SP0 plan, reports and follow-ups: `../docs/plans/2026-09-29-sp0-app-foundation/`.
- SP2 plan, reports and gate: `../docs/plans/2026-09-29-sp2-app-shell-ui/`.

Per-app details: `apps/web/README.md`, `apps/mastra/README.md`,
`apps/functions/README.md`, `apps/desktop/README.md`.

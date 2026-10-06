# SP0: Task 8 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `f3ba6b3` fix(services): report unparsable database url instead of throwing
- `c51d5f3` feat(services): add loadServicesEnvWith to compose app env schemas
- `ce7fea7` feat(mastra): scaffold mastra server with postgres storage
- this report, `spike-mastra.md`, and the progress line go in a follow-up `docs(mastra)` commit

## Contexts read

- Skills: `.claude/skills/using-ddc/SKILL.md`, `.claude/skills/mastra-sdk/SKILL.md`, `.claude/skills/harness-engineering/SKILL.md`.
- Plan: header, Global Constraints, Task 8.
- Previous reports: tasks 1-2, 3-4, 5-6, 7.
- Spec: §7, §10, §11, §14, §16.1-16.3.
- Doctrine: `.contexts/engineering/stacks/ai/mastra-sdk.md`, the Mastra pins in `MEMORY.md`, and the always-on rules (observability, secrets §5.4 via the services env pattern).
- Mastra docs: I read the docs bundled with the installed packages, which point to mastra.ai (`@mastra/core/dist/docs/references/docs-server-overview.md`, `reference-logging-pino-logger.md`). I also checked facts directly in the installed `@mastra/deployer`, `@mastra/pg`, `@mastra/loggers` and `@mastra/observability` code and types (see `spike-mastra.md`).

## What was built

### `@core/services`

- `loadServicesEnvWith(appSchema, source)` composes the services env with an app-only Zod schema. It reports every invalid variable of both schemas in one `InvalidEnvError` and never includes values. It is exported from the index and has 3 tests.
- **Bug fix, found while writing those tests:** Zod 4 still ran the local-env `superRefine` after `DATABASE_URL` failed its field schema. `new URL("nope")` then threw a raw `TypeError` instead of `InvalidEnvError`. The fix is a `URL.canParse` guard, covered by a regression test.

### `app/apps/mastra` (`@core/mastra`; `pnpm -F mastra` selects it)

- engines `>=26.0.0 <27`. Scripts:
  - `dev`: `mastra dev --env ../../.env.local`, which loads the workspace env file;
  - `build`: `mastra build`, without Studio;
  - `start`, `lint`, `typecheck`, `test`.
- `src/mastra-env.schema.ts` builds `MastraOnlyEnvSchema` and composes it through `loadServicesEnvWith` into `loadMastraEnv` / `MastraEnv`. It adds these variables:

  | Variable | Default | Constraint |
  |---|---|---|
  | `MASTRA_HOST` | `localhost` | |
  | `PORT` | 4111 | coerced 1–65535 |
  | `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
  | `MASTRA_SERVER_TIMEOUT_MS` | 3 600 000 | ≤ 3 600 000 |

  `src/env.ts` exports `env = loadMastraEnv(process.env)`, the only reader of `process.env`.
- `src/mastra/mastra-options.ts` holds pure builders:
  - `buildStorageConfig`: `{ id, connectionString, schemaName: "mastra" }`.
  - `buildServerConfig`:
    - host, port and timeout come from the env;
    - `cors: false` outside local, with Mastra's default CORS in local;
    - `build` sets Swagger, OpenAPI and `apiReqLogs` off.
  - `buildLoggerOptions`: JSON pino with `message`, a level label, `service`, `env` and an ISO `timestamp`.
- `src/mastra/index.ts` has `export const mastra = new Mastra({ storage: PostgresStore, logger: PinoLogger, observability: Observability(MastraStorageExporter), server })`. It has no agents or workflows (SP3).
- Also created:
  - `Dockerfile`: `node:26-alpine`, multi-stage, pnpm through npm, non-root, port 8081, `MASTRA_HOST=0.0.0.0`.
  - `app/.dockerignore` at the build context (`app/`).
  - tsconfig (`nodenext` preset), ESLint (core preset, ignores `.mastra/**`), Vitest (core preset).

### Workspace

- Catalog additions: `@mastra/core` 1.71.0, `@mastra/loggers` 1.3.2, `@mastra/observability` 1.18.1, `@mastra/pg` 1.27.1, `mastra` 1.31.3.
- `allowBuilds.esbuild: false` (reason in the comment).
- `turbo.json` build outputs now include `.mastra/output/**`.
- `.env.example` gains `MASTRA_HOST`, `LOG_LEVEL` and `MASTRA_SERVER_TIMEOUT_MS`. `PORT` is deliberately left out of the shared file because `next dev` reads it too.

## TDD

- services red: `Cannot find module './load-services-env-with.ts'`; then `TypeError: Invalid URL` in 2 tests, which exposed the bug. Green: 8 files, 38 tests.
- mastra red: `Cannot find module './mastra-env.schema.ts'` in 2 files. Green: 2 files, 12 tests.

## Verify output

```
$ pnpm -F mastra dev
 mastra 1.31.3 ready in 8226 ms
 Studio: http://localhost:4111   API: http://localhost:4111/api
$ curl -s -w " %{http_code}" localhost:4111/health      -> {"success":true} 200
$ curl -s -o /dev/null -w "%{http_code}" localhost:4111/  -> 200 (Studio)
$ docker exec core-postgres-1 psql -U app -d app -tc "select table_schema, count(*) from information_schema.tables where table_name like 'mastra%' group by 1"
 mastra | 43
(dev server stopped)

$ pnpm -F mastra build   -> Build successful (.mastra/output, ~4.3 MB .mjs, 183 MB with node_modules)

$ docker build -f apps/mastra/Dockerfile -t core-mastra:sp0 .      (from app/) -> ok
$ docker run -d --rm --name core-mastra-sp0 -p 8081:8081 --network core_default \
    -e APP_ENV=local -e FIREBASE_PROJECT_ID=demo-core -e FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
    -e FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 -e DATABASE_URL=postgresql://app:app@postgres:5432/app core-mastra:sp0
$ curl -s -w " %{http_code}" localhost:8081/health  -> {"success":true} 200
$ docker exec core-mastra-sp0 id                     -> uid=1000(node)
# APP_ENV=staging run: /health 200; CORS preflight 404 with no access-control-* headers; /swagger-ui 404
# APP_ENV=prod with no vars: InvalidEnvError: invalid environment: FIREBASE_PROJECT_ID (INVALID_TYPE), DATABASE_URL (INVALID_TYPE)
(containers stopped; core-postgres-1 untouched)

$ cd app && pnpm turbo run lint typecheck test
 Tasks:    15 successful, 15 total
$ pnpm install --frozen-lockfile   -> Lockfile is up to date

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and notes

- **`PORT` instead of `MASTRA_PORT`:** Mastra and Cloud Run both read `PORT`, so a second variable would only add a mapping. The default is 4111.
- **Timeout of one hour:** it is configurable and capped at Cloud Run's request maximum. The reviewer may prefer a smaller default (for example 15 min).
- **Local CORS** stays at Mastra's default (`origin: '*'`) because the brief says "disabled outside local". Studio is same-origin, so `false` everywhere would probably also work. That was not tested.
- **Docker run DB host:** I joined the compose network (`postgres:5432`) rather than using `host.docker.internal`, which the services local-DB refinement rejects.
- **Observability** exports spans only to Mastra storage for now. OTLP to Cloud Trace is part of spec §10's tracing work.
- **`web-env.schema.ts`** still has its own copy of the composition logic that `loadServicesEnvWith` now provides. Switching web to the helper is a small follow-up; web was left untouched because Task 7 is under review.

## Concerns

1. `mastra build` adds `typescript@7.0.2` (27 MB native binary) to the runtime deps: it is in the deployer's `GLOBAL_EXTERNALS`. It is harmless but bloats the image, and I could not avoid it without patching the deployer.
2. `mastra build` runs its own `pnpm install` inside `.mastra/output`, so the Docker build stage needs registry access. It resolves only the exact versions the deployer writes, not our lockfile.
3. `PostgresStore` auto-creates 43 tables at boot. Remote environments should decide between runtime DDL and `disableInit: true` plus a migration step (SP3).
4. Mastra CLI telemetry (PostHog) is on by default in local dev. The image disables it; a developer can set `MASTRA_TELEMETRY_DISABLED=1`.

## Review fixes (Quality CHANGES_REQUIRED)

Commits: `d5a78ee` refactor(services): share env issue mapper and guard env key collisions; `745bcd2` fix(mastra): allowlist local cors origins and configure process logger; plus the docs commit that adds `follow-ups.md` and this section.

1. **Process logger at boot.** `src/mastra/process-log-context.ts` adds `configureMastraProcessLogger(env)`, which calls `configureProcessLogger({ service: "mastra", env: env.APP_ENV })`. `src/mastra/index.ts` calls it before `new Mastra` (decision `app/docs/decisions/0002`).
   - The test reads the context back through `readProcessLogContext`, now exported from `@core/services`.
   - It saves and restores the global holder, as the services test does.
2. **Local CORS allowlist.** The new env var `MASTRA_CORS_ORIGINS` is a comma-separated list of origins, each checked with `z.url()`, so `*` is rejected.
   - The default is `http://localhost:3000,http://localhost:1420,tauri://localhost,http://tauri.localhost`, applied with `.prefault` so the default goes through the same split and validation as any input.
   - In local, `cors` is `{ origin: ["http://localhost:${PORT}", ...MASTRA_CORS_ORIGINS], credentials: false }`. Outside local it is `false`, and the variable is ignored.
   - Verified in the image under `APP_ENV=local`: a preflight from `http://evil.example` gets 204 with **no** `access-control-allow-origin`, and one from `http://localhost:3000` gets `access-control-allow-origin: http://localhost:3000`. In `mastra dev`, the Studio origin `http://localhost:4111` is echoed back.
3. **`follow-ups.md`** created with three items: PostgresStore auto-init versus `disableInit` plus a least-privilege role (SP3); the nested `pnpm install` in `mastra build` (SP3/deploy); and the Cloud SQL socket DSN rejected by `DATABASE_URL`. I verified the third: `postgresql://svc@/app?host=/cloudsql/...` fails with `invalid_format`.
4. **Minor fixes**
   - **`.env.example`:** now lists `# PORT=4111` (commented, with the reason), `MASTRA_CORS_ORIGINS`, `MASTRA_TELEMETRY_DISABLED=1` and `MASTRA_SERVER_TIMEOUT_MS=900000`.
   - **Shared issue mapper:** `toEnvIssues` lives in `shared/env/env-issues.ts`, is exported once, and has its own test. `loadServicesEnv` and `loadServicesEnvWith` both use it.
   - **Web env:** `apps/web/src/web-env.schema.ts` now composes through `loadServicesEnvWith`. Its own copy of the logic is removed, its public names are unchanged, and its tests still pass.
   - **Key collisions:** `loadServicesEnvWith` accepts only a `z.ZodObject`. It throws `EnvKeyCollisionError` (code `ENV_KEY_COLLISION`, a bug per rule `error-handling`) when the app schema redeclares a services key, and a test covers this.
   - **Dockerfile:** the build first copies `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and `.pnpmfile.cjs`, then runs `RUN pnpm fetch`, then `COPY . .` and `pnpm install --offline --frozen-lockfile --filter "@core/mastra..."`. `docker build` passed, and the image serves `/health` with 200.
   - **Timeout:** the default is now 15 min (900 000 ms), still configurable and capped at 3 600 000.
   - **Test cast removed:** `createTimestampMixin(now)` is exported and tested directly, so the `undefined as never` cast is gone.
5. **Found while verifying:** running `pnpm -F mastra dev` after `pnpm -F mastra build` failed with "Stripping types is currently unsupported for files under node_modules". The build's `.mastra/output/node_modules` (the packed `@core/services` tarball) shadowed the workspace source. The `dev` script now removes `.mastra` first, and build followed by dev now serves `/health` with 200.

Verify:

```
$ pnpm turbo run lint typecheck test --filter=@core/mastra --filter=@core/services --filter=@core/web
@core/services Tests 40 passed · @core/mastra Tests 14 passed · @core/web Tests 9 passed
 Tasks:    9 successful, 9 total
$ docker build -f apps/mastra/Dockerfile -t core-mastra:sp0 .   -> ok (fetch layer, offline install)
$ docker run ... core-mastra:sp0; curl localhost:8081/health     -> {"success":true} 200 (container stopped)
$ git diff --quiet main -- .contexts .claude && echo framework-ok -> framework-ok
```

Note: the image was built from the working tree, which contained Task 9's uncommitted lockfile and workspace changes. The build passed with them.

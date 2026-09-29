# Spike: Mastra server (SP0 Task 8)

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned (catalog) | Note |
|---|---|---|---|
| @mastra/core | 1.71.0 | 1.71.0 | matches `MEMORY.md`; peer `zod ^3.25 \|\| ^4`, engines `>=22.13` |
| mastra (CLI) | 1.31.3 | 1.31.3 | depends on `@mastra/deployer ^1.71.0` and `@mastra/loggers ^1.3.2`, which resolve to 1.71.0 and 1.3.2, the same release train, so no override was needed |
| @mastra/pg | 1.27.1 | 1.27.1 | peer core `>=1.68 <2` |
| @mastra/loggers | 1.3.2 | 1.3.2 | pino 10 |
| @mastra/observability | 1.18.1 | 1.18.1 | |
| @mastra/memory | 1.32.1 | not installed | SP3 (YAGNI) |
| @mastra/evals, @mastra/auth-firebase | — | not adopted | spec §16.1/§16.2 |

All were published on 2026-09-29. Unlike Next 16.3.7, pnpm 12 did not ask for `minimumReleaseAgeExclude` entries.
The deployer's `esbuild@0.28.2` build script is denied (`allowBuilds: esbuild: false`) because the optional platform package ships the binary.

## Facts verified in the installed code

- **Health path:** the path is `GET /health`, outside `apiPrefix` (`/api`). It returns `200 {"success":true}` in dev and in the build, it is unauthenticated, and it is registered by `@mastra/deployer` (`dist/server/index.js`). It is Mastra's own shape, not the `api.md` envelope, and it is fine for a Cloud Run startup/liveness probe.
- **Host/port:** the server binds `server.host ?? MASTRA_HOST`. Without either, Node gets no hostname, and the logs say `localhost`. The port is `server.port ?? PORT ?? 4111`. Spec §16.3 holds: containers need `MASTRA_HOST=0.0.0.0`.
- **Timeout:** the default is `server.timeout ?? 180 * 1e3` (ms), applied through Hono's `timeout()` middleware to every route. It is set here to `MASTRA_SERVER_TIMEOUT_MS`, which defaults to and is capped at 3 600 000 (Cloud Run's 60 min request ceiling).
- **CORS:** with no config the default is `origin: '*'` (verified with a preflight from `http://evil.example` under `APP_ENV=local`). With `cors: false` there is no CORS middleware, and the preflight returned 404 without `access-control-*` headers (verified under `APP_ENV=staging`).
- **Studio:** `mastra dev` serves Studio at `http://localhost:4111/`. `mastra build` bundles Studio only with `--studio`. Without the flag, `/` in the image serves a plain "Mastra Server" page, and `/swagger-ui` returns 404 because `build.swaggerUI`/`openAPIDocs` stay false.
- **`ServerConfig` type:** it is not exported by `@mastra/core/server` 1.71.0. It is derived as `NonNullable<Config["server"]>` from `@mastra/core/mastra`.
- **PinoLogger:** it pretty-prints by default (`prettyPrint: true`). The options used here are:
  - `prettyPrint: false` and `messageKey: "message"`;
  - `formatters.level`, which emits the level as a label;
  - `formatters.bindings`, which replaces pid/hostname with `service` and `env`;
  - `mixin`, which adds an ISO `timestamp`.

  Pino still adds its numeric `time`, and the wrapper exposes no option to drop it. Sample line from the image:
  `{"level":"info","time":1790716327502,"service":"mastra","env":"local","timestamp":"2026-09-29T21:12:07.502Z","url":"http://0.0.0.0:8081/api","message":"Mastra API running"}`
- **Observability:** `new Observability({ configs: { default: { serviceName, exporters: [new MastraStorageExporter()] } } })`. `sensitiveDataFilter` defaults to `true` (auto-applied `SensitiveDataFilter`). The top-level `default: { enabled }` form is deprecated.

## Storage schema behavior

- `PostgresStore({ id, connectionString, schemaName: "mastra" })` creates its tables on first use unless `disableInit: true` is set.
- After `mastra dev` booted, `\dt mastra.*` listed **43 tables** in schema `mastra` (`mastra_messages`, `mastra_ai_spans`, `mastra_schedules`, `mastra_skills`, ...), owned by `app`. No `mastra_*` table landed in `public`.
- The schema already exists (`infra/postgres/init/001-schemas.sql`).
- Remote environments should consider `disableInit: true` plus an explicit `storage.init()` migration step with a DDL-capable role, so the runtime user needs no DDL. This is not done here.

## Build output

- `mastra build` does the following:
  - packs workspace deps (`@core/services`, `@core/contracts`) as tarballs into `.mastra/output/workspace-module/`;
  - bundles with rollup and esbuild into about 4.3 MB of `.mjs`;
  - writes a `package.json` with exact deps plus `pnpm-workspace.yaml` and `.npmrc`;
  - runs `pnpm install` inside `.mastra/output`.
- `.mastra/output` is 183 MB on Windows and 194 MB in the image. The image `core-mastra:sp0` is 105 MB compressed (`docker image inspect .Size`) and 500 MB as shown by `docker images`.
- **Heaviest runtime items:** `@mastra/core` (75 MB) and **TypeScript 7.0.2 with its native binary (27 MB)**. `typescript` is in the deployer's `GLOBAL_EXTERNALS`, and a dynamic import inside core pulls it in. It is unused at runtime by this app, but the deployer adds it anyway.
- The packed tarballs contain the whole package folder, because the packages declare no `files` field. The `.dockerignore` excludes `*.test.ts`, so tests do not reach the image.

## Container

- `node:26-alpine`, multi-stage; pnpm installed with `npm install -g pnpm@12.6.0` (no corepack on Node 25+).
- The build context is `app/`. The build runs `pnpm install --frozen-lockfile --filter "@core/mastra..."` and then `pnpm --filter @core/mastra build`.
- The runtime stage copies only `.mastra/output` and runs as `USER node` (uid 1000). Env is `NODE_ENV=production`, `MASTRA_HOST=0.0.0.0`, `PORT=8081`, `MASTRA_TELEMETRY_DISABLED=1`; `CMD node index.mjs`.
- `docker run -p 8081:8081` on the compose network `core_default` with `DATABASE_URL=...@postgres:5432/app` gave `/health` 200.
  - I used the compose network instead of `host.docker.internal`, because `postgres` is already an allowed local database host in `ServicesEnvSchema`. `host.docker.internal` would fail the "local must use the local Postgres" refinement.
- Fail-fast: `docker run -e APP_ENV=prod` exits with `InvalidEnvError: invalid environment: FIREBASE_PROJECT_ID (INVALID_TYPE), DATABASE_URL (INVALID_TYPE)`, which names the variables and never their values.

## Against spec §16.3

Everything checked matches the spec: `MASTRA_HOST` default, 180 s timeout, CORS toggle, Studio only in dev, and pnpm through npm.

Additions:
1. The health route is `/health` with body `{"success":true}`.
2. The build pulls TypeScript 7 into the runtime.
3. `ServerConfig` is not exported.
4. `mastra build` runs a nested `pnpm install`, so the build stage needs registry access.

Not verified here (Cloud Run only): scheduler behavior with CPU throttling, `min-instances`, IAM `X-Serverless-Authorization`, and the Cloud SQL socket path.

Mastra CLI telemetry (PostHog) is on by default. The image sets `MASTRA_TELEMETRY_DISABLED=1`; locally it stays on unless the developer sets it.

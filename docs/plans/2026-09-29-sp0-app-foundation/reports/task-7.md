# SP0 — Task 7 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `85489c7` feat(services): add health route handler with logger and error boundary
- `2e64cb0` fix(services): share process log context across module instances
- `0158bd1` feat(web): scaffold next app with v1 health endpoint
- this report and the progress line go in a follow-up `docs(web)` commit

## Contexts read

`.claude/skills/using-ddc/SKILL.md`, `.claude/skills/next-16/SKILL.md`; plan header, Global Constraints, Task 7;
spec §3, §14, §16.1–16.3; `stacks/frontend/next@16.md`, `stacks/language/typescript@7.md` (Next + TS 7 section),
`contracts/api.md` §5, §6, `contracts/secrets.md` §5.2–5.4, §17, `rules/observability.md` (structured logging,
correlation, health checks), `rules/error-handling.md` §13, `architecture/hexagonal.md` (layout, Next integration).
The `api` skill was not opened separately; api.md §5–6 was read directly.

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned | Where |
|---|---|---|---|
| next | 16.3.7 | 16.3.7 | web |
| react / react-dom | 19.3.0 | 19.3.0 | web |
| @types/react / @types/react-dom | 19.3.0 | 19.3.0 | web dev |
| @types/node (24 line) | 24.19.0 | 24.19.0 | web dev, named catalog `node24` (spec §14/§16.3) |
| @next/eslint-plugin-next | 16.3.7 | 16.3.7 | web dev; no ESLint peer, ships flat configs → OK on ESLint 9.39.5 (E3) |
| server-only | 0.0.1 | 0.0.1 | web (`src/env.ts`) |
| ulid | 3.0.2 | 3.0.2 | services (no dependencies) |

`@next/env` was measured and tried, then dropped (see Deviations). `next@16.3.7` peers are React `^18.2 || ^19`, engines `>=20.9`.

## What was built

### `@core/services`

- `shared/observability/logger.ts`: `createLogger({ context, sink?, now? })` returns `debug|info|warn|error(message, fields)`.
  - Every record has `timestamp, level, message, service, env`, plus caller fields such as `requestId`, `traceId`, `durationMs` and `status`.
  - `err` is serialized to `{ name, message, stack }`.
  - Base fields are written last, so a caller field can never override them.
  - The default `jsonLineSink` writes one JSON line through `console.log`, or `console.error` for level `error`. It is the only console call site, with a commented eslint-disable.
- `shared/observability/process-logger.ts`: `configureProcessLogger(context)` and `processLogger`. The context is held on `globalThis[Symbol.for(...)]` (see Concerns).
- `shared/observability/request-id.ts`: `REQUEST_ID_HEADER = "x-request-id"` and `resolveRequestId(incoming)`. It keeps a valid `RequestIdSchema` (`z.ulid()`, from `@core/contracts`) and otherwise generates a new ULID.
- `shared/http/error-envelope.ts`: `errorResponse({ status, code, message, details?, requestId })` builds the api.md §6 envelope, with `x-request-id` and `cache-control: no-store`.
- `shared/http/route-boundary.ts`: `withRouteBoundary({ operation, logger }, handler)`. It:
  - resolves the request id and times the call;
  - logs `<operation>_ok` once, with `status` and `durationMs`;
  - catches unexpected throws, logs `<operation>_failed` with `err`, and returns a generic 500 `INTERNAL_ERROR` that never contains the cause.
- `platform/adapters/driving/health-route-handler.ts`: `makeHealthRouteHandler({ logger })` plus `GET` (bound to `processLogger`). It returns `200 {"data":{"status":"ok"}}` with `cache-control: no-store`.
- New subpath export `@core/services/platform/health-route-handler`. The index adds `createLogger`, `configureProcessLogger`, `REQUEST_ID_HEADER`, `resolveRequestId` and log types. `@core/contracts` (workspace) and `ulid` are now dependencies.

### `app/apps/web` (`@core/web`; `pnpm -F web …` matches it)

- engines `>=24.0.0 <27`. Scripts: `dev`, `build`, `start`, `lint` (`eslint .`), `typecheck` (`next typegen && tsc --noEmit`, on TS 7.0.2), `test` (`vitest run`).
- `next.config.ts` sets:
  - `cacheComponents: true`, `typedRoutes: true`, `poweredByHeader: false`, `reactStrictMode`;
  - `transpilePackages` for `@core/contracts` and `@core/services`;
  - `turbopack.root` = `app/`;
  - loads `app/.env.local` with `process.loadEnvFile` when the file exists.
- `src/proxy.ts` (named `proxy` export, matcher excludes `_next/static|_next/image|favicon.ico`) keeps or assigns the ULID, forwards it on the request headers and echoes it on the response.
- `src/web-env.schema.ts`: `loadWebEnv` composes `loadServicesEnv` with `NEXT_PUBLIC_APP_URL` and reports the issues of both schemas in one `InvalidEnvError`. `src/env.ts` (`import "server-only"`) exports `env = loadWebEnv(process.env)`.
- `src/instrumentation.ts`: `register()` dynamically imports `./env`, so an invalid env fails the boot, and calls `configureProcessLogger({ service: "web", env: env.APP_ENV })`. Because the import is dynamic, `next build` needs no runtime env (verified: build passes with no `.env.local`).
- `src/app/layout.tsx` (`lang="en"` until SP2 i18n), `src/app/(app)/page.tsx` (empty `<main />`, no copy), and `src/app/v1/health/route.ts`, which contains only `export { GET } from "@core/services/platform/health-route-handler"`.
- ESLint: `createCoreConfig` (boundaries: web is element `app`) plus `nextPlugin.configs["core-web-vitals"]`. tsconfig extends `@core/config/tsconfig/bundler.json`, with the `next` plugin, `@/*` paths, `allowJs`/`checkJs` for the config files, and `next-env.d.ts` plus `.next/types` included. `next-env.d.ts` is gitignored because `next typegen` or `next build` regenerate it.
- Boundaries probe (temporary files, not committed):
  - services → `apps/web` file: `boundaries/dependencies` error;
  - web → `@core/services`: clean.

### Workspace

- Catalog gains the pins above and a named catalog `node24` for `@types/node@24.19.0`.
- pnpm 12 auto-added `minimumReleaseAgeExclude` for `next@16.3.7` and `@next/*@16.3.7`, which were published today and are younger than the release-age window. They are kept, with a comment saying to drop them once they age out.

## TDD

- services red: 5 files failed with `Cannot find module './logger.ts' | './request-id.ts' | './error-envelope.ts' | ...`. Green: 7 files, 30 tests.
- web red: `Cannot find module './proxy'` and `'./web-env.schema'`. Green: 2 files, 5 tests.
- Runtime bug caught by the real server and not by unit tests: logs showed `service: "unknown"`. The regression test `shares the context with a separately loaded module instance` (`vi.resetModules()`) covers it.

## Verify output

```
$ cd app && pnpm -F @core/services test
 Test Files  7 passed (7)
      Tests  30 passed (30)

$ pnpm -F web build
▲ Next.js 16.3.7 (Turbopack)
- Cache Components enabled
✓ Compiled successfully
  Running TypeScript ... Finished TypeScript
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /v1/health
ƒ Proxy (Middleware)
(0 warnings)

$ pnpm -F web start -p 3100        # port 3000 was taken by an unrelated process (not touched)
$ curl -si -H "x-request-id: 01K6BZ3YQ8X4M7N2P5R9T0V1W2" localhost:3100/v1/health
HTTP/1.1 200 OK
x-request-id: 01K6BZ3YQ8X4M7N2P5R9T0V1W2
cache-control: no-store
content-type: application/json
{"data":{"status":"ok"}}
$ curl -si -H "x-request-id: evil-value" localhost:3100/v1/health
HTTP/1.1 200 OK
x-request-id: 01M3QEQDQ2BR1MG4S6MG2KX088
{"data":{"status":"ok"}}
$ curl -s -o /dev/null -w "%{http_code}" localhost:3100/     -> 200
server log:
{"requestId":"01K6BZ3YQ8X4M7N2P5R9T0V1W2","status":200,"durationMs":0,"timestamp":"2026-09-29T20:47:00.238Z","level":"info","message":"health_checked_ok","service":"web","env":"local"}
(server stopped afterwards; port 3100 free)

Fail-fast check: before the env loader was fixed, `next start` refused to serve (every route 500) and logged
InvalidEnvError: invalid environment: APP_ENV (INVALID_VALUE), FIREBASE_PROJECT_ID (INVALID_TYPE), DATABASE_URL (INVALID_TYPE), NEXT_PUBLIC_APP_URL (INVALID_TYPE)
The message contains names only, never values.

$ pnpm turbo run lint typecheck test --force
@core/services:test  Tests 30 passed · @core/web:test Tests 5 passed
@core/contracts:test Tests 46 passed · @core/config:test Tests 2 passed
 Tasks:    12 successful, 12 total
$ pnpm contracts:check   -> contracts:check ok (1 contracts, 5 files)
$ pnpm install --frozen-lockfile   -> ok

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and notes

- **Package name** is `@core/web`, consistent with the other packages. `pnpm -F web` still selects it, so the plan command works unchanged.
- **Env file location:** Next reads env files only from `apps/web`. `next.config.ts` loads the workspace `app/.env.local` with Node's `process.loadEnvFile`, which never overrides variables already set (verified). `@next/env`'s `loadEnvConfig` was tried and dropped: it caches the first load (Next's own, for `apps/web`), so a second call is a silent no-op unless `forceReload` is passed, and `forceReload` resets `process.env`.
- **Local `.env.local` created** as a copy of `.env.example` (gitignored, placeholders only) to run the server.
- **Health is liveness and unauthenticated.** Spec §16.2 says `/v1` accepts only Bearer. Health is the explicit exception: `rules/observability.md` allows it because it checks nothing and exposes no version or config. Readiness (dependency checks) is not built.
- **Success envelope** has no `meta.requestId`/`respondedAt`: the plan's verify requires exactly `{"data":{"status":"ok"}}`. The request id travels in `x-request-id`.
- **Logger through `console`:** writing to `process.stdout` produced Turbopack Edge-runtime warnings, because proxy and instrumentation are also analyzed for Edge. `console` is runtime-agnostic, and `no-console` stays enforced everywhere else.
- **No tracing yet:** no OTel, `traceId` or `traceparent`; `traceId` is only a typed optional log field. `instrumentation.ts` exists, so OTel can be added there later.
- Tailwind and shadcn were not added (SP2).

## Concerns

1. **Process-wide logging state.** `configureProcessLogger` writes `globalThis[Symbol.for("@core/services/process-log-context")]`. This is a deliberate exception to "no hidden global state". Route modules are loaded through a re-export and cannot receive the validated env by constructor, and Turbopack gives instrumentation and routes separate module instances, so a plain module variable was proven not to work (the logs showed `unknown`). Before the boot hook runs, logs carry `service/env: "unknown"`. An alternative for review: a web-side composition module that route files re-export from (`export { GET } from "@/composition/..."`), which would bend "route.ts only re-exports the adapter".
2. **Header `x-request-id` versus doctrine:** observability.md says not to use `X-Request-ID` as a substitute for trace context. Here it is only the correlation id, which api.md and the brief ask for. W3C `traceparent` remains the job of OTel (not done).
3. `next typegen` in `typecheck` writes `.next/types` and `next-env.d.ts`. Turbo declares no outputs for `typecheck`, which is fine because the files are regenerated on every run.
4. The `minimumReleaseAgeExclude` entries for Next 16.3.7 should be removed once the release is older than pnpm's window.

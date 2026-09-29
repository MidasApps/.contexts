# SP0: Task 9 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `4d25e1b` feat(functions): scaffold gen2 functions on nodejs24
- The `@core/services` index exports this task needs (`errorResponse`, `withRouteBoundary`, `LogRecord`, `LogSink`, `ErrorDetail`, `ErrorEnvelope`, `RouteContext`, `RouteHandler`) were written by this task. They landed inside the concurrent Task 8 review commit `d5a78ee` (see Concerns).
- This report and the progress line go in a follow-up `docs(functions)` commit.

## Contexts read

- Skills: `.claude/skills/using-ddc/SKILL.md`, `.claude/skills/firebase-functions/SKILL.md`.
- Plan: header, Global Constraints, Task 9.
- Previous reports: tasks 1-2, 5-6, 7, 8.
- Spec: §2 D5, §11.
- Doctrine: `stacks/backend/firebase-functions.md`, ADR 0004 (E1), `rules/observability.md`, `contracts/secrets.md` §5.4, `rules/testing.md`, `contracts/api.md` §6.
- Local decision: `app/docs/decisions/0003-public-liveness-endpoint.md`.
- Facts about `firebase-tools` 15.32.0 were read in its installed code:
  - `deploy/functions/runtimes/node/*`: runtime choice, the `.bin` lookup, the package.json check;
  - `functions/env.js`: `.env` files, `configDir`, reserved `FIREBASE_` prefix;
  - `emulator/functionsEmulator.js`: the runtime env includes `process.env`;
  - `deploy/lifecycleHooks.js`: hooks run in the project dir through cross-env-shell.

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned (catalog) | Where |
|---|---|---|---|
| firebase-functions | 7.4.0 | 7.4.0 | functions `dependencies` (external) |
| firebase-admin | 14.5.0 | 14.5.0 | functions `dependencies` (required peer of firebase-functions, `^11–^14`) |
| esbuild | 0.28.2 | 0.28.2 | functions dev; the same version was already in the lockfile (vite/mastra) |
| @types/node | 24.19.0 | `catalog:node24` | functions dev (E1) |

The optional peers of firebase-functions (graphql, @apollo/server, @as-integrations/express4) are not installed.

## What was built

`app/apps/functions` (`@core/functions`; `pnpm -F functions` selects it). engines `>=24.0.0 <25`, ESM, `main: lib/index.js`.

| File | Role |
|---|---|
| `src/index.ts` | Composition root. `setGlobalOptions({ region, maxInstances: 10 })`, then exports `healthz = onRequest({ invoker: "public", memory: "256MiB", timeoutSeconds: 10, concurrency: 80 }, …)`. |
| `src/functions-options.ts` | `FUNCTIONS_REGION = "southamerica-east1"` (LGPD guidance of the stack doc; a constant because changing the region means new function names) and `DEFAULT_MAX_INSTANCES`. |
| `src/healthz-handler.ts` | `makeHealthzHandler({ logger })`. GET goes to the shared `makeHealthRouteHandler`, the same contract as web `/v1/health` (decision 0003). Any other method gets 405 `METHOD_NOT_ALLOWED` in the api.md §6 envelope with `Allow: GET`, through the shared `withRouteBoundary` (log line `health_method_rejected_ok`, `status: 405`). |
| `src/http/express-web-bridge.ts` | `toWebRequest` and `serveWebHandler` turn the Express req/res that `onRequest` passes into fetch `Request`/`Response`, so the shared web handlers run unchanged. The bridge uses structural types, so Express is not needed in tests. |
| `src/observability/firebase-log-sink.ts` | A sink for the shared `createLogger` that writes through `firebase-functions/logger` `write()`, the only channel the stack doc allows. It adds `severity` (DEBUG, INFO, WARNING, ERROR), and the record keeps `timestamp`, `level`, `message`, `service: "functions"`, `env`, `requestId` and `durationMs`. |
| `src/functions-env.schema.ts`, `src/env.ts` | Zod env with only `APP_ENV` (reuses `ServicesEnvSchema.shape.APP_ENV`). It throws `InvalidEnvError` with names only. `env.ts` is the only reader of `process.env`. |
| `apps/functions/.env.demo-core` | `APP_ENV=local`. Firebase's per-project, non-secret config, loaded by the emulator for `demo-core`. It is whitelisted in `.gitignore`. |
| `build.ts` | Bundles into `lib/`. See the deploy section below. |
| `turbo.json` | Extends the root config; `build` has `cache: false`. |
| `vitest.config.ts` | Projects `unit` and `emulators`. The emulators project uses a 30 s timeout to cover the emulator worker's cold start. |

### Deploy approach (workspace and catalog protocols)

`firebase deploy` uploads `functions.source` and runs `npm install` on its package.json in Cloud Build. firebase-tools 15.32.0 has no pnpm workspace support, and npm rejects both `workspace:` and `catalog:`. So the committed package.json can never be the deploy manifest. The chosen approach:

1. **Bundle.** `node build.ts` bundles `src/index.ts` into `lib/index.js` (ESM, `node24`, with a source map). Workspace packages (`@core/services`, `@core/contracts`) and other devDependencies (zod, ulid) are inlined. Only the `dependencies` (firebase-functions, firebase-admin) stay external.
   - **Rule:** a package the bundle inlines is a devDependency; `dependencies` means "installed by npm at deploy".
2. **Deploy manifest.** `lib/package.json` lists those externals at the exact versions pnpm installed from the catalog. `build.ts` asserts that each is an exact semver.
3. **Local link.** `lib/node_modules` is a junction/symlink to `apps/functions/node_modules`.
   - The emulator and deploy analysis look for `node_modules/.bin/firebase-functions` under the source dir; the pnpm store has no `.bin` at that level.
   - Firebase ignores `node_modules` when uploading.
   - The build unlinks it before cleaning `lib/`, so the recursive delete never walks into it.
4. **`firebase.json`** `functions[0]`:
   - `source: "apps/functions/lib"`;
   - `configDir: "apps/functions"`, so `.env.<projectId>` files stay versioned next to the code and not in the generated folder;
   - `codebase: "default"`, `runtime: "nodejs24"`;
   - `predeploy: pnpm turbo run build --filter=@core/functions`.
5. **Build caching.** Turbo's `build` for functions is `cache: false`, because a cache restore would not recreate the link. esbuild takes under 1 s.

**Evidence that the manifest deploys:**

- `lib/{index.js,package.json}` were copied to a scratch folder with no workspace. Plain `npm install` succeeded.
- `APP_ENV=staging node -e "import('./index.js')"` exported `healthz` with this endpoint: `{"platform":"gcfv2","region":["southamerica-east1"],"maxInstances":10,"availableMemoryMb":256,"timeoutSeconds":10,"concurrency":80,"httpsTrigger":{"invoker":["public"]}}`.
- Without `APP_ENV`, the import failed with `InvalidEnvError`.
- A real `firebase deploy` was not run, because there is no remote project in SP0.

### Engines and engineStrict

`pnpm install` on Node 26 with `engineStrict: true` accepted the workspace project that declares `>=24.0.0 <25`. pnpm checks `engines` for installed dependencies, not for workspace importers, so no per-package workaround was needed and engineStrict stays global.

The emulator warns `requested "node" version "24" doesn't match your global version "26". Using node@26 from host`. The deployed runtime is nodejs24, set by `firebase.json`, which wins over `engines` for firebase-tools. The code uses no Node 26-only API, and the bundle targets node24.

### Workspace wiring

- **Catalog:** adds `esbuild`, `firebase-admin` and `firebase-functions`.
- **Root `test:emulators`:** it now builds functions first and adds `functions` to `--only`:
  `turbo run build --filter=@core/functions && firebase emulators:exec --only auth,firestore,functions,storage "turbo run test:emulators"`.
  The emulator loads `lib/` at start, so the build must come first.
- **Turbo tasks:** `test`, `test:emulators`, `lint` and `typecheck` use the root task definitions, like services.

## TDD

- **Red:** 4 unit files failed with `Cannot find module './functions-env.schema.ts' | './firebase-log-sink.ts' | './express-web-bridge.ts' | './healthz-handler.ts'`.
- **Green:** 4 files, 17 tests.
- **Emulator test:** `src/healthz.emulator.test.ts` covers:
  - GET: 200, `{data:{status:"ok"}}`, `no-store`, and a fresh ULID in `x-request-id`;
  - a valid client request id is kept;
  - POST: 405, the envelope and `Allow: GET`.
- **First emulator run:** all 3 tests timed out at 5 s. The logs showed that every request completed, so this was the worker's cold start on the first boot. A standalone `fetch` probe then answered in 2 s cold and 23 ms warm. The project timeout is now 30 s, and every later run passed.
- **Bug caught by typecheck:** the header test was rewritten when array header values moved from `join` to `append`.
- **Bug caught by `vitest list`:** `defineCoreVitestConfig`'s root `include` leaked unit tests into the `emulators` project (5 files instead of 1). The config is now a plain object, and the reason is in a comment.

## Verify output

```
$ cd app && pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Done in 214ms using pnpm v12.6.0

$ pnpm -F @core/functions build   (the emulator loads lib/, so build first)
$ pnpm exec firebase emulators:exec --only functions "pnpm -F @core/functions test:emulators"
+  functions[southamerica-east1-healthz]: http function initialized (http://127.0.0.1:5001/demo-core/southamerica-east1/healthz).
> {"requestId":"01K6BZ3YQ8X4M7N2P5R9T0V1W2","status":405,"durationMs":0,...,"message":"health_method_rejected_ok","service":"functions","env":"local","severity":"INFO"}
 Test Files  1 passed (1)
      Tests  3 passed (3)
+  Script exited successfully (code 0)

$ curl -i http://127.0.0.1:5001/demo-core/southamerica-east1/healthz   (inside emulators:exec)
HTTP/1.1 200 OK
cache-control: no-store
content-type: application/json
x-request-id: 01M3QH80CF9NNMC0F7M6JG3GH5
{"data":{"status":"ok"}}

$ pnpm test:emulators    (root: build + auth,firestore,functions,storage)
@core/functions:test:emulators  Tests 3 passed (3)
@core/services:test:emulators   Tests 8 passed (8)
 Tasks:    2 successful, 2 total

$ pnpm turbo run lint typecheck test
@core/functions:test Tests 17 passed (17) · @core/services 40 · @core/contracts 46
@core/mastra 14 · @core/web 9 · @core/config 2
 Tasks:    18 successful, 18 total

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and notes

- **`source` is `apps/functions/lib`, not `apps/functions`.** The brief asked for `apps/functions`, but the committed package.json uses `catalog:` and `workspace:`, which Cloud Build's npm cannot install. `configDir` keeps env files in `apps/functions`.
- **Test location:** the plan names `src/healthz.test.ts`. It is `src/healthz.emulator.test.ts`, following the suffix convention from Tasks 5-6. The unit tests are separate files.
- **Functions env does not compose the services env.** Firebase reserves the `FIREBASE_` prefix in Functions `.env` files, so `FIREBASE_PROJECT_ID` could never be set there, and healthz needs no Postgres. The first function that needs the database should decide how to supply it: a defineSecret for `DATABASE_URL`, with the project id taken from the runtime's `GCLOUD_PROJECT`.
- **D5:** Functions are for events, jobs and webhooks. `healthz` is only the codebase's smoke probe and follows decision 0003. It is not product API.
- **Log line for 405:** `health_method_rejected_ok` (`_ok` comes from the shared boundary's naming). It is logged at info with `status: 405`.
- **Express adds `x-powered-by: Express` and `etag`** in the emulator (and in Gen 2). They are harmless for liveness; removing them needs an Express app wrapper, which is not worth it for this probe.
- **No `firebase-admin` initialization.** healthz does not use it; it is installed because firebase-functions requires it as a peer.

## Concerns

1. **Commit attribution:** the `@core/services` index exports written for this task were committed inside the concurrent agent's `d5a78ee refactor(services): …`, because it staged the whole `index.ts`. The content is correct and all tests pass, but that commit's message does not mention them. The commit was not rewritten.
2. **`lib/node_modules` link:** `git clean -fdx` on Windows might follow the junction into `apps/functions/node_modules`. Only installed dependencies are at risk, and `pnpm install` restores them.
3. **Deploy resolves transitive dependencies fresh:** `lib/` has no lockfile, so Cloud Build's npm resolves transitive dependencies of firebase-functions and firebase-admin at deploy time. The direct dependencies are exact. Generating a `package-lock.json` in `build.ts` would close this (SP deploy work).
4. **Local ADC warning:** the emulator prints "Application Default Credentials detected. Non-emulated services will access production". This is harmless for the `demo-core` project, which cannot reach real services, but developers should know about it.
5. The emulator runs the functions on host Node 26 while production runs Node 24 (E1). CI should also run the emulator tests on Node 24, or at least keep the `node24` target of the bundle.

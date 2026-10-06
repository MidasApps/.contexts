# SP0 — Tasks 5 and 6 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `abd1602` chore(workspace): harden gitignore and opt out of turbo agents file (review follow-ups from Tasks 1–2)
- `4256cdc` build(firebase): add emulator suite and deny-by-default rules (Task 5)
- `682c809` build(workspace): add local postgres with pgvector and typed env (Task 6)
- this report and the progress lines go in a follow-up `docs(workspace)` commit

## Contexts read

`.claude/skills/using-ddc/SKILL.md`; the plan header, Global Constraints, and Tasks 5–6; spec §3, §4, §11, §16.1, §16.2, §16.4;
`stacks/database/firebase-firestore.md` (Security Rules, local dev), `contracts/firebase-firestore.md` §7, §19, §20,
`stacks/backend/firebase-functions.md` (emulators), `stacks/database/postgres.md` (version, extensions, drivers),
`stacks/database/pgvector.md`, `contracts/pgvector.md` §1, `contracts/secrets.md` §5, §13, `processes/environments.md` §5, §9,
`rules/testing.md` §13.

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned (catalog) | Where |
|---|---|---|---|
| firebase-tools | 15.32.0 | 15.32.0 | root devDependency, `pnpm exec firebase` |
| @firebase/rules-unit-testing | 5.0.2 | 5.0.2 | `@core/services` dev |
| firebase | 12.19.0 | 12.19.0 | `@core/services` dev (rules-unit-testing peer `^12`) |
| postgres (porsager) | 3.4.9 | 3.4.9 | `@core/services` dev; recommended driver in `stacks/database/postgres.md` |

Image `pgvector/pgvector:0.8.6-pg18`: extension `vector` 0.8.6, asserted by the test.

## Review follow-ups (Tasks 1–2)

- `app/.gitignore` now also covers `.env`, `.env.*` (with `!.env.example`), `coverage/`, `*.tsbuildinfo`, `*-debug.log`, `firebase-debug.log`, `ui-debug.log`, `playwright-report/`, and `test-results/`. The emulator's `firestore-debug.log` is ignored as a result.
- `"agentGuidance": false` in `app/turbo.json`. The key was checked against the installed turbo 2.11.5 in `schema.json` and `docs/reference/configuration.mdx`, which describe it as root-only with default `true`. `app/AGENTS.md` was deleted, and `turbo run` no longer recreates it.

## Task 5: Firebase Emulator Suite

- `app/firebase.json`: the emulators run on 127.0.0.1 with `singleProjectMode: true` and these ports:

  | Emulator | Port |
  |---|---|
  | auth | 9099 |
  | firestore | 8080 |
  | functions | 5001 |
  | storage | 9199 |
  | pubsub | 8085 |
  | eventarc | 9299 |
  | ui | 4000 |

  Rules and indexes are wired in. `app/.firebaserc` sets default `demo-core`.
- `firestore.rules` and `storage.rules` (`rules_version = '2'`) deny every read and write through `match /{document=**}` and `match /{allPaths=**}`. `firestore.indexes.json` is empty.
- `@core/services` (`app/packages/services`) is a new package that follows the `contracts` pattern: `@core/config` tsconfig `nodenext`, ESLint and Vitest presets, and `exports["."] = ./src/index.ts`.
- `src/services/shared/firebase-rules.emulator.test.ts` seeds a Firestore doc and a Storage object with rules disabled. For both an anonymous and an authenticated client (8 tests), it asserts four operations are denied:
  - reading the Firestore doc;
  - writing a Firestore doc;
  - reading the Storage object (`getDownloadURL`);
  - uploading a Storage object.
- TDD: the red run used temporary `if true` rules and failed 8/8 with "Expected request to fail, but it succeeded". The deny-all rules made it green.

### Test separation (decision)

The file suffix encodes the external dependency, and each suffix maps to one Vitest project in `packages/services/vitest.config.ts`:

| Suffix | Project | Script | Needs |
|---|---|---|---|
| `*.test.ts` | `unit` | `pnpm test` (turbo `test`) | nothing |
| `*.emulator.test.ts` | `emulators` | `test:emulators`; root `pnpm test:emulators` wraps turbo in `firebase emulators:exec --only auth,firestore,storage` | Emulator Suite |
| `*.postgres.test.ts` | `postgres` | `test:postgres`; root `pnpm test:postgres` | `docker compose up -d --wait` |

- The projects copy the preset's defaults instead of using `extends: true`. `mergeConfig` concatenates arrays, so with `extends: true` the preset's `include` leaked unit tests into every project; this was observed and then fixed.
- The turbo tasks `test:emulators` and `test:postgres` are `cache: false` and use `passThroughEnv`: the emulator hosts, `FIREBASE_*` and `GCLOUD_PROJECT` for the first, `DATABASE_URL` for the second. Without that, turbo's strict env mode would hide the variables from the tests.
- **Deviation:** the plan names the tests `firebase-rules.test.ts` and `postgres-schemas.test.ts`. The suffixes were added so that separation is a naming convention and not a list of paths.

### Install fixes (Node 26 + engineStrict)

- firebase-tools 15.32.0 depends on `superstatic ^10`, whose `engines` stops at Node 24. superstatic 11 accepts Node 26, but firebase-tools does not accept 11 yet. superstatic only serves the Hosting emulator, which is not used here. `.pnpmfile.cjs` widens `engines.node` for `superstatic@10` only, so `engineStrict` stays on for everything else.
- `allowBuilds` explicitly denies three build scripts, with the reason for each in a comment:
  - `@firebase/util`: it only bakes `FIREBASE_WEBAPP_CONFIG`;
  - `protobufjs`: it only checks its CLI's dependencies;
  - `re2`: an optional native regex for superstatic that falls back to `RegExp`.

## Task 6: Postgres + pgvector and typed env

- `app/docker-compose.yml` runs one service:
  - compose project `core`, service `postgres`, image `pgvector/pgvector:0.8.6-pg18`;
  - port `127.0.0.1:${POSTGRES_PORT:-5432}:5432`; 5432 was free, and the host port can be changed through the env;
  - credentials `${POSTGRES_USER|PASSWORD|DB:-app}`;
  - named volume `postgres-data` at `/var/lib/postgresql`, which is the PG18 image layout;
  - init scripts mounted read-only.

  The healthcheck is `pg_isready -h 127.0.0.1`. It uses TCP on purpose: the init-time server listens only on the socket, so `--wait` does not turn green before the init scripts finish. Compose reads `.env`; to reuse `.env.local`, run `docker compose --env-file .env.local ...`.
- `app/infra/postgres/init/001-schemas.sql` is idempotent: a re-run through `psql -v ON_ERROR_STOP=1` exited 0. It does the following:
  - creates `vector` in `public`;
  - creates the schemas `mastra`, `ai`, and `semantic`, with `semantic` owned by `semantic_owner`;
  - creates the roles `semantic_owner` and `semantic_reader`, both `NOLOGIN NOBYPASSRLS`;
  - runs `REVOKE ALL ON SCHEMA semantic FROM PUBLIC` and grants `semantic_reader` `USAGE`;
  - sets default privileges so views created by `semantic_owner` grant `SELECT` to `semantic_reader`.
- `app/.env.example` contains placeholders only:
  - runtime: `NODE_ENV`, `APP_ENV`, `AI_MODE`;
  - Firebase: `FIREBASE_PROJECT_ID=demo-core` and the four emulator hosts;
  - public web config: `NEXT_PUBLIC_FIREBASE_*` (demo values);
  - Postgres: `POSTGRES_*`, `DATABASE_URL`;
  - AI providers: empty `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`;
  - dev servers: `NEXT_PUBLIC_APP_URL`, `MASTRA_URL`.
- Typed env lives in `src/services/shared/env/services-env.schema.ts`, with `ServicesEnvSchema`, `loadServicesEnv`, and `ServicesEnv` exported from `@core/services`. It follows `secrets.md` §5.4, and each app's `src/env.ts` will compose it later.
  - It declares `APP_ENV`, `FIREBASE_PROJECT_ID`, `DATABASE_URL` (`z.url` with protocol `postgres(ql)`), `AI_MODE` (`real|fake`, default `real`), and the optional emulator hosts (`host:port`).
  - Refinement: `local` requires a `demo-*` project, the Auth and Firestore emulators, and a local database host. Other environments reject emulator hosts and `demo-*` projects.
  - `loadServicesEnv` throws `InvalidEnvError` (code `INVALID_ENV`), whose message lists field names and issue codes, never values.
  - 8 unit tests; TDD red was `Cannot find module`.
- `src/services/shared/postgres-schemas.postgres.test.ts` uses postgres.js with `DATABASE_URL` or the local default (4 tests). It asserts:
  - `vector` extension version 0.8.6;
  - the three schemas exist;
  - both roles have `rolcanlogin=false` and `rolbypassrls=false`;
  - `semantic` is owned by `semantic_owner`;
  - the reader has `USAGE` and no `CREATE`.

  TDD red was `ECONNREFUSED` before the container existed.

## Verify output

```
$ pnpm exec firebase emulators:exec --only firestore,storage "pnpm -F @core/services test:emulators"
 Test Files  1 passed (1)
      Tests  8 passed (8)
+  Script exited successfully (code 0)

$ docker compose up -d --wait
 Container core-postgres-1 Healthy
$ docker compose ps
core-postgres-1   pgvector/pgvector:0.8.6-pg18   Up (healthy)   127.0.0.1:5432->5432/tcp
$ pnpm -F @core/services test:postgres
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ cd app && pnpm turbo run lint typecheck test --force      # no emulators involved
@core/services:test: Tests 8 passed (8)
@core/contracts:test: Tests 46 passed (46)
@core/config:test: Tests 2 passed (2)
 Tasks:    9 successful, 9 total

$ pnpm test:emulators   -> @core/services:test:emulators Tests 8 passed; Tasks 1 successful
$ pnpm test:postgres    -> @core/services:test:postgres  Tests 4 passed; Tasks 1 successful

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

The Postgres container is left running (`core-postgres-1`, volume `core_postgres-data`).

## Deviations and notes

- **Test file names** carry a suffix (`.emulator.test.ts`, `.postgres.test.ts`); see the separation decision above.
- **Commit scope** is `workspace` for Task 6 (the plan says `app`, which the commits rule forbids), following the brief.
- **`postgres` is a devDependency** for now, because only the test uses it. The first Postgres adapter in `@core/services` should move it to `dependencies`.
- **Roles are local-only here.** The init script runs only on an empty local volume. Cloud SQL environments need the same schemas and roles from versioned migrations (SP3), together with the views, `FORCE ROW LEVEL SECURITY`, `statement_timeout`, and the grant that lets the runtime user `SET ROLE semantic_reader`.
- **`FIREBASE_PROJECT_ID`** is the env name chosen for the project id. firebase-admin itself auto-detects `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`, so the app's `src/env.ts` should pass the value explicitly.
- **The functions emulator** is configured, but no `functions` source exists until Task 8+. `emulators:exec` runs with `--only firestore,storage` (plus `auth` in the root script).
- **The rules test converts `UploadTask` to a Promise** with `.then()`, because `UploadTask` is only thenable. A comment explains this.
- **Concurrent work:** another agent committed `8aaf9bd` and `30da2fa` (contracts fixes) between Tasks 5 and 6. Only this task's files were staged.

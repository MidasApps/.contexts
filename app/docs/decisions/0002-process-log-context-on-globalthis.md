# 0002. Process log context lives on `globalThis`

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Deviates from:** rule `ai-friendly-code` ("no global hidden state"), in one confined place

## Context

Every log line carries `service` and `env` (`rules/observability.md`). `env` comes from the app's validated `src/env.ts` (`contracts/secrets.md` §5.4). HTTP driving adapters such as `GET /v1/health` live in `@core/services`. The web `route.ts` only re-exports them (spec §3), so the adapter is a module singleton, and no constructor exists that could receive the validated env.

The web app validates the env and configures logging once, in `src/instrumentation.ts` `register()`. On the real server this first used a plain module variable, and the logs said `service: "unknown"`: Turbopack gives instrumentation and route handlers **separate module instances** of `process-logger.ts`, so what instrumentation wrote never reached the route's copy.

## Decision

- `process-logger.ts` keeps the context on `globalThis` under `Symbol.for("@core/services/process-log-context")`. No other file reads or writes that key.
- `configureProcessLogger(context)` stores a **frozen copy**.
- Each app calls `configureProcessLogger` once at boot, with values from its validated env. The web app does this in `instrumentation.ts`; Mastra does it in its own entry point. Functions does not use it (see the amendment below).
- Until then, records carry `service/env: "unknown"`, and the first record is preceded by one `process_logger_unconfigured` warning, so a missing boot hook is visible.
- Tests build their own logger with `createLogger({ context, sink })`. The global is only for the default `processLogger`.

This is the same pattern as the OpenTelemetry JS global API, which registers its providers on `globalThis` through a versioned symbol for the same reason: several copies of a module in one process.

## Alternatives rejected

- **A web composition root** (`src/composition/*.ts` builds handlers with an injected logger, and `route.ts` re-exports from it). It keeps state out of globals, but it moves wiring into the app, bends "route.ts re-exports the driving adapter", and every app (web, Mastra, Functions) would duplicate the wiring.
- **A plain module variable.** Proven wrong under Turbopack, because of the separate module instances.
- **Reading `process.env` inside `@core/services`.** Only an app's `src/env.ts` may read `process.env`.

## Consequences

- One small, documented piece of mutable process state, with a single writer function.
- Logs are correct wherever the bundler places modules.
- Revisit when OTel lands: `service`/`env` may then come from the OTel `Resource` instead.

## Amendment (2026-09-29): Functions inject a sink instead

`app/apps/functions` does not call `configureProcessLogger` and does not use `processLogger`.

- **Why:** `stacks/backend/firebase-functions.md` makes `firebase-functions/logger` the only log channel in Functions and forbids `console`. The default `jsonLineSink` behind `processLogger` writes through `console`.
- **What instead:** `src/index.ts` is a real composition root, because every exported function is built there. It creates `createLogger({ context: { service: "functions", env: env.APP_ENV }, sink: makeFirebaseLogSink({ write }) })` from the validated env and injects it into the shared handlers (`makeHealthzHandler({ logger })`, `serveWebHandler({ operation, logger }, …)`).
- **Effect:** the record shape is unchanged (`timestamp, level, message, service, env` plus fields); the sink only adds the Cloud Logging `severity`. No process-wide state is involved, so the global holder stays a web and Mastra concern.
